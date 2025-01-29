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
const itemCollection = database.collection("products");
const metaCollection = database.collection("metadata");

const URL = JSON.parse(process.env.TAXFREE);

const STORES = {
  5135: "Stavanger, Avgang & Ankomst",
  5136: "Stavanger, Bagasjehall (?)",
  5145: "Bergen, Avgang",
  5148: "Bergen, Ankomst",
  5155: "Trondheim, Avgang & Ankomst",
  5111: "Oslo, Ankomst",
  5114: "Oslo, Avgang",
  5115: "Oslo, Videreforbindelse",

  5110: null,
  5104: null,
  5149: null,
};
const CATEGORIES = ["Brennevin", "Musserende vin", "Øl", "Sider"];
const SUBCATEGORIES = {
  Hvitvin: "Hvitvin",
  Rødvin: "Rødvin",
  "Perlende vin": "Perlende vin",
  Rosévin: "Rosévin",
  Hetvin: "Sterkvin",
};

const LINKS = {
  image: "https://cdn.tax-free.no",
  product: "https://www.tax-free.no",
};
const IMAGE = {
  thumbnail: "https://bilder.vinmonopolet.no/bottle.png",
  product: "https://bilder.vinmonopolet.no/bottle.png",
};
function processImages(images) {
  if (!images) return IMAGE;

  return Object.fromEntries(
    Object.entries(images).map(([format, urlEnd]) => [format, `${LINKS.image}${urlEnd}`]),
  );
}

function processCategories(category, subcategory) {
  if (!category) return { category: category, subcategory: subcategory };

  if (category in CATEGORIES) return { category: category, subcategory: subcategory };

  return {
    category: category,
    subcategory: subcategory in SUBCATEGORIES ? SUBCATEGORIES[subcategory] : subcategory,
  };
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
      name: product.name?.no || null,
      volume: product.salesAmount * 100,

      ...processCategories(
        product.categoriesLevel1?.no?.at(0).split(" > ").at(-1) || null,
        product.categoriesLevel2?.no?.at(0).split(" > ").at(-1) || null,
      ),

      taxfree: {
        index: index,

        updated: true,

        name: product.name?.no || null,
        url: product.url ? `${LINKS.product}${product.url}` : null,
        images: product.picture ? processImages(product.picture) : IMAGE,

        description: product.description?.no || null,

        price: product.price.NOK,
        literprice: product.fullUnitPrice
          ? product.fullUnitPrice.NOK
          : product.price.NOK / product.salesAmount,
        volume: product.salesAmount * 100,
        alcohol: product.alcoholByVolume || null,
        alcoholprice: product.fullUnitPrice
          ? product.fullUnitPrice.NOK / product.alcoholByVolume
          : product.price.NOK / product.salesAmount / product.alcoholByVolume,

        ...processCategories(
          product.categoriesLevel1?.no?.at(0).split(" > ").at(-1) || null,
          product.categoriesLevel2?.no?.at(0).split(" > ").at(-1) || null,
        ),
        subsubcategory: product.categoriesLevel3?.no?.at(0).split(" > ").at(-1) || null,

        country: product.country?.no || null,
        district: product.region?.no || product.wineGrowingAhreaDetail?.no || null,
        subdistrict: product.wineGrowingAhreaDetail?.no || null,

        taste: {
          taste: product.taste?.no || null,
          fill: product.tasteFill?.no,
          intensity: product.tasteIntensity?.no,
        },
        ingredients: product.wineGrapes?.no || null,
        characteristics: [product.sweetness?.no],
        allergens: product.allergens?.no || null,
        pair: product.suitableFor?.no || null,

        year: product.year ? parseInt(product.year.no, 10) : null,

        sugar: product.suggarContent || null,
        acid: product.tasteTheAcid?.no || null,
        colour: product.colour?.no || null,

        instores: product.onlineExclusive || false,

        stores: {
          online: product.inOnlineStockInCodes
            ? product.inOnlineStockInCodes
                .map((code) => STORES[code])
                .filter((store) => store !== null)
            : null,
          physical: product.inPhysicalStockInCodes
            ? product.inPhysicalStockInCodes
                .map((code) => STORES[code])
                .filter((store) => store !== null)
            : null,
        },
      },
    });
  }

  return processed;
}

