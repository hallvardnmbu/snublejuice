import express from "express";
import rateLimit from "express-rate-limit";
import vhost from "vhost";
import fs from "fs/promises";
import { MongoClient, ServerApiVersion } from "mongodb";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const _PER_PAGE = 15;
const _PRODUCTION = process.env.SJS_ENV === "production";

const port = 8080;
const app = express();
const limiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 100, // Limit each IP to 100 requests per `window` (10 minutes)
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

const categories = {
  null: null,
  alkoholfritt: "Alkoholfritt",
  aromatisert: "Aromatisert vin",
  brennevin: "Brennevin",
  fruktvin: "Fruktvin",
  hvitvin: "Hvitvin",
  mjød: "Mjød",
  musserende: "Musserende vin",
  perlende: "Perlende vin",
  rosévin: "Rosévin",
  rødvin: "Rødvin",
  sake: "Sake",
  sider: "Sider",
  sterkvin: "Sterkvin",
  øl: "Øl",
};

async function load({
  collection,
  visits,

  // Single parameters;
  category = null,
  subcategory = null,
  country = null,
  district = null,
  subdistrict = null,
  year = null,
  cork = null,
  storage = null,

  // Include non-alcoholic products;
  nonalcoholic = false,

  // Only show new products;
  news = false,

  // Show orderable and instores products;
  orderable = true,
  instores = false,

  // Array parameters;
  description = null,
  store = null,
  pair = null,

  // If specified, only include values >=;
  volume = null,
  alcohol = null,

  // Sorting;
  sort = "discount",
  ascending = true,

  // Pagination;
  page = 1,

  // Search for name;
  search = null,

  // Calculate total pages;
  fresh = true,
} = {}) {
  let pipeline = [];

  if (search) {
    pipeline.push({
      $search: {
        index: "name",
        compound: {
          should: [
            {
              text: {
                query: search,
                path: "name",
                score: { boost: { value: 10 } },
              },
            },
            {
              text: {
                query: search,
                path: "name",
                fuzzy: {
                  maxEdits: 2, // Max single-character edits
                  prefixLength: 1, // Exact beginning of word matches
                  maxExpansions: 1, // Max variations
                },
              },
            },
          ],
        },
      },
    });
  }

  let matchStage = {
    // Only include buyablem and updated products.
    buyable: true,
    updated: true,

    // Match the specified parameters if they are not null.
    ...(category && !search ? { category: category } : {}),
    ...(subcategory && !search ? { subcategory: subcategory } : {}),
    ...(country && !search ? { country: country } : {}),
    ...(district && !search ? { district: district } : {}),
    ...(subdistrict && !search ? { subdistrict: subdistrict } : {}),
    ...(year && !search ? { year: { $lte: year } } : {}),
    ...(cork && !search ? { cork: cork } : {}),
    ...(storage && !search ? { storage: storage } : {}),

    // Parameters that are arrays are matched using the $in operator.
    // ...(description.length && !search ? { "description.short": { $in: description } } : {}),
    ...(store && !search ? { stores: { $in: [store] } } : {}),
    // ...(pair.length && !search ? { pair: { $in: pair } } : {}),
  };

  let updated = null;
  if (!store) {
    if (orderable) {
      matchStage["orderable"] = true;
    }
    if (instores) {
      matchStage["instores"] = true;
    }
  } else {
    const date = await visits.findOne({ class: "updated" }, { _id: 0 });
    // Set the `updated` variable as the difference wrt. today as text.
    if (date) {
      const ONE_DAY = 1000 * 60 * 60 * 24;
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Reset time to start of day

      const compareDate = new Date(date.date);
      compareDate.setHours(0, 0, 0, 0); // Reset time to start of day

      const diff = Math.floor((today - compareDate) / ONE_DAY);

      updated = diff === 0 ? "i dag" : diff === 1 ? "i går" : `for ${diff} dager siden`;
    }
  }

  if (!search) {
    if (volume) {
      matchStage["volume"] = { ...matchStage["volume"], $gte: volume };
    }

    if (alcohol) {
      matchStage["alcohol"] = { ...matchStage["alcohol"], $gte: alcohol };
    }
    if (!nonalcoholic) {
      matchStage["alcohol"] = { ...matchStage["alcohol"], $ne: null, $exists: true, $gt: 0 };
    }

    matchStage[sort] = { ...matchStage[sort], $exists: true, $ne: null };
  }

  pipeline.push({ $match: matchStage });

  let total;
  if (fresh) {
    const tot = await collection.aggregate([...pipeline, { $count: "amount" }]).toArray();
    if (tot.length === 0) {
      total = 1;
    } else {
      total = Math.floor(tot[0].amount / _PER_PAGE) + 1;
    }
  } else {
    total = null;
  }

  if (!search) {
    pipeline.push({ $sort: { [sort]: ascending ? 1 : -1 } });
  }
  pipeline.push({ $skip: (page - 1) * _PER_PAGE }, { $limit: _PER_PAGE });

  try {
    const data = await collection.aggregate(pipeline).toArray();
    return { data, total, updated };
  } catch (err) {
    return { data: null, total: 1, updated: null };
  }
}

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
let visits = db.collection("visits");
let collection = db.collection("products");

