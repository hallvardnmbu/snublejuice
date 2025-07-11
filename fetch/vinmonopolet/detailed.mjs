import axios from "axios";
import { MongoClient } from "mongodb";

const log = (level, message) => {
  console.log(`${level} [vmp-detailed] ${message}`);
};

log("?", "Connecting to database.");
const client = new MongoClient(
  `mongodb+srv://${process.env.MONGO_USR}:${process.env.MONGO_PWD}@snublejuice.faktu.mongodb.net/?retryWrites=true&w=majority&appName=snublejuice`,
);
try {
  await client.connect();
  log("?", "Connected to database.");
} catch (error) {
  log("!", `Failed to connect to database: ${error.message}`);
  process.exit(1);
}

const database = client.db("snublejuice");
const itemCollection = database.collection("products");

// NEW PRODUCTS:

const NEW =
  "https://www.vinmonopolet.no/vmpws/v2/vmp/products/search?fields=FULL&pageSize=24&currentPage={}&q=%3Arelevance%3AnewProducts%3Atrue";

const LINK = "https://www.vinmonopolet.no{}";

const IMAGE = {
  thumbnail: "https://bilder.vinmonopolet.no/bottle.png",
  product: "https://bilder.vinmonopolet.no/bottle.png",
};

async function getNewProducts(itemIds) {
  function processImages(images) {
    return images
      ? images.reduce((acc, img) => ({ ...acc, [img.format]: img.url }), {})
      : IMAGE;
  }

  function processProducts(products) {
    const processedProducts = [];

    for (const product of products) {
      const index = parseInt(product.code, 10) || null;

      if (itemIds.includes(index)) {
        break;
      }

      processedProducts.push({
        index: index,

        updated: true,

        name: product.name || null,
        price: product.price?.value || 0.0,

        volume: product.volume?.value || 0.0,
        literprice:
          product.price?.value && product.volume?.value
            ? product.price.value / (product.volume.value / 100.0)
            : 0.0,

        url: product.url ? LINK.replace("{}", product.url) : null,
        images: product.images ? processImages(product.images) : IMAGE,

        category: product.main_category?.name || null,
        subcategory: product.main_sub_category?.name || null,

        country: product.main_country?.name || null,
        district: product.district?.name || null,
        subdistrict: product.sub_District?.name || null,

        selection: product.product_selection || null,
        sustainable: product.sustainable || false,

        buyable: product.buyable || false,
        expired: product.expired || true,
        status: product.status || null,

        orderable:
          product.productAvailability?.deliveryAvailability
            ?.availableForPurchase || false,
        orderinfo:
          product.productAvailability?.deliveryAvailability?.infos?.[0]
            ?.readableValue || null,

        instores:
          product.productAvailability?.storesAvailability
            ?.availableForPurchase || false,
        storeinfo:
          product.productAvailability?.storesAvailability?.infos?.[0]
            ?.readableValue || null,
      });
    }

    return processedProducts;
  }

  async function getPage(page) {
    try {
      const response = await session.get(NEW.replace("{}", page), {
        timeout: 10000,
      });

      if (response.status === 200) {
        return processProducts(
          response.data["products"],
        );
      } else {
        log("!", `Received status ${response.status} for page ${page}.`);
      }
    } catch (err) {
      log("!", `Failed to fetch page ${page}: ${err.message}`);
    }
  }

  async function updateNewDatabase(data) {
    try {
      log("?", `Inserting ${data.length} new products into the database...`);
      const result = await itemCollection.insertMany(data);
      log("?", `Successfully inserted ${result.insertedCount} products.`);
      return result;
    } catch (error) {
      log("!", `Failed to insert products into the database: ${error.message}`);
      throw error;
    }
  }

  let items = [];

  for (let page = 0; page < 10000; page++) {
    try {
      let products = await getPage(page);
      if (products.length === 0 || !products) {
        log("?", `No more products found. Final page: ${page}.`);
        break;
      }

      items = items.concat(products);

      await new Promise((resolve) => setTimeout(resolve, 1100));
    } catch (err) {
      log("!", `Error processing page ${page}: ${err.message}`);
      break;
    }

    // Upsert to the database every 10 pages.
    if (page % 10 === 0) {
      if (items.length === 0) {
        log("!", "No items to update in the last 10 pages.");
        return;
      }

      log("+", ` Updating database with ${items.length} records.`);
      const result = await updateNewDatabase(items);
      log("+", ` Inserted ${result.insertedCount}.`);

      items = [];
    }
  }

  // Insert the remaining products, if any.
  if (items.length === 0) {
    return;
  }
  log("?", `Final batch: ${items.length} records.`);
  const result = await updateNewDatabase(items);
  log("+", `Inserted ${result.insertedCount} final records.`);
}

// DETAILED INFORMATION:

const DETAIL =
  "https://www.vinmonopolet.no/vmpws/v3/vmp/products/{}?fields=FULL";

