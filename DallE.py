from PIL import Image, ImageDraw, ImageFont
import openai
import requests
from io import BytesIO
import re
import argparse
import pathlib
import sys

from PIL import Image

from inky.auto import auto
import time

from inky.auto import auto
from inky.inky_uc8159 import CLEAN
from credentials import credentials

openai.api_key = credentials()

def generate_random_prompt():
    completion = openai.ChatCompletion.create(
        model="gpt-3.5-turbo",
        messages=[
            {"role": "system", 
             "content": "Create a concise image prompt (max 5 words), specifying art style, subject, and details."
            },
        ]
    )
    return completion.choices[0].message['content']

def sanitize_filename(filename):
    # Remove or replace any character that's not allowed in filenames
    return re.sub(r'[<>:"/\\|?*]', '_', filename)  # Replaces invalid characters with underscores

def generate_image():
    try:
        # Generate a random prompt using GPT-3.5
        prompt = generate_random_prompt()
        print("Generated prompt:", prompt)

        # Generate an image from the random prompt
        response = openai.Image.create(
            prompt= prompt,
            n=1,
            size="1024x1024"
        )
        
        # Get the image URL
        image_url = response['data'][0]['url']
        print("Image URL:", image_url)
        
        # Download the image
        image_response = requests.get(image_url)
        image = Image.open(BytesIO(image_response.content))
        
        # Create a banner with the prompt text
        font = ImageFont.load_default()
        try:
            font = ImageFont.truetype("arial.ttf", 40)
        except IOError:
            print("Custom font not found; using default font.")
        
        draw = ImageDraw.Draw(image)
        banner_height = 150
        banner = Image.new("RGBA", (image.width, banner_height), (255, 255, 255, 100))
        draw_banner = ImageDraw.Draw(banner)
        text = prompt
        
        # Center the text on the banner
        bbox = draw_banner.textbbox((0, 0), text, font=font)
        text_width = bbox[2] - bbox[0]
        text_height = 40
        x_position = (banner.width - text_width) / 2
        y_position = (banner.height - text_height) / 2
        draw_banner.text((x_position, y_position), text, font=font, fill=(0, 0, 0, 255))
        
        # Create final image with banner
        final_image = Image.new("RGBA", (image.width, image.height + banner_height))
        final_image.paste(image.convert("RGBA"), (0, 0))
        final_image.paste(banner, (0, image.height))
        
        # Save the final image
        sanitized_filename = sanitize_filename(prompt)
        final_image_path = f"{sanitized_filename}.png"
        final_image.save(final_image_path)
        
        return final_image_path

    except Exception as e:
        print("Error generating image:", e)
        return None

def clear_image():
    inky = auto(ask_user=True, verbose=True)
    
    for _ in range(2):
        for y in range(inky.height):
            for x in range(inky.width):
                inky.set_pixel(x, y, inky.WHITE)
    
        inky.show()
        time.sleep(1.0)

def display_image(image_path):
    parser = argparse.ArgumentParser()
    
    parser.add_argument("--saturation", "-s", type=float, default=0.5, help="Colour palette saturation")
    
    inky = auto(ask_user=True, verbose=True)
    args, _ = parser.parse_known_args()
    saturation = args.saturation

    image = Image.open(image_path)
    resized_image = image.resize(inky.resolution)
    
    try:
        inky.set_image(resized_image, saturation=saturation)
    except TypeError:
        inky.set_image(resized_image)
    
    inky.show()

# Generate the image and get its path
image_path = generate_image()

# Clear monitor, then display the generated image if successful
if image_path:
    clear_image()
    display_image(image_path)
else:
    print("Failed to generate an image.")
