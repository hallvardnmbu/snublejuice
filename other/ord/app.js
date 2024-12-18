import express from "express";
import { MongoClient, ServerApiVersion } from "mongodb";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function ordAPP() {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "views"));
  app.use(express.static(path.join(__dirname, "public")));

  const client = await MongoClient.connect(
    `mongodb+srv://${process.env.MONGO_USR}:${process.env.MONGO_PWD}@ord.c8trc.mongodb.net/?retryWrites=true&w=majority&appName=ord`,
    {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: false,
        deprecationErrors: true,
      },
    },
  );
  const dbWord = client.db("ord");
  let collectionWord = {
    bm: dbWord.collection("bm"),
    nn: dbWord.collection("nn"),
  };

  app.get("/random", async (req, res) => {
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

  app.get("/search", async (req, res) => {
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

  app.get("/", async (req, res) => {
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

  return app;
}
