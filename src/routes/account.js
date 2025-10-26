import { Elysia, t } from "elysia";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

// Helper for cookie options
function getCookieOptions() {
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV.trim() === "production",
    sameSite: "lax",
    maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
    path: "/",
  };
  if (process.env.NODE_ENV.trim() === "production") {
    options.domain = ".snublejuice.no";
  }
  return options;
}

export const authenticate = async (context) => {
  try {
    const token = context.cookie.token?.value;

    if (!token) {
      context.user = null;
      return;
    }

    const decoded = jwt.verify(token, process.env.JWT_KEY.trim());
    if (!decoded || typeof decoded === "string" || !decoded.username) {
      context.user = null;
      return;
    }

    const user = await context.collections.users.findOne({
      username: decoded.username,
    });
    if (!user) {
      context.user = null;
      return;
    }

    context.user = {
      username: user.username,
      email: user.email,
      notify: user.notify,
    };
  } catch (error) {
    context.user = null;
  }
};

const accountRouter = new Elysia()
  .decorate("getCookieOptions", getCookieOptions)
  .derive(authenticate)
  .post(
    "/register",
    async ({ body, collections, cookie, set }) => {
      try {
        const { username, email, notify, password } = body;
        const users = collections.users;

        const existingUsername = await users.findOne({ username });
        if (existingUsername) {
          set.status = 400;
          return {
            message:
              "Wow, her gikk det unna. Dette brukernavnet allerede i bruk.",
          };
        }

        const existingEmail = await users.findOne({ email });
        if (existingEmail) {
          set.status = 400;
          return {
            message: "A-hva??? Denne epost-addressa er allerede i bruk.",
          };
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await users.insertOne({
          username,
          email,
          notify,
          password: hashedPassword,
          favourites: [],
        });

        const token = jwt.sign({ username }, process.env.JWT_KEY, {
          expiresIn: "365d",
        });
        cookie.token.set({ ...getCookieOptions(), value: token });

        set.status = 201;
        return { message: "Grattis, nå er du registrert!", username };
      } catch (error) {
        set.status = 500;
        return { message: "Hmm, noe gikk galt...", error: error.message };
      }
    },
    {
      body: t.Object({
        username: t.String(),
        email: t.String(),
        notify: t.Boolean(),
        password: t.String(),
      }),
    },
  )
  .post(
    "/login",
    async ({ body, collections, cookie, set }) => {
      try {
        const { username, password } = body;
        const users = collections.users;

        const user = await users.findOne({ username });
        if (!user) {
          set.status = 400;
          return {
            message:
              "Hmm. Du har visst glemt brukernavnet ditt. Eller kanskje du ikke enda er registrert?",
          };
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
          set.status = 401;
          return { message: "Hallo du, feil passord!" };
        }

        const token = jwt.sign(
          { username: user.username },
          process.env.JWT_KEY,
          { expiresIn: "365d" },
        );
        cookie.token.set({ ...getCookieOptions(), value: token });

        set.status = 201;
        return { message: "Logget inn!", username };
      } catch (error) {
        set.status = 500;
        return {
          message: "Hmm. Noe gikk galt. Kanskje du ikke enda er registrert?",
          error: error.message,
        };
      }
    },
    {
      body: t.Object({
        username: t.String(),
        password: t.String(),
      }),
    },
  )
  .post("/logout", ({ cookie, set }) => {
    cookie.token.remove(getCookieOptions());
    set.status = 200;
    return { ok: true };
  })
  .post(
    "/delete",
    async ({ body, collections, cookie, set }) => {
      try {
        const { username, password } = body;
        const users = collections.users;

        const user = await users.findOne({ username });
        if (!user) {
          set.status = 400;
          return {
            message:
              "Hmm. Du har visst glemt brukernavnet ditt. Eller kanskje du ikke enda er registrert?",
          };
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
          set.status = 401;
          return { message: "Hallo du, feil passord!" };
        }

        await users.deleteOne({ username });
        cookie.token.remove(getCookieOptions());
        set.status = 201;
        return { message: "Brukeren er slettet!" };
      } catch (error) {
        set.status = 500;
        return {
          message: "Fikk ikke slettet brukeren. Skrev du riktig passord?",
          error: error.message,
        };
      }
    },
    {
      body: t.Object({
        username: t.String(),
        password: t.String(),
      }),
    },
  )
  .post(
    "/favourite",
    async ({ body, collections, user, set }) => {
      if (!user) {
        set.status = 401;
        return { message: "Du må være logget inn for å legge til favoritter." };
      }
      try {
        let { index } = body;
        index = parseInt(index);
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
        set.status = 201;
        return { message: "Favoritt er oppdatert!" };
      } catch (error) {
        set.status = 500;
        return { message: "Noe gikk galt :-(", error: error.message };
      }
    },
    {
      body: t.Object({
        index: t.Numeric(),
      }),
    },
  )
  .post(
    "/notification",
    async ({ body, collections, user, set }) => {
      if (!user) {
        set.status = 401;
        return { message: "Du må være logget inn for å endre varslinger." };
      }
      try {
        const { notify } = body;
        const users = collections.users;

        await users.updateOne({ username: user.username }, [
          { $set: { notify } },
        ]);
        set.status = 201;
        return {
          message: `Du har ${notify ? "aktivert" : "deaktiveret"} varsling når nye tilbud er tilgjengelig!`,
        };
      } catch (error) {
        set.status = 500;
        return { message: "Noe gikk galt :-(", error: error.message };
      }
    },
    {
      body: t.Object({
        notify: t.Boolean(),
      }),
    },
  );

export default accountRouter;
