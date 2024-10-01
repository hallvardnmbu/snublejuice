"""
Fetch information about all of Vinmonopolet's stores, and their stock.
"""

import os
import time
import itertools
from typing import List
import concurrent.futures

import pymongo
import requests
from pymongo.mongo_client import MongoClient


_CLIENT = MongoClient(
    f'mongodb+srv://{os.environ.get("MONGO_USR")}:{os.environ.get("MONGO_PWD")}'
    f'@vinskraper.wykjrgz.mongodb.net/'
    f'?retryWrites=true&w=majority&appName=vinskraper'
)
_DATABASE = _CLIENT['vinskraper']['varer']
_EXPIRED = _CLIENT['vinskraper']['utgått']
_EXISTING = _DATABASE.distinct('index')

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

_STORES = 'https://www.vinmonopolet.no/vmpws/v2/vmp/stores?fields=FULL&pageSize=1000'
_PRODUCT = 'https://www.vinmonopolet.no/vmpws/v2/vmp/search?fields=FULL&searchType=product&q={}:relevance'


def stores():
    """
    Fetch information about all stores from Vinmonopolet.
    Store the results to a collection named `butikk` in the `vinskraper` database.

    Extracts
    --------
        * store number : int
        * name : str
        * address : str
        * coordinates : dict of str -> float
        * assortiment type : str
        * click and collect : bool
    """
    proxy = next(_PROXIES)
    for _ in range(10):
        try:
            response = requests.get(_STORES, params={"q": "*"}, proxies=proxy, timeout=3)
            break
        except Exception as err:
            print(f'Error: Trying another proxy. {err}')
            proxy = next(_PROXIES)
    else:
        raise ValueError('Failed to fetch store information. Tried 10 times.')

    if response.status_code != 200:
        raise ValueError('Failed to fetch store information.')

    store = response.json().get('stores', [])
    if not store:
        raise ValueError('No stores found.')

    for _store in store:
        _store.pop('openingTimes', None)
        _store.pop('formattedDistance', None)

        _store['index'] = int(_store.pop('name'))
        _store['navn'] = _store.pop('displayName')
        _store['adresse'] = _store.pop('address')['formattedAddress']
        _store['koordinater'] = _store.pop('geoPoint')
        _store['sortiment'] = _store.pop('assortment', None)
        _store['klikk og hent'] = _store.pop('clickAndCollect')
        _store['mobilbetaling'] = _store.pop('mobileCheckoutEnabled')

    _CLIENT['vinskraper']['butikk'].delete_many({})
    _CLIENT['vinskraper']['butikk'].insert_many(store)


def _product(index: int, proxy: dict) -> dict:
    for _ in range(10):
        try:
            response = requests.get(_PRODUCT.format(index), proxies=proxy, timeout=5)
            if response.status_code == 429:
                time.sleep(0.5)
                continue
            elif response.status_code != 200:
                raise ValueError(f'Status code {response.status_code}: {response.text}')

            response = response.json().get('productSearchResult', {})

            store = [element.get('values', [])
                     for element in response.get('facets', [])
                     if element['name'].lower() == 'butikker']

            if not response.get('products', []):
                return {
                    'index': index,
                    'status': 'utgått',
                    'kan kjøpes': False,
                    'tilgjengelig for bestilling': False,
                    'bestillingsinformasjon': None,
                    'tilgjengelig i butikk': False,
                    'butikkinformasjon': None,
                    'utgått': True,
                    'butikk': None,
                }

            product = response.get('products', [{}])[0]

            return {
                'index': index,
                'oppdater': index not in _EXISTING,

                'butikk': [element['name'] for _store in store for element in _store],

                'status': product.get('status', None),
                'kan kjøpes': product.get('buyable', False),
                'utgått': product.get('expired', True),

                'tilgjengelig for bestilling': product \
                    .get('productAvailability') \
                    .get('deliveryAvailability', {}) \
                    .get('availableForPurchase', False),
                'bestillingsinformasjon': product \
                    .get('productAvailability') \
                    .get('deliveryAvailability', {}) \
                    .get('infos', [{}])[0] \
                    .get('readableValue', None),
                'tilgjengelig i butikk': product \
                    .get('productAvailability') \
                    .get('storesAvailability', {}) \
                    .get('availableForPurchase', False),
                'butikkinformasjon': product \
                    .get('productAvailability') \
                    .get('storesAvailability', {}) \
                    .get('infos', [{}])[0] \
                    .get('readableValue', None),
            }
        except Exception as err:
            print(f'{index}: Trying another proxy. {err}')
            proxy = next(_PROXIES)

    raise ValueError('Failed to fetch product information.')


def available(products: List[int] = None, max_workers=10):
    """
    Update information about products and their stock in stores.

    Parameters
    ----------
    products : List[int]
        The products to fetch detailed information about.
        If None, all products are fetched.
    max_workers : int
        The maximum number of (parallel) workers to use when fetching products.

    Raises
    ------
    ValueError
        If the product information could not be fetched.

    Notes
    -----
    The function fetches detailed information about the products in the list `products`.
    If `products` is None, all products are fetched.
    The function uses a thread pool to fetch the products in parallel.
    To prevent memory issues, the function fetches the products in batches.
    """
    if not products:
        print('Fetching all products.')
        products = _DATABASE.distinct('index')

    step = max(len(products) // 1000, 500)
    for i in range(0, len(products), step):
        print(f'Processing products {i} to {i + step} of {len(products)}.')

        expired = []
        operations = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            _products = products[i:i + step]
            _proxies = [next(_PROXIES) for _ in range(len(_products))]
            results = {executor.submit(_product, product, proxy): product
                       for product, proxy in zip(_products, _proxies)}
            for future in concurrent.futures.as_completed(results):
                product = future.result()
                if not product:
                    continue

                if not product['butikk']:
                    product['butikk'] = None

                operation = pymongo.UpdateOne(
                    {'index': product['index']},
                    {'$set': product},
                    upsert=True
                )
                if product['utgått'] or product['status'] in ('utgått', 'utgatt'):
                    expired.append(operation)
                    operations.append(pymongo.DeleteOne(
                        {'index': product['index']}
                    ))
                else:
                    operations.append(operation)
        _DATABASE.bulk_write(operations)
        if expired:
            _EXPIRED.bulk_write(expired)


if __name__ == '__main__':
    available(max_workers=5)
