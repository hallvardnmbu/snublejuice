import axios from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";
import { MongoClient, ServerApiVersion } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

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
const itemIds = await itemCollection.distinct("index");

const proxies = process.env.PROXY_IPS.split(",").flatMap((ip) => [
  new HttpsProxyAgent(
    `http://${process.env.PROXY_USR}:${process.env.PROXY_PWD}@${ip}:${process.env.PROXY_PRT}`,
  ),
]);

function getNextProxy(proxy) {
  if (proxies.length === 0) {
    throw new Error("No more proxies available!");
  }

  const index = proxy ? proxies.findIndex((p) => p.proxy.host === proxy.proxy.host) : -1;
  return proxies[(index + 1) % proxies.length];
}

function removeProxy(proxy) {
  const index = proxies.findIndex((p) => p.proxy.host === proxy.proxy.host);
  if (index > -1) {
    const removedProxy = proxies.splice(index, 1)[0];
    console.log(
      `Removed failing proxy ${removedProxy.proxy.host}. ${proxies.length} proxies remaining.`,
    );
  }
}

const URL =
  "https://www.vinmonopolet.no/vmpws/v2/vmp/search?fields=FULL&searchType=product&currentPage={}&q=%3Arelevance%3AnewProducts%3Atrue";

const LINK = "https://www.vinmonopolet.no{}";

const IMAGE = {
  thumbnail: "https://bilder.vinmonopolet.no/bottle.png",
  product: "https://bilder.vinmonopolet.no/bottle.png",
};

function processImages(images) {
  return images ? images.reduce((acc, img) => ({ ...acc, [img.format]: img.url }), {}) : IMAGE;
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

      orderable: product.productAvailability?.deliveryAvailability?.availableForPurchase || false,
      orderinfo:
        product.productAvailability?.deliveryAvailability?.infos?.[0]?.readableValue || null,

      instores: product.productAvailability?.storesAvailability?.availableForPurchase || false,
      storeinfo: product.productAvailability?.storesAvailability?.infos?.[0]?.readableValue || null,
    });
  }

  return processedProducts;
}

async function getPage(page, proxy) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const response = await session.get(URL.replace("{}", page), {
        // httpsAgent: proxy,
        timeout: 10000,
      });

      if (response.status === 200) {
        return processProducts(response.data["productSearchResult"]["products"]);
      }

      console.log(`Status code ${response.status} at page ${page} (trying another proxy); ${err}`);
    } catch (err) {
      console.log(`Request failed with proxy ${proxy.host} for page ${page}: ${err.message}`);
      if (err.code === "ECONNREFUSED" || err.code === "ETIMEDOUT") {
        removeProxy(proxy);
      }
    }

    try {
      proxy = getNextProxy(proxy);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (err) {
      throw new Error(`No more proxies available to fetch id ${id}`);
    }
  }

  throw new Error(`Failed to fetch page ${page} after 5 attempts.`);
}

async function updateDatabase(data) {
  return await itemCollection.insertMany(data);
}

async function getProducts() {
  let items = [];
  let proxy = getNextProxy();

  for (let page = 0; page < 10000; page++) {
    console.log(`Page ${page}.`);

    try {
      let products = await getPage(page, proxy);
      if (products.length === 0 || !products) {
        console.log(`No more new products (final page: ${page}).`);
        break;
      }

      items = items.concat(products);
      proxy = getNextProxy(proxy);

      await new Promise((resolve) => setTimeout(resolve, 1100));
    } catch (err) {
      console.log(`Error page ${page}! ${err}`);
      break;
    }

    // Upsert to the database every 10 pages.
    if (page % 10 === 0) {
      if (items.length === 0) {
        return;
      }

      console.log(`Adding ${items.length} products.`);
      const result = await updateDatabase(items);
      console.log(` Inserted ${result.insertedCount} records`);

      items = [];
    }
  }

  // Insert the remaining products, if any.
  if (items.length === 0) {
    return;
  }
  console.log(`Adding ${items.length} final products.`);
  const result = await updateDatabase(items);
  console.log(` Inserted ${result.insertedCount} records`);
}

const session = axios.create();

async function main() {
  await getProducts();
}

await main();

client.close();
