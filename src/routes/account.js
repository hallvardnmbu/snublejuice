import { Elysia, t } from "elysia";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

// Helper for cookie options
function getCookieOptions(cookie) {
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
    path: "/",
  };
  if (process.env.NODE_ENV === "production") {
    options.domain = ".snublejuice.no";
  }
  // For Elysia, the cookie object itself is passed, and then its properties
  if (cookie) {
    Object.assign(cookie, options);
  }
  return options; // Return options for direct use if needed elsewhere
}

export const authenticate = async (context) => {
  try {
    const token = context.cookie.token?.value; // Elysia accesses cookie value via .value

    if (!token) {
      context.user = null;
      return; // Continue to next handler or route
    }
    const decoded = jwt.verify(token, process.env.JWT_KEY);
    if (!decoded || typeof decoded === 'string' || !decoded.username) {
        context.user = null;
        return;
    }

    const user = await context.collections.users.findOne({ username: decoded.username });
    if (!user) {
      context.user = null;
      return;
    }
    context.user = { // Attach user to context
      username: user.username,
      email: user.email,
    };
  } catch (error) {
    context.user = null;
  }
};


const accountRouter = new Elysia({ prefix: "/account" })
  .decorate("getCookieOptions", getCookieOptions)
  .derive(async (context) => { // Use derive to run authenticate for all routes in this group if needed, or apply selectively
    await authenticate(context);
    return {};
  })
  .post("/register", async ({ body, collections, cookie, set, getCookieOptions: gco }) => {
    try {
      const { username, email, notify, password } = body;
      const users = collections.users;

      const existingUsername = await users.findOne({ username });
      if (existingUsername) {
        set.status = 400;
        return { message: "Wow, her gikk det unna. Dette brukernavnet allerede i bruk." };
      }

      const existingEmail = await users.findOne({ email });
      if (existingEmail) {
        set.status = 400;
        return { message: "A-hva??? Denne epost-addressa er allerede i bruk." };
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      await users.insertOne({
        username,
        email,
        notify,
        password: hashedPassword,
        favourites: [],
      });

      const token = jwt.sign({ username }, process.env.JWT_KEY, { expiresIn: "365d" });
      cookie.token.set({ ...gco(), value: token });

      set.status = 201;
      return { message: "Grattis, nå er du registrert!", username };
    } catch (error) {
      set.status = 500;
      return { message: "Hmm, noe gikk galt...", error: error.message };
    }
  }, {
    body: t.Object({
      username: t.String(),
      email: t.String(),
      notify: t.Boolean(),
      password: t.String()
    })
  })
  .post("/login", async ({ body, collections, cookie, set, getCookieOptions: gco }) => {
    try {
      const { username, password } = body;
      const users = collections.users;

      const user = await users.findOne({ username });
      if (!user) {
        set.status = 400;
        return { message: "Hmm. Du har visst glemt brukernavnet ditt. Eller kanskje du ikke enda er registrert?" };
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        set.status = 401;
        return { message: "Hallo du, feil passord!" };
      }

      const token = jwt.sign({ username: user.username }, process.env.JWT_KEY, { expiresIn: "365d" });
      cookie.token.set({ ...gco(), value: token });

      set.status = 201; // Changed from 200 to 201 for resource creation (session)
      return { message: "Logget inn!", username };
    } catch (error) {
      set.status = 500;
      return { message: "Hmm. Noe gikk galt. Kanskje du ikke enda er registrert?", error: error.message };
    }
  }, {
    body: t.Object({
      username: t.String(),
      password: t.String()
    })
  })
  .post("/logout", ({ cookie, set, getCookieOptions: gco }) => {
    cookie.token.remove(gco());
    set.status = 200;
    return { ok: true };
  })
  .post("/delete", async ({ body, collections, cookie, set, getCookieOptions: gco }) => {
    try {
      const { username, password } = body;
      const users = collections.users;

      const user = await users.findOne({ username });
      if (!user) {
        set.status = 400;
        return { message: "Hmm. Du har visst glemt brukernavnet ditt. Eller kanskje du ikke enda er registrert?" };
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        set.status = 401;
        return { message: "Hallo du, feil passord!" };
      }

      await users.deleteOne({ username });
      cookie.token.remove(gco());
      set.status = 200; // Changed from 201 as it's a deletion confirmation
      return { message: "Brukeren er slettet!" };
    } catch (error) {
      set.status = 500;
      return { message: "Fikk ikke slettet brukeren. Skrev du riktig passord?", error: error.message };
    }
  }, {
    body: t.Object({
      username: t.String(), // Assuming username is passed to identify which user to delete, if not the logged-in one
      password: t.String()
    })
  })
  .post("/favourite", async ({ body, collections, user, set }) => { // Ensure 'user' is correctly populated by authenticate
    if (!user) {
      set.status = 401;
      return { message: "Du må være logget inn for å legge til favoritter." };
    }
    try {
      let { index } = body;
      index = parseInt(index); // Ensure index is an integer
      const users = collections.users;

      await users.updateOne({ username: user.username }, [
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
      set.status = 200; // Changed from 201
      return { message: "Favoritt er oppdatert!" };
    } catch (error) {
      set.status = 500;
      return { message: "Noe gikk galt :-(", error: error.message };
    }
  }, {
    body: t.Object({
      index: t.Numeric() // Or t.Number() depending on how it's sent
    }),
    // BeforeHandle to ensure user is authenticated for this specific route
    beforeHandle: async (context) => {
      await authenticate(context);
      if (!context.user) {
        context.set.status = 401;
        return { message: "Authentication required" };
      }
    }
  })
  .post("/notification", async ({ body, collections, user, set }) => { // Ensure 'user' is correctly populated
    if (!user) {
      set.status = 401;
      return { message: "Du må være logget inn for å endre varslinger." };
    }
    try {
      const { notify } = body; // username from authenticated user
      const users = collections.users;

      await users.updateOne({ username: user.username }, [
        { $set: { notify } },
      ]);
      set.status = 200; // Changed from 201
      return { message: `Du har ${notify ? "aktivert" : "deaktiveret"} varsling når nye tilbud er tilgjengelig!` };
    } catch (error) {
      set.status = 500;
      return { message: "Noe gikk galt :-(", error: error.message };
    }
  }, {
    body: t.Object({
      notify: t.Boolean()
    }),
    beforeHandle: async (context) => {
      await authenticate(context);
      if (!context.user) {
        context.set.status = 401;
        return { message: "Authentication required" };
      }
    }
  });

export default accountRouter;
