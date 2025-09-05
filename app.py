from flask import Flask, request, render_template, jsonify, send_from_directory
from werkzeug.utils import secure_filename
from PIL import Image, ImageDraw, ImageFont
import openai
import requests
from io import BytesIO
import os
import pathlib
import argparse
import time
import threading
import re
import json
from inky.auto import auto
from inky.inky_uc8159 import CLEAN

# Import your credentials if available
try:
    from credentials import credentials
    openai.api_key = credentials()
except ImportError:
    # If credentials.py doesn't exist, expect API key as environment variable
    openai.api_key = os.getenv('OPENAI_API_KEY')

app = Flask(__name__)

# Configuration
UPLOAD_FOLDER = 'uploads'
PICTURES_FOLDER = 'pictures'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'}
MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16MB max file size
SETTINGS_FILE = 'settings.json'

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = MAX_CONTENT_LENGTH

# Create directories if they don't exist
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(PICTURES_FOLDER, exist_ok=True)

# Global variables for cycling control
cycling_thread = None
cycling_active = False
ai_mode_active = False

# Default settings
default_settings = {
    'cycle_time': 30,  # seconds
    'saturation': 0.5,
    'ai_generation_interval': 300,  # 5 minutes for AI images
    'current_mode': 'manual'  # manual, cycle, ai
}

def load_settings():
    try:
        with open(SETTINGS_FILE, 'r') as f:
            settings = json.load(f)
        # Merge with defaults in case new settings were added
        for key, value in default_settings.items():
            if key not in settings:
                settings[key] = value
        return settings
    except FileNotFoundError:
        return default_settings.copy()

def save_settings(settings):
    with open(SETTINGS_FILE, 'w') as f:
        json.dump(settings, f, indent=2)

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def sanitize_filename(filename):
    """Remove or replace any character that's not allowed in filenames"""
    return re.sub(r'[<>:"/\\|?*]', '_', filename)

def clear_display():
    """Clear the Inky display"""
    try:
        inky = auto(ask_user=False, verbose=False)
        
        for _ in range(2):
            for y in range(inky.height):
                for x in range(inky.width):
                    inky.set_pixel(x, y, inky.WHITE)
            inky.show()
            time.sleep(1.0)
        return True
    except Exception as e:
        print(f"Error clearing display: {e}")
        return False

def display_image_on_inky(image_path, saturation=0.5):
    """Display an image on the Inky display"""
    try:
        inky = auto(ask_user=False, verbose=False)
        
        # Open and resize image
        image = Image.open(image_path)
        resized_image = image.resize(inky.resolution)
        
        # Set image on display
        try:
            inky.set_image(resized_image, saturation=saturation)
        except TypeError:
            inky.set_image(resized_image)
        
        inky.show()
        return True
    except Exception as e:
        print(f"Error displaying image: {e}")
        return False

def get_all_images():
    """Get all image files from upload and pictures directories"""
    images = []
    
    # Get uploaded images
    for filename in os.listdir(UPLOAD_FOLDER):
        if allowed_file(filename):
            images.append(os.path.join(UPLOAD_FOLDER, filename))
    
    # Get AI-generated images
    if os.path.exists(PICTURES_FOLDER):
        for filename in os.listdir(PICTURES_FOLDER):
            if allowed_file(filename):
                images.append(os.path.join(PICTURES_FOLDER, filename))
    
    return sorted(images)

def generate_random_prompt():
    """Generate a random prompt using GPT-3.5"""
    try:
        completion = openai.ChatCompletion.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", 
                 "content": "Create a concise image prompt (max 5 words), specifying art style, subject, and details."
                },
            ]
        )
        return completion.choices[0].message['content']
    except Exception as e:
        print(f"Error generating prompt: {e}")
        return "abstract digital art"

