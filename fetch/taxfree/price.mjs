import { MongoClient, ServerApiVersion } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

const log = (level, message) => {
  console.log(`${level} [tax-price] ${message}`);
};

const client = new MongoClient(
  `mongodb+srv://${process.env.MONGO_USR}:${process.env.MONGO_PWD}@snublejuice.faktu.mongodb.net/?retryWrites=true&w=majority&appName=snublejuice`,
  {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: false,
      deprecationErrors: true,
    },
  },
);
await client.connect();

const database = client.db("snublejuice");
const itemCollection = database.collection("products");
const metaCollection = database.collection("metadata");

const URL = {
  url: "https://namx6ho175-3.algolianet.com/1/indexes/*/queries?x-algolia-agent=Algolia%20for%20JavaScript%20(4.13.1)%3B%20Browser%3B%20JS%20Helper%20(3.14.2)",
  headers: {
    "accept": "*/*",
    "accept-language": "en-US,en;q=0.9",
    "content-type": "application/x-www-form-urlencoded",
    "sec-ch-ua": "\"Microsoft Edge\";v=\"137\", \"Chromium\";v=\"137\", \"Not/A)Brand\";v=\"24\"",
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": "\"Windows\"",
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "cross-site",
    "sec-gpc": "1",
    "x-algolia-api-key": "55252987cc07b733b24f13fc4754f42e",
    "x-algolia-application-id": "NAMX6HO175",
    "Referer": "https://www.tax-free.no/",
    "Referrer-Policy": "strict-origin-when-cross-origin"
  },
  requests: [
    {
      indexName:"prod_products_price_{}", 
      params: "clickAnalytics=true&facetFilters=%5B%5B%22categoriesLevel0.no%3ADrikke%22%5D%5D&facets=%5B%22Packaging.no%22%2C%22WhiskyRegion.no%22%2C%22alcoholByVolume%22%2C%22bagInBox%22%2C%22brandName.no%22%2C%22categoriesLevel0.no%22%2C%22categoriesLevel1.no%22%2C%22colour.no%22%2C%22country.no%22%2C%22favorite%22%2C%22glutenFree.no%22%2C%22inStockIn%22%2C%22inStockInCodes%22%2C%22lastChance%22%2C%22memberOffer%22%2C%22norwegian%22%2C%22onlineExclusive%22%2C%22organic.no%22%2C%22premium%22%2C%22price.NOK%22%2C%22region.no%22%2C%22salesAmount%22%2C%22suggarContent%22%2C%22sweetness.no%22%2C%22tasteFill.no%22%2C%22tasteIntensity.no%22%2C%22tasteTheAcid.no%22%2C%22tiktokTrending%22%2C%22trending%22%2C%22wineCultivationArea.no%22%2C%22wineGrapes.no%22%2C%22wineGrowingAhreaDetail.no%22%2C%22year.no%22%5D&filters=availableInAirportCodes%3AOSL%20AND%20inStockIn%3AOSL%20AND%20allCategories%3A941&length=800&offset=0&query=&tagFilters="
    }, 
    {
      indexName:"prod_products_price_{}", 
      params: "analytics=false&clickAnalytics=false&facets=%5B%22categoriesLevel0.no%22%5D&filters=availableInAirportCodes%3AOSL%20AND%20inStockIn%3AOSL%20AND%20allCategories%3A941&hitsPerPage=0&length=800&offset=0&page=0&query="
    }
  ],
};

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
    Object.entries(images).map(([format, urlEnd]) => [
      format,
      `${LINKS.image}${urlEnd}`,
    ]),
  );
}

