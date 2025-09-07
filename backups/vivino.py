# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "json",
#     "requests",
# ]
# ///
import re
import json
import requests

URL = "https://www.vivino.com/search/wines?q={}"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
}


def processProduct(products, target):
    if not target["index"] or not products:
        return None

    for product in products:
        processed = {
            "index": target["index"],
            "rating": {
                "name": product["name"],
                "manufacturer": product["manufacturer"]["name"],
                "value": product["aggregateRating"]["ratingValue"],
                "count": product["aggregateRating"]["reviewCount"],
                "url": product["@id"],
                "updated": True,
            },
        }

        # Exact match.
        if product["name"].lower() == target["name"].lower():
            return processed

        # Partial match within description.
        description = product["description"].lower().split(" ")
        truth = target["name"].lower().split(" ")
        if sum(word in description for word in truth) / len(truth) > 0.75:
            return processed

    return None


target = {"index": "wine", "name": "Baron de Ley Reserva"}

response = requests.get(URL.format(target["name"]), headers=HEADERS)
pattern = r"<script type=\'application/ld\+json\'>([\s\S]*?)</script>"
products = json.loads(re.findall(pattern, response.text)[0])

print(processProduct(products, target))
