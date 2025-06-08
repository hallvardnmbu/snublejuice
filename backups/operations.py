"""Code used to refactor the MongoDB database."""

import os

import argparse
import numpy as np
import pandas as pd

import pymongo
from pymongo.mongo_client import MongoClient
from pymongo.results import BulkWriteResult


_DATABASE = MongoClient(
    f"mongodb+srv://{os.environ.get('MONGO_USR')}:{os.environ.get('MONGO_PWD')}"
    f"@snublejuice.faktu.mongodb.net/"
    f"?retryWrites=true&w=majority&appName=snublejuice"
)["snublejuice"]["products"]


def update_prices(records) -> BulkWriteResult:
    raise ValueError("ARE YOU SURE???")

    backup()

    operations = [
        pymongo.UpdateOne(
            {"index": record["index"]},
            [
                {"$set": {"oldprice": "$price"}},
                {"$set": record},
                {"$set": {"prices": {"$ifNull": ["$prices", []]}}},
                {"$set": {"prices": {"$concatArrays": ["$prices", ["$price"]]}}},
                {
                    "$set": {
                        "discount": {
                            "$cond": {
                                "if": {
                                    "$and": [
                                        {"$gt": ["$oldprice", 0]},
                                        {"$gt": ["$price", 0]},
                                        {"$ne": ["$oldprice", None]},
                                        {"$ne": ["$price", None]},
                                    ],
                                },
                                "then": {
                                    "$multiply": [
                                        {
                                            "$divide": [
                                                {"$subtract": ["$price", "$oldprice"]},
                                                "$oldprice",
                                            ],
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
                                        {"$gt": ["$price", 0]},
                                        {"$gt": ["$volume", 0]},
                                        {"$ne": ["$price", None]},
                                        {"$ne": ["$volume", None]},
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
                                        {"$gt": ["$literprice", 0]},
                                        {"$gt": ["$alcohol", 0]},
                                        {"$ne": ["$literprice", None]},
                                        {"$ne": ["$alcohol", None]},
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
            upsert=True,
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
                                            "else": "$$this",
                                        }
                                    }
                                ],
                            ]
                        },
                    }
                }
            }
        }
    ]
    result = _DATABASE.update_many({"prices": {"$elemMatch": {"$eq": 0.0}}}, pipeline)

    print(f"Updated {result.modified_count} records")
    print(result)


def update_taxfree_alcoholprice() -> BulkWriteResult:
    records = _DATABASE.find({"taxfree.updated": True})

    operations = []
    for record in records:
        literprice = record.get("taxfree", {}).get("literprice")
        alcohol = record.get("taxfree", {}).get("alcohol")

        alcoholprice = 0
        if (
            literprice is not None
            and alcohol is not None
            and literprice > 0
            and alcohol > 0
        ):
            alcoholprice = literprice / alcohol

        operations.append(
            pymongo.UpdateOne(
                {"taxfree.index": record["taxfree"]["index"]},
                {"$set": {"taxfree.alcoholprice": alcoholprice}},
            )
        )
    return _DATABASE.bulk_write(operations)


def delete_fields(records, fields) -> BulkWriteResult:
    operations = [
        pymongo.UpdateOne(
            {"index": record["index"]}, {"$unset": {field: "" for field in fields}}
        )
        for record in records
    ]
    return _DATABASE.bulk_write(operations)


def restore(date: str | None = None):
    # Check that a backed up version actually exists.
    backup_dir = "./backups/backup/"
    if not os.path.exists(backup_dir):
        print("NO BACKUP DIRECTORY EXISTS")
        return

    if date is None:
        # If no date is passed, the most recent backup is used.
        backup_files = sorted(
            [f for f in os.listdir(backup_dir) if f.endswith(".parquet")], reverse=True
        )
        if not backup_files:
            print("NO BACKUP FILES FOUND")
            return
        backup_file = backup_files[0]
    else:
        backup_file = f"{date}.parquet"
        if not os.path.exists(os.path.join(backup_dir, backup_file)):
            print(f"BACKUP FILE FOR DATE {date} DOES NOT EXIST")
            return

    _DATABASE.delete_many({})

    path = os.path.join(backup_dir, backup_file)
    df = pd.read_parquet(path)

    def _convert(obj):
        """Recursively convert numpy arrays to lists in nested structures."""
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        elif isinstance(obj, dict):
            return {k: _convert(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [_convert(item) for item in obj]
        elif isinstance(obj, np.integer):
            return int(obj)
        elif isinstance(obj, np.floating):
            return float(obj)
        elif isinstance(obj, np.bool_):
            return bool(obj)
        elif isinstance(obj, np.str_):
            return str(obj)
        else:
            return obj

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
            df[column] = df[column].apply(_convert)
        elif pd.api.types.is_datetime64_any_dtype(df[column]):
            df[column] = df[column].dt.to_pydatetime()

    records = df.to_dict(orient="records")

    START = 0
    BATCH_SIZE = 1000
    exists = list(_DATABASE.distinct("index"))
    records = [record for record in records if record["index"] not in exists]
    for batch in range(START, len(records), BATCH_SIZE):
        print(f"Inserting batch {batch} to {batch + BATCH_SIZE} of {len(records)}")
        _DATABASE.insert_many(
            records[batch : batch + BATCH_SIZE],
            ordered=False,
            bypass_document_validation=True,
        )


def scan_and_update_products():
    products = _DATABASE.find({"oldprice": 0, "prices.1": {"$exists": True}})
    for product in products:
        oldprice = product["prices"][-2]
        _DATABASE.update_one(
            {"_id": product["_id"]}, {"$set": {"oldprice": oldprice, "discount": 0}}
        )


def set_date_type():
    data = _DATABASE.find(
        {"rating": {"$ne": None}, "rating.updated": {"$exists": True, "$ne": None}},
        {"_id": 0},
    )

    operations = []
    for item in data:
        if "updated" not in item["rating"]:
            continue
        if not item["rating"]["updated"] or item["rating"]["updated"] in [
            "",
            None,
            "None",
        ]:
            continue

        operations.append(
            pymongo.UpdateOne(
                {"index": item["index"]},
                {"$set": {"rating.updated": pd.Timestamp(item["rating"]["updated"])}},
            )
        )

    print("Updating", len(operations))
    return _DATABASE.bulk_write(operations)


def backup():
    data = _DATABASE.find({})
    df = pd.DataFrame(data)
    df = df.drop(columns=["_id"])
    df["year"] = df["year"].apply(
        lambda x: int(float(x)) if x not in ("None", None, "") and pd.notna(x) else None
    )
    df["rating"] = df["rating"].apply(
        lambda x: {
            **x,
            "updated": str(x.get("updated", "")),
            "count": str(x.get("count", "")),
        }
        if x not in ("None", None, "")
        and pd.notna(x)
        and ("updated" in x or "count" in x)
        else x
    )

    os.makedirs("./backup/", exist_ok=True)
    path = f"./backup/{pd.Timestamp.now().strftime('%Y-%m-%d')}.parquet"

    df.to_parquet(path)
    print("Saved backup to ", path)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run operations on the database.")
    parser.add_argument(
        "function", type=str, help="The function to run (backup or restore)."
    )
    parser.add_argument(
        "--date",
        type=str,
        help="The date argument for the restore function (e.g., 2025-04-13).",
    )

    args = parser.parse_args()

    if args.function == "backup":
        backup()
    elif args.function == "restore":
        restore(args.date)
