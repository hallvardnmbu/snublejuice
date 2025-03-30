import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const router = express.Router();

export const authenticate = async (req, res, next) => {
  try {
    const token = req.cookies.token;

    if (!token) {
      req.user = null;
      return next();
    }
    const decoded = jwt.verify(token, process.env.JWT_KEY);

    const user = await req.app.locals.users.findOne({ username: decoded.username });
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

router.post("/register", async (req, res) => {
  try {
    const { username, email, notify, password } = req.body;
    const users = req.app.locals.users;

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
      notify,
      password: hashedPassword,
      favourites: [],
    });

    const token = jwt.sign({ username: username }, process.env.JWT_KEY, { expiresIn: "365d" });
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
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

router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const users = req.app.locals.users;

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
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
      path: "/",
      domain: process.env.NODE_ENV === "production" ? ".snublejuice.no" : ".localhost",
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

router.post("/logout", async (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    domain: process.env.NODE_ENV === "production" ? ".snublejuice.no" : ".localhost",
  });
  res.status(200).json({ ok: true });
});

router.post("/delete", async (req, res) => {
  try {
    const { username, password } = req.body;
    const users = req.app.locals.users;

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
      secure: process.env.NODE_ENV === "production",
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

router.post("/favourite", authenticate, async (req, res) => {
  try {
    let { index } = req.body;
    index = parseInt(index);
    const users = req.app.locals.users;

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

router.post("/notification", authenticate, async (req, res) => {
  try {
    const { username, notify } = req.body;
    const users = req.app.locals.users;

    await users.updateOne({ username: username }, [
      {
        $set: {
          notify: notify,
        },
      },
    ]);

    res.status(201).json({
      message: `Du har ${notify ? "aktivert" : "deaktiveret"} varslin når nye tilbud er tilgjengelig!`,
    });
  } catch (error) {
    res.status(500).json({
      message: "Noe gikk galt :-(",
      error: error.message,
    });
  }
});

export default router;
