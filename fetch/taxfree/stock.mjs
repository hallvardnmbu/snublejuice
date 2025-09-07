import { MongoClient, ServerApiVersion } from "mongodb";

const log = (level, message) => {
  console.log(`${level} [tax-stock] ${message}`);
};

const client = new MongoClient(
  `mongodb+srv://${process.env.MONGO_USR.trim()}:${process.env.MONGO_PWD.trim()}@snublejuice.faktu.mongodb.net/?retryWrites=true&w=majority&appName=snublejuice`,
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

const URL = {
  url: "https://namx6ho175-3.algolianet.com/1/indexes/*/queries?x-algolia-agent=Algolia%20for%20JavaScript%20(4.13.1)%3B%20Browser%3B%20JS%20Helper%20(3.14.2)",
  headers: {
    accept: "*/*",
    "accept-language": "en-US,en;q=0.9",
    "content-type": "application/x-www-form-urlencoded",
    "sec-ch-ua":
      '"Microsoft Edge";v="137", "Chromium";v="137", "Not/A)Brand";v="24"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "cross-site",
    "sec-gpc": "1",
    "x-algolia-api-key": "55252987cc07b733b24f13fc4754f42e",
    "x-algolia-application-id": "NAMX6HO175",
    Referer: "https://www.tax-free.no/",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  },
  requests: [
    {
      indexName: "prod_products_price_{}",
      params:
        "clickAnalytics=true&facetFilters=%5B%5B%22categoriesLevel0.no%3ADrikke%22%5D%5D&facets=%5B%22Packaging.no%22%2C%22WhiskyRegion.no%22%2C%22alcoholByVolume%22%2C%22bagInBox%22%2C%22brandName.no%22%2C%22categoriesLevel0.no%22%2C%22categoriesLevel1.no%22%2C%22colour.no%22%2C%22country.no%22%2C%22favorite%22%2C%22glutenFree.no%22%2C%22inStockIn%22%2C%22inStockInCodes%22%2C%22lastChance%22%2C%22memberOffer%22%2C%22norwegian%22%2C%22onlineExclusive%22%2C%22organic.no%22%2C%22premium%22%2C%22price.NOK%22%2C%22region.no%22%2C%22salesAmount%22%2C%22suggarContent%22%2C%22sweetness.no%22%2C%22tasteFill.no%22%2C%22tasteIntensity.no%22%2C%22tasteTheAcid.no%22%2C%22tiktokTrending%22%2C%22trending%22%2C%22wineCultivationArea.no%22%2C%22wineGrapes.no%22%2C%22wineGrowingAhreaDetail.no%22%2C%22year.no%22%5D&filters=availableInAirportCodes%3AOSL%20AND%20inStockIn%3AOSL%20AND%20allCategories%3A941&length=800&offset=0&query=&tagFilters=",
    },
    {
      indexName: "prod_products_price_{}",
      params:
        "analytics=false&clickAnalytics=false&facets=%5B%22categoriesLevel0.no%22%5D&filters=availableInAirportCodes%3AOSL%20AND%20inStockIn%3AOSL%20AND%20allCategories%3A941&hitsPerPage=0&length=800&offset=0&page=0&query=",
    },
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

      stores: product.inPhysicalStockInCodes
        ? product.inPhysicalStockInCodes
            .map((code) => STORES[code])
            .filter((store) => store !== null)
        : null,
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

    log("?", `Status code ${response.status} for order ${order}.`);
  } catch (err) {
    if (retry) {
      return [];
    }

    log("!", `Order: ${order} | Retrying. ${err}`);

    try {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      return getPage(order, alreadyUpdated, true);
    } catch (err) {
      log("!", `Order: ${order} | Failed. ${err}`);
    }
  }
}

async function updateDatabase(data) {
  const operations = data.map((record) => ({
    updateOne: {
      filter: { "taxfree.index": record.index },
      update: [{ $set: { "taxfree.stores": record.stores } }],
    },
  }));

  return await itemCollection.bulkWrite(operations);
}

async function getStock() {
  let items = [];
  let alreadyUpdated = [];

  let count = 0;

  for (const order of ["asc", "desc"]) {
    try {
      let products = await getPage(order, alreadyUpdated);
      if (products.length === 0) {
        log("?", `Done. Final order: ${order}.`);
        break;
      }

      items = items.concat(products);
      alreadyUpdated = alreadyUpdated.concat(items.map((item) => item.index));

      await new Promise((resolve) => setTimeout(resolve, 900));
    } catch (err) {
      log("!", `Order ${order}. ${err}`);
      break;
    }

    if (items.length === 0) {
      throw new Error(`No items. Aborting.`);
    }

    count += items.length;

    log("+", `Updating ${items.length} records.`);
    const result = await updateDatabase(items);
    log("+", ` Modified ${result.modifiedCount}.`);
    log("+", ` Upserted ${result.upsertedCount}.`);

    items = [];
  }

  log("?", `Done. Total items: ${count}.`);
  return;
}

async function main() {
  await itemCollection.updateMany({}, { $set: { "taxfree.stores": null } });
  await getStock();

  await metaCollection.updateOne(
    { id: "stock" },
    { $set: { taxfree: new Date() } },
  );
}

await main();

client.close();

process.exit(0);