async function updateInformation(itemIds) {
  log("?", `Updating the information of ${itemIds.length} products.`);

  function processInformation(product) {
    const processed = {
      index: parseInt(product.code, 10) || null,

      updated: true,

      volume: product.volume?.value || 0.0,
      price: product.price?.value || 0.0,

      colour: product.color || null,

      characteristics:
        product.content?.characteristics?.map(
          (characteristic) => characteristic.readableValue,
        ) || [],
      ingredients:
        product.content?.ingredients?.map(
          (ingredient) => ingredient.readableValue,
        ) || [],
      ...product.content?.traits?.reduce(
        (acc, trait) => ({
          ...acc,
          [trait.name.toLowerCase()]: trait.readableValue,
        }),
        {},
      ),
      smell: product.smell || null,
      taste: product.taste || null,
      allergens: product.allergens || null,

      pair: product.content?.isGoodFor?.map((element) => element.name) || [],
      storage: product.content?.storagePotential?.formattedValue || null,
      cork: product.cork || null,

      alcohol:
        product.traits?.find((trait) => trait.name === "Alkohol")
          ?.readableValue || null,
      sugar:
        product.traits?.find((trait) => trait.name === "Sukker")
          ?.readableValue || null,
      acid:
        product.traits?.find((trait) => trait.name === "Syre")?.readableValue ||
        null,

      description: {
        lang: product.content?.style?.description || null,
        short: product.content?.style?.name || null,
      },
      method: product.method || null,
      year: product.year || null,
    };

    if (processed.volume > 0 && processed.price > 0) {
      processed.literprice = (processed.price / processed.volume) * 100;
    } else {
      processed.literprice = null;
    }

    // Check if "alkohol" or "alcohol" is present in the processed object.
    if (processed.alkohol || processed.alcohol) {
      // Split the string at the first space character, and convert to float.
      if (processed.alkohol) {
        processed.alcohol = parseFloat(
          processed.alkohol.split(" ")[0].replace(",", "."),
        );

        // Remove the "alkohol" key from the object.
        delete processed.alkohol;
      } else {
        processed.alcohol = parseFloat(
          processed.alcohol.split(" ")[0].replace(",", "."),
        );
      }

      // Calculate the alcohol price.
      processed.alcoholprice = processed.literprice / processed.alcohol;
    } else {
      processed.alcohol = 0.0;
      processed.alcoholprice = null;
    }

    return processed;
  }

  async function getInformation(id) {
    try {
      const response = await session.get(DETAIL.replace("{}", id), {
        timeout: 10000,
      });

      if (response.status === 200) {
        return processInformation(response.data);
      }

      log(
        "!",
        `Detailed fetch returned status ${response.status} for item ${id}.`,
      );
    } catch (err) {
      log("!", `Detailed fetch for item: ${id}: ${err.message}`);
    }
  }

  async function updateDetailedDatabase(data) {
    const operations = data.map((record) => ({
      updateOne: {
        filter: { index: record.index },
        update: { $set: record },
        upsert: true,
      },
    }));

    return await itemCollection.bulkWrite(operations);
  }

  let items = [];
  let current = 0;
  const total = itemIds.length;

  for (const element of itemIds) {
    const id = element["index"];
    if (!id) {
      // Products only available in taxfree stores, but not in vinmonopolets. We skip these.
      continue;
    }

    try {
      let product = await getInformation(id);
      if (!product) {
        log("!", `Detailed fetch for item ${id}. Aborting.`);
        break;
      }

      items.push(product);

      await new Promise((resolve) => setTimeout(resolve, 1100));
    } catch (err) {
      log("!", `Fetching info for item ${id} failed. Aborting. | ${err}`);
      break;
    }

    // Upsert to the database every 10 items.
    if (items.length >= 10) {
      log("+", ` Updating ${items.length} records.`);
      const result = await updateDetailedDatabase(items);
      log("+", ` Modified ${result.modifiedCount}.`);
      log("+", ` Upserted ${result.upsertedCount}.`);

      items = [];

      log("?", `Progress: ${Math.floor((current / total) * 100)} %`);
    }

    current++;
  }

  // Insert the remaining products, if any.
  if (items.length === 0) {
    return;
  }
  log("+", ` Updating ${items.length} final records.`);
  const result = await updateDetailedDatabase(items);
  log("+", ` Modified ${result.modifiedCount}.`);
  log("+", ` Upserted ${result.upsertedCount}.`);
}

const session = axios.create();

async function main() {
  const items = await itemCollection.distinct("index");
  await getNewProducts(items);

  let itemIds = await itemCollection
    .find({ index: { $exists: true }, description: null })
    .project({ index: 1, _id: 0 })
    .toArray();
  itemIds = itemIds.filter((item) => !isNaN(item.index));
  await updateInformation(itemIds);
}

try {
  await main();
  log("?", "Script completed successfully.");
} catch (error) {
  log("!", `Script terminated with error: ${error.message}`);
} finally {
  log("?", "Closing database connection.");
  await client.close();
}

process.exit(0);