def generate_ai_image():
    """Generate an AI image using DALL-E"""
    try:
        # Generate a random prompt using GPT-3.5
        prompt = generate_random_prompt()
        print("Generated prompt:", prompt)

        # Generate an image from the random prompt
        response = openai.Image.create(
            prompt=prompt,
            n=1,
            size="1024x1024"
        )
        
        # Get the image URL
        image_url = response['data'][0]['url']
        print("Image URL:", image_url)
        
        # Download the image
        image_response = requests.get(image_url)
        image = Image.open(BytesIO(image_response.content))
        
        # Save the image 
        sanitized_filename = sanitize_filename(prompt) + ".png"
        final_image_path = os.path.join(PICTURES_FOLDER, sanitized_filename)
        image.save(final_image_path)
        
        return final_image_path, prompt

    except Exception as e:
        print("Error generating AI image:", e)
        return None, None

def cycling_worker():
    """Worker function for cycling through images"""
    global cycling_active, ai_mode_active
    
    while cycling_active or ai_mode_active:
        settings = load_settings()
        
        if ai_mode_active:
            # AI mode: generate new image
            image_path, prompt = generate_ai_image()
            if image_path:
                display_image_on_inky(image_path, settings['saturation'])
                print(f"Displayed AI image: {prompt}")
            
            # Wait for AI generation interval
            for _ in range(int(settings['ai_generation_interval'])):
                if not ai_mode_active:
                    break
                time.sleep(1)
                
        elif cycling_active:
            # Cycle mode: go through existing images
            images = get_all_images()
            if images:
                for image_path in images:
                    if not cycling_active:
                        break
                    
                    display_image_on_inky(image_path, settings['saturation'])
                    print(f"Displayed: {os.path.basename(image_path)}")
                    
                    # Wait for cycle time
                    for _ in range(int(settings['cycle_time'])):
                        if not cycling_active:
                            break
                        time.sleep(1)
            else:
                print("No images found for cycling")
                break

def start_cycling():
    """Start the cycling thread"""
    global cycling_thread, cycling_active
    
    if cycling_thread and cycling_thread.is_alive():
        return False
    
    cycling_active = True
    cycling_thread = threading.Thread(target=cycling_worker, daemon=True)
    cycling_thread.start()
    return True

def start_ai_mode():
    """Start AI mode"""
    global cycling_thread, ai_mode_active
    
    if cycling_thread and cycling_thread.is_alive():
        return False
    
    ai_mode_active = True
    cycling_thread = threading.Thread(target=cycling_worker, daemon=True)
    cycling_thread.start()
    return True

def stop_all_modes():
    """Stop cycling and AI modes"""
    global cycling_active, ai_mode_active
    cycling_active = False
    ai_mode_active = False

@app.route('/')
def index():
    settings = load_settings()
    return render_template('index.html', settings=settings)

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        
        saturation = float(request.form.get('saturation', 0.5))
        
        # Stop any active cycling/AI mode
        stop_all_modes()
        
        # Display on Inky
        success = display_image_on_inky(filepath, saturation)
        
        # Update settings
        settings = load_settings()
        settings['current_mode'] = 'manual'
        save_settings(settings)
        
        if success:
            return jsonify({
                'message': 'Image uploaded and displayed successfully!',
                'filename': filename
            })
        else:
            return jsonify({'error': 'Failed to display image on device'}), 500
    
    return jsonify({'error': 'Invalid file type'}), 400

