"""
Update the database with the latest prices.
"""

import os
import enum
import time
import itertools
from typing import List
import concurrent.futures
from datetime import datetime, timedelta

import pymongo
import requests
from pymongo.errors import BulkWriteError
from pymongo.results import BulkWriteResult
from pymongo.mongo_client import MongoClient


_CLIENT = MongoClient(
    f'mongodb+srv://{os.environ.get("MONGO_USR")}:{os.environ.get("MONGO_PWD")}'
    f'@vinskraper.wykjrgz.mongodb.net/'
    f'?retryWrites=true&w=majority&appName=vinskraper'
)
_DATABASE = _CLIENT['vinskraper']['varer']

_URL = ('https://www.vinmonopolet.no/vmpws/v2/vmp/'
        'search?searchType=product'
        '&currentPage={}'
        '&q=%3Arelevance%3AmainCategory%3A{}')

_PROXIES = itertools.cycle([
    {
        "http": f"http://{os.environ.get('PROXY_USR')}:{os.environ.get('PROXY_PWD')}@{ip}:{os.environ.get('PROXY_PRT')}"
    }
    for ip in os.environ.get('PROXY_IPS', '').split(',')
] + [
    {
        "http": f"socks5://{os.environ.get('PROXY_USR')}:{os.environ.get('PROXY_PWD')}@{ip}:{os.environ.get('SOCKS_PRT')}"
    }
    for ip in os.environ.get('PROXY_IPS', '').split(',')
])

_SESSION = requests.Session()

_OLD = (datetime.now() - timedelta(days=15)).strftime("%Y-%m-01")
_NOW = datetime.now().strftime('%Y-%m-01')
_IMAGE = {'thumbnail': 'https://bilder.vinmonopolet.no/bottle.png',
          'product': 'https://bilder.vinmonopolet.no/bottle.png'}


class CATEGORY(enum.Enum):
    """
    Enum class for the different categories of products available at vinmonopolet.
    Extends the `scrape._URL` with the category value.
    """
    RED_WINE = 'rødvin'
    WHITE_WINE = 'hvitvin'
    SPARKLING_WINE = 'musserende_vin'
    PEARLING_WINE = 'perlende_vin'
    FORTIFIED_WINE = 'sterkvin'
    AROMATIC_WINE = 'aromatisert_vin'
    FRUIT_WINE = 'fruktvin'
    ROSE_WINE = 'rosévin'
    SPIRIT = 'brennevin'
    BEER = 'øl'
    CIDER = 'sider'
    SAKE = 'sake'
    MEAD = 'mjød'
    ALCOHOL_FREE = 'alkoholfritt'


def _upsert(data: List[dict]) -> BulkWriteResult:
    """
    Upsert the given data into the database.
    Calculates the price change percentage based on the previous and current price.

    Parameters
    ----------
    data : List[dict]
        The data to insert into the database.

    Returns
    -------
    BulkWriteResult
    """
    operations = [
        pymongo.UpdateOne(
            {'index': record['index']},
            [
                {'$set': record},
                {'$set': {
                    f'prisendring {_OLD}': {'$cond': [
                        {'if': {'and': [
                            {'$gt': [f'$pris {_OLD}', 0]},
                            {'$gt': [f'$pris {_NOW}', 0]}
                        ]}},
                        {'$multiply': [
                            {'$divide': [
                                {'$subtract': [f'$pris {_NOW}', f'$pris {_OLD}']},
                                f'$pris {_OLD}'
                            ]},
                            100
                        ]},
                        0
                    ]},
                }},
                {'$set': {
                    'literpris': {'$cond': {
                        'if': {'$and': [
                            {'$ne': [f'$pris {_NOW}', None]},
                            {'$ne': [f'$pris {_NOW}', 0]},
                            {'$ne': ['$volum', None]},
                            {'$ne': ['$volum', 0]},
                        ]},
                        'then': {'$multiply': [
                            {'$divide': [f'$pris {_NOW}', '$volum']},
                            100
                        ]},
                        'else': None
                    }}
                }},
                {'$set': {
                    'alkoholpris': {'$cond': {
                        'if': {'$and': [
                            {'$ne': ['$literpris', None]},
                            {'$ne': ['$literpris', 0]},
                            {'$ne': ['$alkohol', None]},
                            {'$ne': ['$alkohol', 0]},
                        ]},
                        'then': {'$divide': ['$literpris', '$alkohol']},
                        'else': None
                    }}
                }}
            ],
            upsert=True
        )
        for record in data
    ]
    result = _DATABASE.bulk_write(operations)

    return result


