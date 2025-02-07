import os
import re
import json
import numpy as np
from PIL import Image
import matplotlib.pyplot as plt

_DIR = "./public/images/"
_PATTERN = r"(\[\[.*?\]\])"
_SIZES = [44, 64, 150, 320, 512, 640, 800, 1024, 1280]

for file in os.listdir(_DIR):
    if not file.endswith(".pattern"):
        continue

    with open(_DIR + file, 'rb') as content:
        image = json.loads(re.findall(_PATTERN, content.read().decode('iso-8859-1'))[0])

        height = len(image)
        width = len(image[0])
        rgb = np.zeros((height, width, 4))
        for i in range(height):
            for j in range(width):
                pixel = image[i][j]
                if pixel:
                    rgb[i, j, 0] = pixel.get('red', 0)
                    rgb[i, j, 1] = pixel.get('green', 0)
                    rgb[i, j, 2] = pixel.get('blue', 0)
                    rgb[i, j, 3] = 1
                else:
                    rgb[i, j] = (0, 0, 0, 0)

        plt.imshow(rgb)
        plt.axis('off')


        name = file.split('.')[0]

        plt.savefig(
            f"{_DIR}{name}.png",
            bbox_inches='tight', pad_inches=0, transparent=not "web" in name
        )
        if name == "snublejuice":
            plt.savefig(
                f"{_DIR}{name}.jpg",
                bbox_inches='tight', pad_inches=0, transparent=False
            )

            original = Image.open(f"{_DIR}{name}.png")
            for size in _SIZES:
                resized = original.resize((size, size), Image.LANCZOS)
                resized.save(f"{_DIR}{size}x{size}.png")
            original.close()

        plt.close()
