import express from "express";
import rateLimit from "express-rate-limit";
import vhost from "vhost";
import { MongoClient, ServerApiVersion } from "mongodb";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";

import { categories, load } from "./fetch.js";
import { apiAPP } from "./other/api/app.js";
import { ordAPP } from "./other/ord/app.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const _PRODUCTION = process.env.NODE_ENV === "production";

const port = 8080;
const app = express();
const limiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 500, // Limit each IP to 100 requests per `window` (10 minutes)
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});
app.set("trust proxy", 1);
app.use(limiter);

// SNUBLEJUICE APPLICATION
// ------------------------------------------------------------------------------------------------

const snublejuice = express();

snublejuice.set("view engine", "ejs");
snublejuice.set("views", path.join(__dirname, "views"));
snublejuice.use(express.static(path.join(__dirname, "public")));

snublejuice.use(express.json());
snublejuice.use(cookieParser());

let client;
try {
  client = await MongoClient.connect(
    `mongodb+srv://${process.env.MONGO_USR}:${process.env.MONGO_PWD}@snublejuice.faktu.mongodb.net/?retryWrites=true&w=majority&appName=snublejuice`,
    {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: false,
        deprecationErrors: true,
      },
    },
  );
} catch (err) {
  console.error("Failed to connect to MongoDB", err);
  process.exit(1);
}
const db = client.db("snublejuice");
let metadata = db.collection("metadata");
let users = db.collection("users");
let collection = db.collection("products");

snublejuice.get("/api/stores", async (req, res) => {
  try {
    const vinmonopolet = await collection.distinct("stores");
    const taxfree = await collection.distinct("taxfree.stores");
    res.status(200).json({ vinmonopolet: vinmonopolet, taxfree: taxfree });
  } catch (err) {
    res.status(500).send(err);
  }
});

snublejuice.get("/api/countries", async (req, res) => {
  try {
    const countries = await collection.distinct("country");
    res.status(200).json(countries);
  } catch (err) {
    res.status(500).send(err);
  }
});

snublejuice.get("/error", async (req, res) => {
  res.render("error");
});

snublejuice.post("/api/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Check if user already exists.
    const existingUsername = await users.findOne({
      username: username,
    });
    if (existingUsername) {
      return res.status(400).json({
        message: "Wow, her gikk det unna. Dette brukernavnet allerede i bruk.",
      });
    }

    // Check if email already exists.
    const existingEmail = await users.findOne({
      email: email,
    });
    if (existingEmail) {
      return res.status(400).json({
        message: "A-hva??? Denne epost-addressa er allerede i bruk.",
      });
    }

    // Store the user in the database.
    const hashedPassword = await bcrypt.hash(password, 10);
    await users.insertOne({
      username,
      email,
      password: hashedPassword,
      favourites: [],
    });

    const token = jwt.sign({ username: username }, process.env.JWT_KEY, { expiresIn: "365d" });
    res.cookie("token", token, {
      httpOnly: true,
      secure: _PRODUCTION,
      sameSite: "strict",
      maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
      path: "/",
    });

    res.status(201).json({
      message: "Grattis, nå er du registrert!",
      username: username,
    });
  } catch (error) {
    res.status(500).json({
      message: "Hmm, noe gikk galt...",
      error: error.message,
    });
  }
});

snublejuice.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    // Check if user exists.
    const user = await users.findOne({ username: username });
    if (!user) {
      return res.status(400).json({
        message:
          "Hmm. Du har visst glemt brukernavnet ditt. Eller kanskje du ikke enda er registrert?",
      });
    }

    // Check if password is correct.
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        message: "Hallo du, feil passord!",
      });
    }

    const token = jwt.sign({ username: user.username }, process.env.JWT_KEY, { expiresIn: "365d" });

    res.cookie("token", token, {
      httpOnly: true,
      secure: _PRODUCTION,
      sameSite: "strict",
      maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
      path: "/",
      domain: _PRODUCTION ? ".snublejuice.no" : ".localhost",
    });

    res.status(201).json({
      message: "Logget inn!",
      username: username,
    });
  } catch (error) {
    res.status(500).json({
      message: "Hmm. Noe gikk galt. Kanskje du ikke enda er registrert?",
      error: error.message,
    });
  }
});

snublejuice.post("/api/logout", async (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: _PRODUCTION,
    sameSite: "strict",
    path: "/",
    domain: _PRODUCTION ? ".snublejuice.no" : ".localhost",
  });
  res.status(200).json({ ok: true });
});

snublejuice.post("/api/delete", async (req, res) => {
  try {
    const { username, password } = req.body;

    // Check if user exists.
    const user = await users.findOne({ username: username });
    if (!user) {
      return res.status(400).json({
        message:
          "Hmm. Du har visst glemt brukernavnet ditt. Eller kanskje du ikke enda er registrert?",
      });
    }

    // Check if password is correct.
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        message: "Hallo du, feil passord!",
      });
    }

    await users.deleteOne({ username: username });
    res.clearCookie("token", {
      httpOnly: true,
      secure: _PRODUCTION,
      sameSite: "strict",
      path: "/",
    });
    res.status(201).json({
      message: "Brukeren er slettet!",
    });
  } catch (error) {
    res.status(500).json({
      message: "Fikk ikke slettet brukeren. Skrev du riktig passord?",
      error: error.message,
    });
  }
});

const authenticate = async (req, res, next) => {
  try {
    const token = req.cookies.token;

    if (!token) {
      req.user = null;
      return next();
    }
    const decoded = jwt.verify(token, process.env.JWT_KEY);

    const user = await users.findOne({ username: decoded.username });
    if (!user) {
      req.user = null;
      return next();
    }
    req.user = {
      username: user.username,
      email: user.email,
    };

    next();
  } catch (error) {
    req.user = null;
    next();
  }
};

