import { MongoClient, ServerApiVersion } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

const client = new MongoClient(
  `mongodb+srv://${process.env.MONGO_USR}:${process.env.MONGO_PWD}@snublejuice.faktu.mongodb.net/?retryWrites=true&w=majority&appName=snublejuice`,
  {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  },
);
await client.connect();

const database = client.db("snublejuice");
const itemCollection = database.collection("taxfree");
const visitCollection = database.collection("visits");

const URL = JSON.parse(process.env.TAXFREE);

const LINK = "https://cdn.tax-free.no";
const IMAGE = {
  thumbnail: "https://bilder.vinmonopolet.no/bottle.png",
  product: "https://bilder.vinmonopolet.no/bottle.png",
};
function processImages(images) {
  if (!images) return IMAGE;

  return Object.fromEntries(
    Object.entries(images).map(([format, urlEnd]) => [format, `${LINK}${urlEnd}`]),
  );
}

function processProducts(products, alreadyUpdated) {
  const processed = [];

  for (const product of products) {
    const index = parseInt(product.code, 10) || null;

    // Extra check to avoid duplicates.
    // The alreadyUpdated is set in the main function below.
    // Only used if the scraping crashes and needs to be restarted.
    // In this way, it skips the already processed products (before crash).
    if (alreadyUpdated.includes(index)) {
      continue;
    }

    processed.push({
      index: index,
      id: parseInt(product.objectID, 10),

      updated: true,
      buyable: true,
      expired: false,
      sustainable: null,
      selection: null,

      name: product.name?.no || null,
      url: product.url ? `${LINK}${product.url}` : null,
      images: product.picture ? processImages(product.picture) : IMAGE,

      description: product.description?.no || null,

      price: product.price.NOK,
      literprice: product.fullUnitPrice
        ? product.fullUnitPrice.NOK
        : product.price.NOK / product.salesAmount,
      volume: product.salesAmount * 100,
      alcohol: product.alcoholByVolume || null,

      category: product.categoriesLevel1?.no?.at(0).split(" > ").at(-1) || null,
      subcategory:
        product.categoriesLevel2?.no?.at(0).split(" > ").at(-1) || product.categoryName?.no || null,
      subsubcategory: product.categoriesLevel3?.no?.at(0).split(" > ").at(-1) || null,

      country: product.country?.no || null,
      district: product.region?.no || product.wineGrowingAhreaDetail?.no || null,
      subdistrict: product.wineGrowingAhreaDetail?.no || null,

      taste: {
        taste: product.taste?.no || null,
        fill: product.tasteFill?.no,
        intensity: product.tasteIntensity?.no,
      },
      smell: null,
      ingredients: product.wineGrapes?.no || null,
      characteristics: [product.sweetness?.no],
      allergens: product.allergens?.no || null,
      pair: product.suitableFor?.no || null,
      storage: null,
      cork: null,

      year: product.year ? parseInt(product.year.no, 10) : null,

      sugar: product.suggarContent || null,
      acid: product.tasteTheAcid?.no || null,

      colour: product.colour?.no || null,

      instores: product.onlineExclusive || false,
      orderable: null,
      orderinfo: null,
      storeinfo: null,

      stores: product.availableIn || null,
    });
  }

  return processed;
}

async function getPage(order, alreadyUpdated) {
  try {
    const response = await fetch(URL.url, {
      method: "POST",
      headers: URL.headers,
      body: JSON.stringify({
        requests: URL.requests.map((req) => ({
          ...req,
          indexName: req.indexName.replace("{}", order),
        })),
      }),
    });

    if (response.status === 200) {
      const data = await response.json();
      return processProducts(data.results[0].hits, alreadyUpdated);
    }

    console.log(`STATUS | ${response.status} | Order: ${order}.`);
  } catch (err) {
    console.log(`ERROR | Order: ${order} | ${err.message}`);
  }
}

async function updateDatabase(data) {
  const operations = data.map((record) => ({
    updateOne: {
      filter: { index: record.index },
      update: [
        // { $set: { oldprice: "$price" } },
        { $set: { oldprice: null } },
        { $set: record },
        { $set: { prices: { $ifNull: ["$prices", []] } } },
        { $set: { prices: { $concatArrays: ["$prices", ["$price"]] } } },
        {
          $set: {
            discount: {
              $cond: {
                if: {
                  $and: [
                    { $gt: ["$oldprice", 0] },
                    { $gt: ["$price", 0] },
                    { $ne: ["$oldprice", null] },
                    { $ne: ["$price", null] },
                  ],
                },
                then: {
                  $multiply: [
                    {
                      $divide: [{ $subtract: ["$price", "$oldprice"] }, "$oldprice"],
                    },
                    100,
                  ],
                },
                else: 0,
              },
            },
          },
        },
        {
          $set: {
            alcoholprice: {
              $cond: {
                if: {
                  $and: [
                    { $gt: ["$literprice", 0] },
                    { $gt: ["$alcohol", 0] },
                    { $ne: ["$literprice", null] },
                    { $ne: ["$alcohol", null] },
                  ],
                },
                then: {
                  $divide: ["$literprice", "$alcohol"],
                },
                else: null,
              },
            },
          },
        },
      ],
      upsert: true,
    },
  }));

  return await itemCollection.bulkWrite(operations);
}

async function getProducts() {
  let items = [];
  let alreadyUpdated = [];

  let count = 0;

  for (const order of ["asc", "desc"]) {
    try {
      let products = await getPage(order, alreadyUpdated);
      if (products.length === 0) {
        console.log(`DONE | Final order: ${order}.`);
        break;
      }

      items = items.concat(products);
      alreadyUpdated = items.map((item) => item.index);

      await new Promise((resolve) => setTimeout(resolve, 900));
    } catch (err) {
      console.log(`ERROR | Order: ${order} | ${err}`);
      break;
    }

    if (items.length === 0) {
      throw new Error(`No items. Aborting.`);
    }

    count += items.length;

    console.log(`UPDATING | ${items.length} records.`);
    const result = await updateDatabase(items);
    console.log(`         | Modified ${result.modifiedCount}.`);
    console.log(`         | Upserted ${result.upsertedCount}.`);

    items = [];
  }

  console.log(`DONE | Total items: ${count}.`);
  return;
}

async function syncUnupdatedProducts(threshold = null) {
  const unupdatedCount = await itemCollection.countDocuments({ updated: false });
  console.log(`NOT UPDATED | Items: ${unupdatedCount}`);
  if (threshold && unupdatedCount >= threshold) {
    console.log(`ERROR | Above threshold. | Aborting.`);
    return;
  }

  try {
    const result = await itemCollection.updateMany({ updated: false }, [
      { $set: { oldprice: "$price" } },
      { $set: { price: "$oldprice", discount: 0, literprice: 0, alcoholprice: null } },
      { $set: { prices: { $ifNull: ["$prices", []] } } },
      { $set: { prices: { $concatArrays: ["$prices", ["$price"]] } } },
    ]);

    console.log(`MODIFIED ${result.modifiedCount} empty prices to unupdated products.`);
  } catch (err) {
    console.error(`ERROR | Adding unupdated prices. | ${err}`);
  }
}

async function main() {
  await visitCollection.updateOne({ class: "taxfree" }, { $set: { updated: false } });

  await itemCollection.updateMany({}, { $set: { updated: false } });
  await getProducts();

  // [!] ONLY RUN THIS AFTER ALL PRICES HAVE BEEN UPDATED [!]
  await syncUnupdatedProducts(100);

  await visitCollection.updateOne({ class: "taxfree" }, { $set: { updated: true } });
}

await main();

client.close();