async function getPage(order, alreadyUpdated, retry = false) {
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

    console.log(`STATUS   | ${response.status} | Order: ${order}.`);
  } catch (err) {
    if (retry) {
      return [];
    }

    console.log(`ERROR    | Order: ${order} | Retrying. ${err}`);

    try {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      return getPage(order, alreadyUpdated, true);
    } catch (err) {
      console.log(`ERROR    | Order: ${order} | Failed. ${err}`);
    }
}

async function recordMatch(record) {
  // 1. name = taxfree.name
  // 2. name ≈ taxfree.name
  // 3. name.contains(taxfree.name) && taxfree.name.contains(name)
  // 4. name.contains(taxfree.name)
  // 5. taxfree.name.contains(name)
  // 6. name.contains(taxfree.name) > 75%
  // 7. taxfree.name.contains(name) > 75%
  // 8. name.contains(taxfree.name) > 50%
  // 9. taxfree.name.contains(name) > 50%
  // 10. if (name.split(' ').length > 5) name.contains(taxfree.name) > 25%
  // 11. if (taxfree.name.split(' ').length > 5) taxfree.name.contains(name) > 25%

  const cleanName = (name) =>
    name
      .toLowerCase()
      .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "")
      .trim();

  const getWords = (name) =>
    cleanName(name)
      .split(/\s+/)
      .filter((word) => word.length > 2);

  // Escape special regex characters
  const escapeRegex = (string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  };

  const taxfreeName = record.taxfree.name;
  const escapedTaxfreeName = escapeRegex(taxfreeName);
  const taxfreeWords = getWords(taxfreeName);

  // Build cascading match conditions
  const matchConditions = [
    // 1. Exact match
    { name: taxfreeName },

    // 2. Case-insensitive exact match
    { name: new RegExp(`^${escapedTaxfreeName}$`, "i") },

    // 3. Bi-directional containment
    { name: new RegExp(`.*${escapedTaxfreeName}.*|${escapedTaxfreeName}.*`, "i") },

    // 4. Name contains taxfree.name
    { name: new RegExp(`.*${escapedTaxfreeName}.*`, "i") },

    // 5. Taxfree.name contains name
    { name: new RegExp(`${escapedTaxfreeName}.*`, "i") },

    // 6-9. Word overlap > 75% and 50%
    {
      $expr: {
        $gte: [
          {
            $multiply: [
              100,
              {
                $divide: [
                  {
                    $size: {
                      $setIntersection: [{ $split: [{ $toLower: "$name" }, " "] }, taxfreeWords],
                    },
                  },
                  {
                    $size: { $split: [{ $toLower: "$name" }, " "] },
                  },
                ],
              },
            ],
          },
          75,
        ],
      },
    },
    {
      $expr: {
        $gte: [
          {
            $multiply: [
              100,
              {
                $divide: [
                  {
                    $size: {
                      $setIntersection: [{ $split: [{ $toLower: "$name" }, " "] }, taxfreeWords],
                    },
                  },
                  {
                    $size: { $split: [{ $toLower: "$name" }, " "] },
                  },
                ],
              },
            ],
          },
          50,
        ],
      },
    },

    // 10-11. Long names with > 25% match
    ...(taxfreeWords.length > 5
      ? [
          {
            $expr: {
              $gte: [
                {
                  $multiply: [
                    100,
                    {
                      $divide: [
                        {
                          $size: {
                            $setIntersection: [
                              { $split: [{ $toLower: "$name" }, " "] },
                              taxfreeWords,
                            ],
                          },
                        },
                        {
                          $size: { $split: [{ $toLower: "$name" }, " "] },
                        },
                      ],
                    },
                  ],
                },
                25,
              ],
            },
          },
        ]
      : []),
  ];

  // Try each match condition in sequence until a match is found
  for (const condition of matchConditions) {
    const existingRecord = await itemCollection.findOne({
      ...condition,
      volume: record.volume,
      ...(record.category && { category: record.category }),
    });

    if (existingRecord) return existingRecord;
  }

  return null;
}