function processCategories(category, subcategory) {
  if (!category) return { category: category, subcategory: subcategory };

  if (category in CATEGORIES)
    return { category: category, subcategory: subcategory };

  return {
    category: category,
    subcategory:
      subcategory in SUBCATEGORIES ? SUBCATEGORIES[subcategory] : subcategory,
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
      volume: product.salesAmount * 100,

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
        subsubcategory:
          product.categoriesLevel3?.no?.at(0).split(" > ").at(-1) || null,

        country: product.country?.no || null,
        district:
          product.region?.no || product.wineGrowingAhreaDetail?.no || null,
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

        stores: product.inPhysicalStockInCodes
          ? product.inPhysicalStockInCodes
              .map((code) => STORES[code])
              .filter((store) => store !== null)
          : null,
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
      return processProducts(
        data.results.reduce((acc, curr) => acc.concat(curr.hits), []),
        alreadyUpdated,
      );
    }

    log("?", `Status code ${response.status} received for order ${order}.`);
  } catch (err) {
    if (retry) {
      return [];
    }

    log(
      "!",
      `Error while processing order ${order}. Retrying. Details: ${err}`,
    );

    try {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      return getPage(order, alreadyUpdated, true);
    } catch (err) {
      log("!", `Failed to process order ${order}. Details: ${err}`);
    }
  }
}

async function existingMatch(record) {
  const designations =
    record.taxfree.name.match(/V\.S\.O\.P\.|V\.S\.|X\.O\./gi) || [];

  record.taxfree.name = record.taxfree.name
    // Remove volume measurements, case insensitive:
    // - Decimals: 0,70L, 1.00L
    // - Non-decimals: 5cL, 75L
    .replace(/\d+(?:[,\.]\d+)?\s*[a-zA-Z]l/gi, "")
    // Clean up extra spaces
    .replace(/\s+/g, " ")
    .trim();
  const nWords = record.taxfree.name.split(" ").filter((word) => word).length;

  const aggregation = [
    ...(nWords <= 3
      ? [
          {
            $search: {
              index: "name",
              compound: {
                must: [
                  // TODO: Currently, the last word is boosted. This should be improved.
                  {
                    text: {
                      query: record.taxfree.name.split(" ").pop(),
                      path: "name",
                      score: { boost: { value: 2 } },
                    },
                  },
                  // // Must match any special designations if present
                  // ...designations.map((designation) => ({
                  //   text: {
                  //     query: designation,
                  //     path: "name",
                  //     score: {
                  //       boost: { value: 1.5 },
                  //     },
                  //   },
                  // })),
                  // Fuzzy search on the rest of the words
                  {
                    text: {
                      query: record.taxfree.name,
                      path: "name",
                      fuzzy: {
                        maxEdits: Math.max(nWords - 1, 1),
                        prefixLength: 0,
                        maxExpansions: 1,
                      },
                    },
                  },
                ],
              },
            },
          },
        ]
      : [
          {
            $search: {
              index: "name",
              compound: {
                // must: [
                //   // Must match any special designations if present
                //   ...designations.map((designation) => ({
                //     text: {
                //       query: designation,
                //       path: "name",
                //       score: {
                //         boost: { value: 1.5 },
                //       },
                //     },
                //   })),
                // ],
                should: [
                  {
                    phrase: {
                      query: record.taxfree.name,
                      path: "name",
                      score: { boost: { value: 2 } },
                    },
                  },
                  {
                    text: {
                      query: record.taxfree.name,
                      path: "name",
                      fuzzy: {
                        maxEdits: Math.min(nWords, 2),
                        prefixLength: 0,
                        maxExpansions: 1,
                      },
                    },
                  },
                ],
              },
            },
          },
        ]),
    {
      $addFields: {
        score: { $meta: "searchScore" },
      },
    },
    {
      $match: { score: { $gt: 20.0 } },
    },
    {
      $match: {
        volume: record.volume,
        ...(record.taxfree.category && { category: record.taxfree.category }),
      },
    },
    {
      $sort: { score: -1 },
    },
    {
      $limit: 1,
    },
  ];

  const match = await itemCollection.aggregate(aggregation).toArray();

  // Debugging:
  // console.log(`\nName "${record.taxfree.name}" is ${nWords} long.`);
  // console.log(`Aggre: ${JSON.stringify(aggregation)}`);
  // console.log(`Match: ${JSON.stringify(match)}`);
  // console.log(`TAXFR: ${JSON.stringify(record.taxfree.url)}`);
  // console.log(`MATCH: ${JSON.stringify(match[0] ? match[0].url : null)}`);

  return match[0] || null;
}