snublejuice.get("/api/stores", async (req, res) => {
  try {
    const stores = await collection.distinct("stores");
    res.json(stores);
  } catch (err) {
    res.status(500).send(err);
  }
});

snublejuice.get("/api/countries", async (req, res) => {
  try {
    const countries = await collection.distinct("country");
    res.json(countries);
  } catch (err) {
    res.status(500).send(err);
  }
});

snublejuice.get("/maintenance", async (req, res) => {
  res.render("maintenance");
});

snublejuice.get("/", async (req, res) => {
  const currentDate = new Date();
  const currentMonth = currentDate.toISOString().slice(0, 7);

  if (_PRODUCTION) {
    if (Object.keys(req.query).length === 0) {
      await visits.updateOne(
        { class: "fresh" },
        {
          $inc: {
            total: 1,
            [`month.${currentMonth}`]: 1,
          },
        },
        { upsert: true },
      );
    } else {
      await visits.updateOne(
        { class: "newpage" },
        {
          $inc: {
            total: 1,
            [`month.${currentMonth}`]: 1,
          },
        },
        { upsert: true },
      );
    }
  }

  // If the year is 2025, reroute to maintenance page.
  if (currentDate.getFullYear() >= 2025) {
    return res.redirect(301, "/maintenance");
  }

  const page = parseInt(req.query.page) || 1;
  const sort = req.query.sort || "discount";
  const ascending = !(req.query.ascending === "false");
  const category = req.query.category || "Velg kategori";
  const country = req.query.country || null;
  const volume = parseFloat(req.query.volume) || null;
  const alcohol = parseFloat(req.query.alcohol) || null;
  const year = parseInt(req.query.year) || null;
  const search = req.query.search || null;
  let store = req.query.store || "Velg butikk";

  let orderable = store === "Velg butikk";
  if (orderable) {
    store = null;
  }

  try {
    let { data, total, updated } = await load({
      collection,
      visits,

      // Single parameters;
      category: categories[category],
      subcategory: null,
      country: country === "Alle land" ? null : country,
      district: null,
      subdistrict: null,
      year: year,
      cork: null,
      storage: null,

      // Include non-alcoholic products;
      nonalcoholic: false,

      // Only show products that are orderable;
      orderable: orderable,

      // Array parameters;
      description: null,
      store: store === "null" ? null : store,
      pair: null,

      // If specified, only include values >=;
      volume: volume,
      alcohol: alcohol,

      // Sorting;
      sort: sort,
      ascending: ascending,

      // Pagination;
      page: page,

      // Search for name;
      search: search,

      // Calculate total pages;
      fresh: true,
    });

    let visitors = (await visits.findOne({ class: "fresh" }))?.month[currentMonth] || 0;

    res.render("products", {
      visitors: visitors,
      updated: updated,
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
      store: store,
    });
  } catch (err) {
    console.error(err);
    res.render("products", {
      visitors: "X",
      updated: null,
      data: [],
      page: 1,
      totalPages: 1,
      sort: sort,
      ascending: ascending,
      category: category,
      country: country,
      volume: volume,
      alcohol: alcohol,
      year: year,
      search: search,
      store: store,
    });
  }
});

// API APPLICATION (api.ind320.no)
// ------------------------------------------------------------------------------------------------

const api = express();
api.use(express.json());
api.use(express.static(path.join(__dirname, "other", "api")));

const dataFile = path.join(__dirname, "other", "api", "data.json");
(async () => {
  try {
    await fs.access(dataFile);
  } catch {
    await fs.writeFile(dataFile, "[]");
  }
})();

api.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "other", "api", "index.html"));
});

api.get("/dates", async (req, res) => {
  try {
    const data = await fs.readFile(dataFile, "utf8");
    let jsonData = JSON.parse(data);

    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: "Both startDate and endDate are required" });
    }

    // Assert that the dates are in the correct format
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!datePattern.test(startDate) || !datePattern.test(endDate)) {
      return res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD" });
    }

    // Assert that the dates are of valid values
    const valuePattern = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
    if (!valuePattern.test(startDate) || !valuePattern.test(endDate)) {
      return res.status(400).json({ error: "Invalid date. Check their values" });
    }

    // Convert the dates to Date objects and assert that they are valid
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start) || isNaN(end)) {
      return res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD" });
    }

    // Assert that the start date is not greater than the end date
    if (start > end) {
      return res.status(400).json({ error: "startDate cannot be greater than endDate" });
    }

    jsonData = jsonData.filter((item) => {
      const itemDate = new Date(item.date);
      return itemDate >= start && itemDate <= end;
    });

    res.json(jsonData);
  } catch (error) {
    res.status(500).json({ error: "Failed to read data, are the dates correct?" });
  }
});