async function updateDatabase(data) {
  // IF a record in the itemCollection exists with the following criteria:
  //  new.volume = itemCollection.volume
  //  new.name = itemCollection.name CLOSE MATCH
  //  OPTIONALLY AND IF EXISTST IN BOTH:
  //    new.category = itemCollection.category
  // THEN
  //  Set add the taxfree-dictionary to the existing record.
  // ELSE
  //  Insert a new record in the itemCollection.

  const operations = [];
  let counts = {
    match: 0,
    unmatch: 0,
  };

  for (const record of data) {
    // Find matching record in the database (i.e., vinmonopolet product).
    const existingRecord = await recordMatch(record);

    if (existingRecord) {
      counts.match++;
      // Update existing record by adding/updating taxfree information
      operations.push({
        updateOne: {
          filter: { index: existingRecord.index },
          update: [
            { $set: { "taxfree.oldprice": "$taxfree.price" } },
            { $set: { taxfree: record.taxfree } },
            { $set: { "taxfree.prices": { $ifNull: ["$taxfree.prices", []] } } },
            {
              $set: {
                "taxfree.prices": { $concatArrays: ["$taxfree.prices", ["$taxfree.price"]] },
              },
            },
            {
              $set: {
                "taxfree.discount": {
                  $cond: {
                    if: {
                      $and: [
                        { $gt: ["$taxfree.price", 0] },
                        { $gt: ["$price", 0] },
                        { $ne: ["$taxfree.price", null] },
                        { $ne: ["$price", null] },
                      ],
                    },
                    then: {
                      $multiply: [
                        {
                          $divide: [{ $subtract: ["$taxfree.price", "$price"] }, "$price"],
                        },
                        100,
                      ],
                    },
                    else: 0,
                  },
                },
              },
            },
          ],
        },
      });
    } else {
      counts.unmatch++;
      // Insert new record
      operations.push({
        updateOne: {
          filter: { "taxfree.index": record.taxfree.index },
          update: [{ $set: { "taxfree.oldprice": "$taxfree.price" } }, { $set: record }],
          upsert: true,
        },
      });
    }
  }

  console.log(`MATCHING | ${counts.match} | UNMATCHED | ${counts.unmatch}`);

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
      alreadyUpdated = alreadyUpdated.concat(items.map((item) => item.taxfree.index));

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
  const unupdatedCount = await itemCollection.countDocuments({
    "taxfree.updated": false,
    "taxfree.name": { $exists: true },
  });
  console.log(`NOT UPDATED | Items: ${unupdatedCount}`);
  if (threshold && unupdatedCount >= threshold) {
    console.log(`ERROR | Above threshold. | Aborting.`);
    return;
  }

  try {
    const result = await itemCollection.updateMany(
      { "taxfree.updated": false, "taxfree.name": { $exists: true } },
      [
        { $set: { "taxfree.oldprice": "$taxfree.price" } },
        {
          $set: {
            "taxfree.price": "$taxfree.oldprice",
            "taxfree.discount": 0,
            "taxfree.literprice": 0,
            "taxfree.alcoholprice": null,
          },
        },
        { $set: { "taxfree.prices": { $ifNull: ["$taxfree.prices", []] } } },
        { $set: { "taxfree.prices": { $concatArrays: ["$taxfree.prices", ["$taxfree.price"]] } } },
      ],
    );

    console.log(`MODIFIED ${result.modifiedCount} empty prices to unupdated products.`);
  } catch (err) {
    console.error(`ERROR | Adding unupdated prices. | ${err}`);
  }
}

async function main() {
  await metaCollection.updateOne({ id: "stock" }, { $set: { "prices.taxfree": false } });

  await itemCollection.updateMany({}, { $set: { "taxfree.updated": false } });
  await getProducts();

  // [!] ONLY RUN THIS AFTER ALL PRICES HAVE BEEN UPDATED [!]
  await syncUnupdatedProducts(100);

  await metaCollection.updateOne({ id: "stock" }, { $set: { "prices.taxfree": true } });
}

await main();

client.close();