async function updateDatabase(data, existing = []) {
  const operations = [];
  let counts = {
    match: 0,
    unmatch: 0,
  };

  for (const record of data) {
    const vinmonoopolet = existing.includes(record.taxfree.index)
      ? false
      : (await existingMatch(record)) || null;

    if (vinmonoopolet) {
      counts.match++;
      operations.push({
        updateOne: {
          filter: { index: vinmonoopolet.index },
          update: [
            { $set: { "taxfree.oldprice": "$taxfree.price" } },
            { $set: { taxfree: record.taxfree } },
            { $set: { "taxfree.score": vinmonoopolet.score } },
            {
              $set: { "taxfree.prices": { $ifNull: ["$taxfree.prices", []] } },
            },
            {
              $set: {
                "taxfree.prices": {
                  $concatArrays: ["$taxfree.prices", ["$taxfree.price"]],
                },
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
                          $divide: [
                            { $subtract: ["$taxfree.price", "$price"] },
                            "$price",
                          ],
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
      operations.push({
        updateOne: {
          filter: { "taxfree.index": record.taxfree.index },
          update: [
            {
              $set:
                vinmonoopolet === null
                  ? {
                      "taxfree.oldprice": "$taxfree.price",
                      "taxfree.discount": 0,
                    }
                  : {},
            },
            { $set: { taxfree: record.taxfree } },
            {
              $set: { "taxfree.prices": { $ifNull: ["$taxfree.prices", []] } },
            },
            {
              $set: {
                "taxfree.prices": {
                  $concatArrays: ["$taxfree.prices", ["$taxfree.price"]],
                },
              },
            },
          ],
          upsert: true,
        },
      });
    }
  }

  log(
    "?",
    `Matching items: ${counts.match}, Unmatched items: ${counts.unmatch}`,
  );

  return await itemCollection.bulkWrite(operations);
}

async function getProducts(existing = []) {
  let items = [];
  let alreadyUpdated = [];

  let count = 0;

  for (const order of ["asc", "desc"]) {
    try {
      let products = await getPage(order, alreadyUpdated);
      if (products.length === 0) {
        log("?", `Processing completed for final order: ${order}.`);
        break;
      }

      items = items.concat(products);
      alreadyUpdated = alreadyUpdated.concat(
        items.map((item) => item.taxfree.index),
      );

      await new Promise((resolve) => setTimeout(resolve, 900));
    } catch (err) {
      log(
        "!",
        `Error encountered while processing order ${order}. Details: ${err}`,
      );
      break;
    }

    if (items.length === 0) {
      throw new Error(`No items. Aborting.`);
    }

    count += items.length;

    log("+", `Updating ${items.length} records.`);
    const result = await updateDatabase(items, existing);
    log("+", ` Modified: ${result.modifiedCount}.`);
    log("+", ` Upserted: ${result.upsertedCount}.`);

    items = [];
  }

  log("?", `Processing completed. Total items processed: ${count}.`);
  return;
}

async function syncUnupdatedProducts(threshold = null) {
  const unupdatedCount = await itemCollection.countDocuments({
    "taxfree.updated": false,
    "taxfree.name": { $exists: true },
  });
  log("?", `Number of items not updated: ${unupdatedCount}`);
  if (threshold && unupdatedCount >= threshold) {
    log("!", `Threshold exceeded. Aborting operation.`);
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
        {
          $set: {
            "taxfree.prices": {
              $concatArrays: ["$taxfree.prices", ["$taxfree.price"]],
            },
          },
        },
      ],
    );

    log(
      "+",
      `Modified ${result.modifiedCount} empty prices for unupdated products.`,
    );
  } catch (err) {
    log("!", `Error while adding unupdated prices. Details: ${err}`);
  }
}

async function main() {
  await metaCollection.updateOne(
    { id: "stock" },
    { $set: { "prices.taxfree": false } },
  );

  await itemCollection.updateMany({}, { $set: { "taxfree.updated": false } });
  // await itemCollection.deleteMany({ name: { $exists: false } });
  // await itemCollection.updateMany({}, { $unset: { taxfree: "" } });
  const existing = await itemCollection.distinct("taxfree.index");
  await getProducts(existing);

  // [!] ONLY RUN THIS AFTER ALL PRICES HAVE BEEN UPDATED [!]
  await syncUnupdatedProducts(100);

  await metaCollection.updateOne(
    { id: "stock" },
    { $set: { "prices.taxfree": true, taxfree: new Date() } },
  );
}

await main();

client.close();

process.exit(0);