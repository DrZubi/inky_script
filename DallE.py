from PIL import Image
import openai
import requests
from io import BytesIO
import re
import pathlib

from credentials import credentials

openai.api_key = credentials()

def generate_random_prompt():
    completion = openai.ChatCompletion.create(
        model="gpt-3.5-turbo",
        messages=[
            {"role": "system", 
             "content": "Create a concise image prompt for a E-white paper display, focusing on a professional, informative visual. Specify the art style, subject matter, and relevant details to convey clear data insights or abstract concepts in a formal tone."
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
            prompt=prompt,
            n=1,
            size="1024 x 1024"
        )
        
        # Get the image URL
        image_url = response['data'][0]['url']
        print("Image URL:", image_url)
        
        # Download the image
        image_response = requests.get(image_url)
        image = Image.open(BytesIO(image_response.content))

        # Ensure the 'pictures' directory exists
        script_dir = pathlib.Path(__file__).parent
        pictures_dir = script_dir / "pictures"
        pictures_dir.mkdir(parents=True, exist_ok=True)

        # Save the image in the 'pictures' directory
        sanitized_filename = sanitize_filename(prompt)
        final_image_path = pictures_dir / f"{sanitized_filename}.jpg"
        image.save(final_image_path)
        
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
