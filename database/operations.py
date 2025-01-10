"""Code used to refactor the MongoDB database."""

import os

import pymongo
from pymongo.mongo_client import MongoClient
from pymongo.results import BulkWriteResult

import pandas as pd
import numpy as np


_DATABASE = MongoClient(
    f'mongodb+srv://{os.environ.get("MONGO_USR")}:{os.environ.get("MONGO_PWD")}'
    f'@snublejuice.faktu.mongodb.net/'
    f'?retryWrites=true&w=majority&appName=snublejuice'
)['snublejuice']['products']


def update_prices(records) -> BulkWriteResult:
    raise ValueError("ARE YOU SURE???")

    backup()

    operations = [
        pymongo.UpdateOne(
            {'index': record['index']},
            [
              { "$set": { "oldprice": "$price" } },
              { "$set": record },
              { "$set": { "prices": { "$ifNull": ["$prices", []] } } },
              { "$set": { "prices": { "$concatArrays": ["$prices", ["$price"]] } } },
              {
                  "$set": {
                  "discount": {
                    "$cond": {
                      "if": {
                        "$and": [
                          { "$gt": ["$oldprice", 0] },
                          { "$gt": ["$price", 0] },
                          { "$ne": ["$oldprice", None] },
                          { "$ne": ["$price", None] },
                        ],
                      },
                      "then": {
                        "$multiply": [
                          {
                            "$divide": [{ "$subtract": ["$price", "$oldprice"] }, "$oldprice"],
                          },
                          100,
                        ],
                      },
                      "else": 0,
                    },
                  },
                  "literprice": {
                    "$cond": {
                      "if": {
                        "$and": [
                          { "$gt": ["$price", 0] },
                          { "$gt": ["$volume", 0] },
                          { "$ne": ["$price", None] },
                          { "$ne": ["$volume", None] },
                        ],
                      },
                      "then": {
                        "$multiply": [
                          {
                            "$divide": ["$price", "$volume"],
                          },
                          100,
                        ],
                      },
                      "else": None,
                    },
                  },
                },
              },
              {
                  "$set": {
                  "alcoholprice": {
                    "$cond": {
                      "if": {
                        "$and": [
                          { "$gt": ["$literprice", 0] },
                          { "$gt": ["$alcohol", 0] },
                          { "$ne": ["$literprice", None] },
                          { "$ne": ["$alcohol", None] },
                        ],
                      },
                      "then": {
                        "$divide": ["$literprice", "$alcohol"],
                      },
                      "else": None,
                    },
                  },
                },
              },
            ],
            upsert=True
        )
        for record in records
    ]
    return _DATABASE.bulk_write(operations)


def update_expired_items_to_locf():
    pipeline = [
        {
            "$set": {
                "prices": {
                    "$reduce": {
                        "input": "$prices",
                        "initialValue": [],
                        "in": {
                            "$concatArrays": [
                                "$$value",
                                [
                                    {
                                        "$cond": {
                                            "if": {"$eq": ["$$this", 0.0]},
                                            "then": {"$arrayElemAt": ["$$value", -1]},
                                            "else": "$$this"
                                        }
                                    }
                                ]
                            ]
                        }
                    }
                }
            }
        }
    ]
    result = _DATABASE.update_many({"prices": {"$elemMatch": {"$eq": 0.0}}}, pipeline)

    print(f"Updated {result.modified_count} records")
    print(result)


def delete_fields(records, fields) -> BulkWriteResult:
    operations = [
        pymongo.UpdateOne(
            {'index': record['index']},
            {'$unset': {field: '' for field in fields}}
        )
        for record in records
    ]
    return _DATABASE.bulk_write(operations)


def restore(date):
    _DATABASE.delete_many({})

    if not os.path.exists("./backup"):
        path = f"./database/backup/{date}.parquet"
    else:
        path = f"./backup/{date}.parquet"

    df = pd.read_parquet(path)

    # Convert numpy types to python types
    for column in df.columns:
        if pd.api.types.is_integer_dtype(df[column]):
            df[column] = df[column].astype(int)
        elif pd.api.types.is_float_dtype(df[column]):
            df[column] = df[column].astype(float)
        elif pd.api.types.is_bool_dtype(df[column]):
            df[column] = df[column].astype(bool)
        elif pd.api.types.is_string_dtype(df[column]):
            df[column] = df[column].astype(str)
        elif pd.api.types.is_object_dtype(df[column]):
            try:
                df[column] = df[column].apply(lambda x: x.tolist() if isinstance(x, np.ndarray) else x)
            except AttributeError:
                pass
        elif pd.api.types.is_datetime64_any_dtype(df[column]):
            df[column] = df[column].dt.to_pydatetime()

    records = df.to_dict(orient='records')
    _DATABASE.insert_many(records)


def backup():
    data = _DATABASE.find({})
    df = pd.DataFrame(data)
    df = df.drop(columns=["_id"])
    df["year"] = df["year"].apply(lambda x: int(float(x)) if x not in ("None", None, "") and pd.notna(x) else None)
    if not os.path.exists("./backup"):
        path = f"./database/backup/{pd.Timestamp.now().strftime('%Y-%m-%d')}.parquet"
    else:
        path = f"./backup/{pd.Timestamp.now().strftime('%Y-%m-%d')}.parquet"
    df.to_parquet(path)
    print("Saved backup to ", path)


# Restore remote database with local backup from `date`
# restore(date = "2024-12-26")

# Replace all prices of expired items with the last known price
# update_expired_items_to_locf()

backup()
