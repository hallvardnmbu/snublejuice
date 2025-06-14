import express from "express";
import rateLimit from "express-rate-limit";
import vhost from "vhost";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";

import { ordAPP } from "./src/other/ord/app.js";

import accountRouter, { authenticate } from "./src/routes/account.js";
import dataRouter from "./src/routes/data.js";

import { databaseConnection } from "./src/database/connect.js";
import {
  incrementVisitor,
  getMetadata,
  categories,
  load,
} from "./src/database/operations.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const _PRODUCTION = process.env.NODE_ENV === "production";

const port = 8080;
const app = express();
const limiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 500, // 500 requests per windowMs (10 minutes)
  standardHeaders: true,
  legacyHeaders: false,
});
app.set("trust proxy", 1);
app.use(limiter);

const snublejuice = express();

snublejuice.set("view engine", "ejs");
snublejuice.set("views", path.join(__dirname, "src/views"));
snublejuice.use(express.static(path.join(__dirname, "src/public")));

snublejuice.use(express.json());
snublejuice.use(cookieParser());

const collections = await databaseConnection();
snublejuice.locals.users = collections.users;
snublejuice.locals.products = collections.products;
snublejuice.locals.metadata = collections.metadata;

snublejuice.use("/account", accountRouter);
snublejuice.use("/data", dataRouter);

snublejuice.get("/error", async (req, res) => {
  res.render("error", { message: req.query.message || "Noe gikk galt." });
});

snublejuice.get("/", authenticate, async (req, res) => {
  let subdomain = req.hostname.startsWith("taxfree")
    ? "taxfree"
    : req.hostname.startsWith("vinmonopolet")
      ? "vinmonopolet"
      : "landing";

  const month = new Date().toISOString().slice(0, 7);
  if (_PRODUCTION) {
    await incrementVisitor(
      req.app.locals.metadata,
      month,
      subdomain,
      Object.keys(req.query).length === 0,
    );
  }

  const user = req.user
    ? {
        username: req.user.username,
        email: req.user.email,
        favourites:
          (
            await req.app.locals.users.findOne(
              { username: req.user?.username },
              { projection: { _id: 0, favourites: 1 } },
            )
          ).favourites || [],
      }
    : null;

  let meta = await getMetadata(req.app.locals.metadata);

  if (subdomain === "landing") {
    return res.render("landing", {
      user: user,
      visitors: {
        vinmonopolet: meta.visitors.fresh.month[month].vinmonopolet || 0,
        taxfree: meta.visitors.fresh.month[month].taxfree || 0,
      },
    });
  }

  // Check if price updates are incomplete
  if (!meta.stock.prices[subdomain]) {
    return res.redirect("/error?message=Prisene er ikke oppdatert.");
  }

  const page = parseInt(req.query.page) || 1;
  const favourites = req.query.favourites === "true";

  const sort = req.query.sort || "discount";
  const sortBy =
    subdomain === "taxfree" && sort !== "alcohol"
      ? `taxfree.${sort}`
      : sort === "rating"
        ? "rating.value"
        : sort;
  const delta = parseInt(req.query.delta) || 1;
  const ascending = !(req.query.ascending === "false");

  const category = req.query.category || null;
  const country = req.query.country || null;

  const price = {
    value: parseFloat(req.query.price) || null,
    exact: req.query.cprice === "on",
  };
  const volume = {
    value: parseFloat(req.query.volume) || null,
    exact: req.query.cvolume === "on",
  };
  const alcohol = {
    value: parseFloat(req.query.alcohol) || null,
    exact: req.query.calcohol === "on",
  };
  const year = {
    value: parseInt(req.query.year) || null,
    exact: req.query.cyear === "on",
  };

  const search = req.query.search?.trim() || null;
  const storelike = req.query.storelike?.trim() || null;

  let store = {
    vinmonopolet:
      (subdomain === "vinmonopolet"
        ? req.query["store-vinmonopolet"] === "null"
          ? null
          : req.query["store-vinmonopolet"]
        : null) || null,
    taxfree:
      (subdomain === "taxfree"
        ? req.query["store-taxfree"] === "null"
          ? null
          : req.query["store-taxfree"]
        : null) || null,
  };
  let orderable =
    !store.vinmonopolet || store.vinmonopolet === "Spesifikk butikk";

  try {
    let { data, total, updated } = await load({
      collection: req.app.locals.products,
      meta,
      subdomain,

      // Return favourites only:
      favourites: (favourites && user) ? user.favourites || [] : null,

      // Single parameters:
      delta: delta,
      category: categories[category],
      country: country === "Alle land" ? null : country,

      // Include non-alcoholic products:
      nonalcoholic: false,

      // Only show products that are orderable:
      orderable: orderable,

      // Array parameters:
      store: store,

      // Special parameters:
      price: price,
      volume: volume,
      alcohol: alcohol,
      year: year,

      // Sorting:
      sort: sortBy,
      ascending: ascending,

      // Pagination:
      page: page,
      perPage: 15,

      // Search for name:
      search: search,
      storelike: storelike === "null" ? null : storelike,

      // Calculate total pages:
      fresh: true,
    });

    res.render("products", {
      visitors: meta.visitors.fresh.month[month][subdomain],
      subdomain: subdomain,
      user: user,
      favourites: favourites,
      updated: updated,
      message:
        delta > 1 && sort === "discount"
          ? "Sortering etter prisendring er ikke mulig når sammenlikning ikke er forrige måneds pris."
          : subdomain === "taxfree"
            ? "OBS: Det hender at sammenlikninger er ukorrekte. Det anbefales derfor alltid å dobbeltsjekke at produktene stemmer overens hos både vinmonopolet og tax-free ved å gå inn på lenkene deres. Beklager ulempen."
            : null,
      delta: delta,
      data: data,
      page: page,
      totalPages: total,
      sort: sort,
      ascending: ascending,
      category: category,
      country: country,

      price: price.value,
      cprice: price.exact,
      volume: volume.value,
      cvolume: volume.exact,
      alcohol: alcohol.value,
      calcohol: alcohol.exact,
      year: year.value,
      cyear: year.exact,

      search: search,
      storelike: storelike,
      store: store.vinmonopolet,
      taxfreeStore: store.taxfree,
    });
  } catch (err) {
    console.error(err);
    return res.redirect("/error?message=Noe gikk galt.");
  }
});

// FINAL APP
// ------------------------------------------------------------------------------------------------

if (_PRODUCTION) {
  // ORD APPLICATION (dagsord.no)
  const ord = await ordAPP();

  // FINAL APP WITH ALL VHOSTS
  app.use(vhost("snublejuice.no", snublejuice));
  app.use(vhost("www.snublejuice.no", snublejuice));
  app.use(vhost("vinmonopolet.snublejuice.no", snublejuice));
  app.use(vhost("taxfree.snublejuice.no", snublejuice));
  app.use(vhost("dagsord.no", ord));
  app.use(vhost("www.dagsord.no", ord));

  app.listen(port, () => {
    console.log(`http://localhost:${port}`);
  });
} else {
  app.use(vhost("localhost", snublejuice));
  app.use(vhost("vinmonopolet.localhost", snublejuice));
  app.use(vhost("taxfree.localhost", snublejuice));

  app.listen(port, () => {
    console.log(`http://localhost:${port}`);
    console.log(`http://vinmonopolet.localhost:${port}`);
    console.log(`http://taxfree.localhost:${port}`);
  });
}