api.get("/id", async (req, res) => {
  try {
    const data = await fs.readFile(dataFile, "utf8");
    let jsonData = JSON.parse(data);

    const { value } = req.query;

    if (!value) {
      return res.status(400).json({ error: "Value is required" });
    }

    // Assert that the value is an integer.
    const parsedValue = parseInt(value, 10);
    if (isNaN(parsedValue)) {
      return res.status(400).json({ error: "Invalid id. Use an integer" });
    }

    jsonData = jsonData.filter((item) => item.id === parsedValue);

    res.json(jsonData);
  } catch (error) {
    res.status(500).json({ error: "Failed to read data" });
  }
});

// ORD APPLICATION (dagsord.no)
// ------------------------------------------------------------------------------------------------

const ord = express();
ord.set("view engine", "ejs");
ord.set("views", path.join(__dirname, "other", "ord", "views"));
ord.use(express.static(path.join(__dirname, "other", "ord", "public")));

let clientWord;
try {
  clientWord = await MongoClient.connect(
    `mongodb+srv://${process.env.MONGO_USR}:${process.env.MONGO_PWD}@ord.c8trc.mongodb.net/?retryWrites=true&w=majority&appName=ord`,
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
const dbWord = clientWord.db("ord");
let collectionWord = {
  bm: dbWord.collection("bm"),
  nn: dbWord.collection("nn"),
};

ord.get("/random", async (req, res) => {
  const dictionary = req.query.dictionary || "bm,nn";

  try {
    const words = [];
    for (const dict of dictionary.split(",")) {
      words.push(...(await collectionWord[dict].aggregate([{ $sample: { size: 1 } }]).toArray()));
    }

    res.render("page", {
      words: words,
      dictionary: dictionary,
      date: null,
      week: null,
      day: null,
      error: null,
    });
  } catch (error) {
    res.status(500).render("page", {
      words: [],
      dictionary: dictionary,
      date: null,
      week: null,
      day: null,
      error: error.message,
    });
  }
});

ord.get("/search", async (req, res) => {
  if (!req.query.word || typeof req.query.word !== "string" || !req.query.word.trim()) {
    return res.redirect(301, "/");
  }
  const word = req.query.word.trim().toLowerCase();
  const dictionary = req.query.dictionary || "bm,nn";

  try {
    const words = [];
    for (const dict of dictionary.split(",")) {
      words.push(
        ...(await collectionWord[dict]
          .aggregate([
            {
              $search: {
                index: "word",
                compound: {
                  should: [
                    {
                      text: {
                        query: word,
                        path: "word",
                        score: { boost: { value: 10 } },
                      },
                    },
                    {
                      text: {
                        query: word,
                        path: "word",
                        fuzzy: {
                          maxEdits: 2,
                          prefixLength: 1,
                          maxExpansions: 1,
                        },
                      },
                    },
                  ],
                },
              },
            },
            { $limit: 1 },
          ])
          .toArray()),
      );
    }

    res.render("page", {
      words: words,
      dictionary: dictionary,
      date: null,
      week: null,
      day: word,
      error: null,
    });
  } catch (error) {
    res.status(500).render("page", {
      words: [],
      dictionary: dictionary,
      date: null,
      week: null,
      day: word,
      error: error.message,
    });
  }
});

ord.get("/", async (req, res) => {
  const dictionary = req.query.dictionary || "bm,nn";

  const date = new Date();
  const getWeek = (date) => {
    // Copy date to avoid modifying the original
    const target = new Date(date.valueOf());

    // ISO weeks start on Monday (1), so adjust when the week starts on Sunday (0)
    const dayNum = date.getDay() || 7;

    // Set to nearest Thursday: current date + 4 - current day number
    target.setDate(target.getDate() + 4 - dayNum);

    // Get first day of year
    const yearStart = new Date(target.getFullYear(), 0, 1);

    // Calculate full weeks to nearest Thursday
    const weekNo = Math.ceil(((target - yearStart) / 86400000 + 1) / 7);

    return weekNo;
  };
  const week = getWeek(date);
  const day = date.toLocaleDateString("no-NB", { weekday: "long" }).toLowerCase();
  const today = date
    .toLocaleDateString("no-NB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })
    .split(".")
    .join("-");

  try {
    const words = [];
    for (const dict of dictionary.split(",")) {
      words.push(...(await collectionWord[dict].find({ date: today }).toArray()));
    }

    res.render("page", {
      words: words,
      dictionary: dictionary,
      date: today,
      week: week,
      day: day,
      error: null,
    });
  } catch (error) {
    res.status(500).render("page", {
      words: [],
      dictionary: dictionary,
      date: today,
      week: week,
      day: day,
      error: error.message,
    });
  }
});

// FINAL APP WITH ALL VHOSTS
// ------------------------------------------------------------------------------------------------

app.use(vhost("snublejuice.no", snublejuice));
app.use(vhost("www.snublejuice.no", snublejuice));
app.use(vhost("api.ind320.no", api));
app.use(vhost("ord.dilettant.no", ord));
app.use(vhost("dagsord.no", ord));
app.use(vhost("www.dagsord.no", ord));

if (_PRODUCTION) {
  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
} else {
  snublejuice.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
}
