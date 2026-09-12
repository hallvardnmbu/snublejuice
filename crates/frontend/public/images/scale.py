# /// script
# requires-python = ">=3.14"
# dependencies = [
#     "pillow>=12.3.0",
# ]
# ///
import os
from PIL import Image

def scale(source):
    sizes = [44, 64, 150, 320, 512, 640, 800]

    directory = os.path.dirname(os.path.abspath(__file__))
    with Image.open(os.path.join(directory, source)) as img:
        for size in sizes:
            resized = img.resize((size, size), Image.Resampling.LANCZOS)
            resized.save(os.path.join(directory, f"{size}x{size}.png"), "PNG")
            print(f"Generated: {size}")

        favicon = os.path.join(directory, "favicon.ico")
        img.save(
            favicon,
            format="ICO",
            sizes=[(16, 16), (32, 32), (48, 48), (64, 64)]
        )
        print("Generated: favicon")

if __name__ == "__main__":
    scale("snublejuice.png")