@app.route('/url', methods=['POST'])
def display_from_url():
    data = request.get_json()
    url = data.get('url')
    saturation = float(data.get('saturation', 0.5))
    
    if not url:
        return jsonify({'error': 'No URL provided'}), 400
    
    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        
        # Create a filename from the URL
        filename = url.split('/')[-1]
        if not allowed_file(filename):
            filename = 'downloaded_image.jpg'
        
        filename = secure_filename(filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        
        # Save the image
        with open(filepath, 'wb') as f:
            f.write(response.content)
        
        # Stop any active cycling/AI mode
        stop_all_modes()
        
        # Display on Inky
        success = display_image_on_inky(filepath, saturation)
        
        # Update settings
        settings = load_settings()
        settings['current_mode'] = 'manual'
        save_settings(settings)
        
        if success:
            return jsonify({'message': 'Image downloaded and displayed successfully!'})
        else:
            return jsonify({'error': 'Failed to display image on device'}), 500
            
    except Exception as e:
        return jsonify({'error': f'Failed to download image: {str(e)}'}), 500

@app.route('/clear', methods=['POST'])
def clear():
    stop_all_modes()
    success = clear_display()
    
    settings = load_settings()
    settings['current_mode'] = 'manual'
    save_settings(settings)
    
    if success:
        return jsonify({'message': 'Display cleared successfully!'})
    else:
        return jsonify({'error': 'Failed to clear display'}), 500

@app.route('/start_cycle', methods=['POST'])
def start_cycle():
    global cycling_active, ai_mode_active
    
    if cycling_active:
        return jsonify({'error': 'Cycling is already active'}), 400
    
    if ai_mode_active:
        stop_all_modes()
        time.sleep(1)  # Give time for threads to stop
    
    success = start_cycling()
    
    if success:
        settings = load_settings()
        settings['current_mode'] = 'cycle'
        save_settings(settings)
        return jsonify({'message': 'Started cycling through images'})
    else:
        return jsonify({'error': 'Failed to start cycling'}), 500

@app.route('/start_ai', methods=['POST'])
def start_ai():
    global cycling_active, ai_mode_active
    
    if ai_mode_active:
        return jsonify({'error': 'AI mode is already active'}), 400
        
    if not openai.api_key:
        return jsonify({'error': 'OpenAI API key not configured'}), 400
    
    if cycling_active:
        stop_all_modes()
        time.sleep(1)  # Give time for threads to stop
    
    success = start_ai_mode()
    
    if success:
        settings = load_settings()
        settings['current_mode'] = 'ai'
        save_settings(settings)
        return jsonify({'message': 'Started AI image generation mode'})
    else:
        return jsonify({'error': 'Failed to start AI mode'}), 500

@app.route('/stop_modes', methods=['POST'])
def stop_modes():
    stop_all_modes()
    
    settings = load_settings()
    settings['current_mode'] = 'manual'
    save_settings(settings)
    
    return jsonify({'message': 'Stopped all automatic modes'})

@app.route('/settings', methods=['GET', 'POST'])
def settings():
    if request.method == 'GET':
        return jsonify(load_settings())
    
    elif request.method == 'POST':
        data = request.get_json()
        current_settings = load_settings()
        
        # Update settings
        for key in ['cycle_time', 'saturation', 'ai_generation_interval']:
            if key in data:
                current_settings[key] = data[key]
        
        save_settings(current_settings)
        return jsonify({'message': 'Settings updated successfully'})

@app.route('/status', methods=['GET'])
def status():
    return jsonify({
        'cycling_active': cycling_active,
        'ai_mode_active': ai_mode_active,
        'settings': load_settings(),
        'image_count': len(get_all_images())
    })

@app.route('/images', methods=['GET'])
def list_images():
    images = get_all_images()
    image_list = []
    
    for img_path in images:
        filename = os.path.basename(img_path)
        folder = os.path.basename(os.path.dirname(img_path))
        image_list.append({
            'filename': filename,
            'folder': folder,
            'path': img_path
        })
    
    return jsonify(image_list)

@app.route('/test', methods=['GET'])
def test_connection():
    try:
        inky = auto(ask_user=False, verbose=False)
        return jsonify({
            'message': 'Connection successful!',
            'resolution': inky.resolution,
            'width': inky.width,
            'height': inky.height
        })
    except Exception as e:
        return jsonify({'error': f'Connection failed: {str(e)}'}), 500

@app.route('/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

@app.route('/pictures/<filename>')
def picture_file(filename):
    return send_from_directory(PICTURES_FOLDER, filename)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)