snublejuice.post("/api/favourite", authenticate, async (req, res) => {
  try {
    let { index } = req.body;
    index = parseInt(index);

    await users.updateOne({ username: req.user.username }, [
      {
        $set: {
          favourites: {
            $cond: {
              if: { $in: [index, "$favourites"] },
              then: {
                $filter: {
                  input: "$favourites",
                  cond: { $ne: ["$$this", index] },
                },
              },
              else: { $concatArrays: ["$favourites", [index]] },
            },
          },
        },
      },
    ]);

    res.status(201).json({
      message: "Favoritt er oppdatert!",
    });
  } catch (error) {
    res.status(500).json({
      message: "Noe gikk galt :-(",
      error: error.message,
    });
  }
});

async function incrementVisitor(month, taxfree, fresh) {
  const current = fresh ? "fresh" : "newpage";

  if (_PRODUCTION) {
    await metadata.updateOne(
      { id: "visitors" },
      {
        $inc: {
          [`${current}.total`]: 1,
          [`${current}.month.${month}`]: 1,
        },
      },
      { upsert: true },
    );
  }
}

snublejuice.get("/", authenticate, async (req, res) => {
  const user = req.user
    ? {
        username: req.user.username,
        email: req.user.email,
        favourites:
          (
            await users.findOne(
              { username: req.user?.username },
              { projection: { _id: 0, favourites: 1 } },
            )
          ).favourites || [],
      }
    : null;

  const currentDate = new Date();
  const currentMonth = currentDate.toISOString().slice(0, 7);

  let taxfree = req.hostname.startsWith("taxfree");

  let visitors = await metadata.findOne({ id: "visitors" }, { _id: 0 });
  visitors = visitors
    ? visitors.fresh.month[currentMonth][taxfree ? "taxfree" : "vinmonopolet"] || 0
    : 0;

  if (!req.hostname.startsWith("vinmonopolet") && !req.hostname.startsWith("taxfree")) {
    return res.render("landing", { user: user, visitors: visitors });
  }

  await incrementVisitor(currentMonth, taxfree, Object.keys(req.query).length === 0);

  const page = parseInt(req.query.page) || 1;
  const delta = parseInt(req.query.delta) || 1;
  const sort = req.query.sort || "discount";
  let sortBy = sort;
  if (taxfree && sortBy !== "alcohol") {
    sortBy = `taxfree.${sortBy}`;
  }
  const ascending = !(req.query.ascending === "false");
  const category = req.query.category || null;
  const country = req.query.country || null;
  const volume = parseFloat(req.query.volume) || null;
  const alcohol = parseFloat(req.query.alcohol) || null;
  const year = parseInt(req.query.year) || null;
  const search = req.query.search || null;
  const storelike = req.query.storelike || null;
  let store = req.query["store-vinmonopolet"] || "Spesifikk butikk";
  let taxfreeStore = taxfree ? req.query["store-taxfree"] || null : null;
  const includeFavourites = req.query.favourites === "true";

  let orderable = store === "Spesifikk butikk";
  if (orderable) {
    store = null;
  }
  if (taxfreeStore === "Alle flyplasser") {
    taxfreeStore = null;
  }

  // Check if items have `updated = false` or if it is a new month and price updates are not yet completed
  const priceUpdatesCompleted = await metadata.findOne({ id: "stock" });
  if (!priceUpdatesCompleted.prices[taxfree ? "taxfree" : "vinmonopolet"]) {
    return res.redirect("/error");
  }

  try {
    let { data, total, updated } = await load({
      collection,
      metadata,
      taxfree,

      // Month delta:
      delta: delta,

      // Favourites:
      favourites: includeFavourites ? user.favourites || [] : null,

      // Single parameters:
      category: categories[category],
      subcategory: null,
      country: country === "Alle land" ? null : country,
      district: null,
      subdistrict: null,
      year: year,
      cork: null,
      storage: null,

      // Include non-alcoholic products:
      nonalcoholic: false,

      // Only show products that are orderable:
      orderable: orderable,

      // Array parameters:
      description: null,
      store: store === "null" ? null : store,
      taxfreeStore: taxfreeStore,
      pair: null,

      // If specified, only include values >=:
      volume: volume,
      alcohol: alcohol,

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
      visitors: visitors,
      taxfree: taxfree,
      user: user,
      favourites: includeFavourites,
      updated: updated,
      message:
        delta > 1 && sort === "discount"
          ? "Sortering etter prisendring er ikke mulig når sammenlikning ikke er forrige måneds pris."
          : null,
      delta: delta,
      data: data,
      page: page,
      totalPages: total,
      sort: sort,
      ascending: ascending,
      category: category,
      country: country,
      volume: volume,
      alcohol: alcohol,
      year: year,
      search: search,
      storelike: storelike,
      store: store,
      taxfreeStore: taxfreeStore,
    });
  } catch (err) {
    console.error(err);
    return res.redirect("/error");
  }
});

// FINAL APP
// ------------------------------------------------------------------------------------------------

if (_PRODUCTION) {
  // API APPLICATION (api.ind320.no)
  const api = await apiAPP();

  // ORD APPLICATION (dagsord.no)
  const ord = await ordAPP();

  // FINAL APP WITH ALL VHOSTS
  app.use(vhost("snublejuice.no", snublejuice));
  app.use(vhost("www.snublejuice.no", snublejuice));
  app.use(vhost("vinmonopolet.snublejuice.no", snublejuice));
  app.use(vhost("taxfree.snublejuice.no", snublejuice));
  app.use(vhost("api.ind320.no", api));
  app.use(vhost("ord.dilettant.no", ord));
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
