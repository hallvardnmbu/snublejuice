import { MongoClient } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

const client = new MongoClient(
  `mongodb+srv://${process.env.MONGO_USR}:${process.env.MONGO_PWD}@snublejuice.faktu.mongodb.net/?retryWrites=true&w=majority&appName=snublejuice`,
);
await client.connect();

const database = client.db("snublejuice");
const itemCollection = database.collection("products");

const URL = "https://www.vivino.com/search/wines?q={}";
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
};
const PATTERN = /<script type='application\/ld\+json'>([\s\S]*?)<\/script>/;
const RETRY = {
  max: 1,
  delay: 25, // seconds
};

async function getRatings(items) {
  function processProduct(products, target) {
    if (!target.index || !products) {
      return {
        index: target.index,
        rating: null,
      };
    }

    for (const product of products) {
      const processed = {
        index: target.index,
        rating: {
          name: product.name,
          manufacturer: product.manufacturer.name,
          url: product["@id"],

          value: product.aggregateRating.ratingValue,
          count: product.aggregateRating.reviewCount,

          updated: new Date(),
        },
      };

      // Exact match
      if (product.name.toLowerCase() === target.name.toLowerCase()) {
        return processed;
      }

      // Partial match within description
      const description = product.description.toLowerCase().split(" ");
      const truth = target.name.toLowerCase().split(" ");
      if (
        truth.reduce((acc, word) => acc + (description.includes(word) ? 1 : 0), 0) / truth.length >
        0.75
      ) {
        return processed;
      }
    }

    return {
      index: target.index,
      rating: null,
    };
  }

  async function getRating(target, retry = 0) {
    try {
      const response = await fetch(URL.replace("{}", target.name), {
        method: "GET",
        headers: HEADERS,
        timeout: 10000,
      });

      if (response.status === 200) {
        const text = await response.text();
        const match = text.match(PATTERN);
        if (!match) throw new Error("Pattern not found!");

        const products = JSON.parse(match[1]);
        return processProduct(products, target);
      } else if (response.status === 429) {
        console.log(`ERROR | RATINGS | Timeout.`);

        if (retry < RETRY.max) {
          console.log(`ERROR | RATINGS | Retry number ${retry + 1} in ${RETRY.delay} seconds.`);

          await new Promise((resolve) => setTimeout(resolve, RETRY.delay * 1000));
          return getRating(target, retry + 1);
        }

        return "Timeout";
      } else {
        console.log(`ERROR | RATINGS | Name: ${target.name} | Status: ${response.status}`);
      }
    } catch (err) {
      console.log(`ERROR | RATINGS | Name: ${target.name} | ${err.message}`);
    }
  }

  async function updateDatabase(data) {
    const operations = data.map((record) => ({
      updateOne: {
        filter: { index: record.index },
        update: { $set: { rating: record.rating } },
        upsert: true,
      },
    }));

    return await itemCollection.bulkWrite(operations);
  }

  let products = [];

  for (const item of items) {
    try {
      let product = await getRating(item);

      // Vivino enforces strict rules.
      // In case of reccuring timeouts, the loop and code is exited.
      if (product === "Timeout") {
        console.log(`ERROR | RATINGS | Maximum retries reached. Aborting.`);
        break;
      }

      if (!product) {
        console.log(`ERROR | RATINGS | Id: ${item.index} | No rating found.`);
        continue;
      }

      products = products.concat(product);

      await new Promise((resolve) => setTimeout(resolve, 10000)); // As per vivino.com/robots.txt
    } catch (err) {
      console.log(`ERROR | RATINGS | Id: ${item.index} | ${err}`);
      break;
    }

    if (products.length >= 25) {
      console.log(`UPDATING | RATINGS | ${products.length} records.`);
      const result = await updateDatabase(products);
      console.log(`         | Updated ${result.modifiedCount} records.`);
      console.log(`         | Inserted ${result.insertedCount} records.`);

      products = [];
    }
  }

  // Insert the remaining products, if any.
  if (products.length === 0) {
    return;
  }
  console.log(`UPDATING | RATINGS | ${products.length} final records.`);
  const result = await updateDatabase(products);
  console.log(`         | Updated ${result.modifiedCount} records.`);
  console.log(`         | Inserted ${result.insertedCount} records.`);
}

async function main() {
  const items = await itemCollection
    .find({
      index: { $exists: true },
      name: { $exists: true },
      rating: { $exists: true, $eq: null },
      "rating.updated": null,
      // "rating.updated": { $lt: new Date("2025-01-01") },
      // "rating.value": { $exists: true, $eq: 0 },
      category: {
        $in: [
          "Rødvin",
          "Hvitvin",
          "Vin",
          "Musserende vin",
          "Perlende vin",
          "Rosévin",
          "Aromatisert vin",
          "Fruktvin",
          "Sterkvin",
        ],
      },
    })
    .project({ index: 1, name: 1, _id: 0 })
    .toArray();

  console.log(`UPDATING | RATINGS | ${items.length} records.`);

  await getRatings(items.reverse());
}

await main();

client.close();