def _scrape_page(
        category: CATEGORY,
        page: int,
        proxy: dict
) -> requests.models.Response:
    """
    Scrape a single page of products from the given category.

    Parameters
    ----------
    category : CATEGORY
        The category of products to fetch.
    page : int
        The page number to fetch.

    Returns
    -------
    requests.models.Response
        The response from the page.

    Notes
    -----
        Tries to fetch the page using the `_PROXY`.
        If it fails, it renews the proxy (`_PROXY.renew()`) and retries.
        Returns code `500` if it fails 10 consecutive times.
    """
    for _ in range(10):
        try:
            response = _SESSION.get(_URL.format(page, category.value),
                                    proxies=proxy,
                                    timeout=3)
            break
        except Exception as err:
            print(f'Error: Page {page} (trying another proxy); {err}')
            proxy = next(_PROXIES)
    else:
        print(f'Error: Failed to fetch page {page} after 10 attempts.')
        response = requests.models.Response()
        response.status_code = 500

    return response


def _process_images(images):
    return {img['format']: img['url'] for img in images} if images else _IMAGE


def _process(products) -> List[dict]:
    return [{
        'index': int(product.get('code', 0)),

        'status': product.get('status', None),
        'kan kjøpes': product.get('buyable', False),
        'utgått': product.get('expired', True),

        'tilgjengelig for bestilling': product.get(
            'productAvailability', {}
        ).get(
            'deliveryAvailability', {}
        ).get(
            'availableForPurchase', False
        ),

        'bestillingsinformasjon': product.get(
            'productAvailability', {}
        ).get(
            'deliveryAvailability', {}
        ).get(
            'infos', [{}]
        )[0].get(
            'readableValue', None
        ),

        'tilgjengelig i butikk': product.get(
            'productAvailability', {}
        ).get(
            'storesAvailability', {}
        ).get(
            'availableForPurchase', False
        ),

        'butikkinformasjon': product.get(
            'productAvailability', {}
        ).get(
            'storesAvailability', {}
        ).get('infos', [{}]
        )[0].get(
            'readableValue', None
        ),

        f'pris {_NOW}': product.get('price', {}).get('value', 0.0),
    } for product in products]


def _scrape_category(category: CATEGORY, proxy: dict) -> bool:
    """
    Fetches all products from the given category.

    Parameters
    ----------
    category : CATEGORY
        The category of products to fetch.

    Returns
    -------
    bool

    Notes
    -----
        Loops through the pages of the category.
        Assumes that there is less than 10000 pages.
        Parses the response and extracts the products.
        Extracts the product information and stores it in the dictionary.
        The price key is suffixed with the current (year-month-)timestamp (%Y-%m-01).
    """

    # ----------------------------------------------------------------------------------------------
    # Loops through the pages of the category.
    # Assuming that there is less than 10000 pages.

    items = []
    for page in range(10000):
        products = _scrape_page(category, page, proxy)

        if products.status_code != 200:
            print(f'{category.name} Failed: '
                  f'Page {page} (status code {products.status_code}): '
                  f'{products.text}.')
            continue

        # ------------------------------------------------------------------------------------------
        # Parses the response and extracts the products.

        products = products.json().get('productSearchResult', {}).get('products', [])
        if not products:
            print(f'{category.name} No more products (final page: {page - 1}).')
            break

        # ------------------------------------------------------------------------------------------
        # Extracts the product information and stores it in the list.

        items.extend(_process(products))

    print(f'{category.name} Inserting into database.')
    try:
        result = _upsert(items)
    except BulkWriteError as bwe:
        print(f'{category.name} Error: Bulk write operation; {bwe.details}.')
        return False
    print(f'{category.name} Modified {result.modified_count} records')
    print(f'{category.name} Upserted {result.upserted_count} records')
    print(f'{category.name} Success.')
    return True


def scrape(categories=None, max_workers=10):
    if categories is None:
        categories = list(CATEGORY)
    failed = []

    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        results = {executor.submit(_scrape_category, category, proxy): category
                   for category, proxy in zip(categories, [next(_PROXIES) for _ in range(len(categories))])}

        for future in concurrent.futures.as_completed(results):
            try:
                success = future.result()
                if not success:
                    failed.append(results[future])
            except Exception as exc:
                category = results[future]
                print(f'{category.name} FAILED! Concurrency error: {exc}')
                failed.append(category)

    expired = list(_DATABASE.find({'utgått': True}))
    if expired:
        _CLIENT['vinskraper']['utgått'].insert_many(expired)

        ids = [doc['index'] for doc in expired]
        result = _DATABASE.delete_many({'index': {'$in': ids}})

        print(f"Moved {len(ids)} documents to the expired collection.")
        print(f"Deleted {result.deleted_count} documents from the stock collection.")
    else:
        print("No expired documents found.")

    return failed


if __name__ == '__main__':
    scrape(max_workers=10)
