import { renderFile } from "ejs";
import { Elysia } from "elysia";
import { staticPlugin } from "@elysiajs/static";
import { dirname, join } from "path";
import path from "path";

let __dirname = dirname(new URL(import.meta.url).pathname);
__dirname =
  __dirname.startsWith("/") && __dirname.includes(":")
    ? __dirname.replace(/^\/([A-Z]):/, "$1:\\").replace(/\//g, "\\")
    : __dirname;

import accountRouter, { authenticate } from "./src/routes/account.js";
import dataRouter from "./src/routes/data.js";

import { databaseConnection } from "./src/database/connect.js";
import {
  incrementVisitor,
  getMetadata,
  categories,
  load,
} from "./src/database/operations.js";

const _PRODUCTION = process.env.ENVIRONMENT.trim() === "production";
const collections = await databaseConnection();

// Helper function to render EJS templates
async function render(filePath, data) {
  return new Response(await renderFile(filePath, data), {
    headers: { "Content-Type": "text/html; charset=utf8" },
  });
}

const snublejuice = new Elysia()
  .use(
    staticPlugin({
      assets: join(__dirname, "src/public"),
      prefix: "/",
    }),
  )
  .decorate("collections", collections)
  .decorate("render", render)
  .derive(authenticate)
  .group("/account", (app) => app.use(accountRouter))
  .group("/data", (app) => app.use(dataRouter))
  .get("/error", async ({ query, render, user }) => {
    return render(join(__dirname, "src/views/error.ejs"), {
      user: user,
    });
  })
  .get("/image/:index", async ({ params: { index } }) => {
    // Sanitize index to allow only alphanumeric characters
    if (!/^[a-zA-Z0-9]+$/.test(index)) {
      return new Response("Invalid index", { status: 400 });
    }

    const imageDir = process.env.IMAGE_DIR;
    if (!imageDir) {
      return new Response("No image database found", { status: 500 });
    }

    const filePath = path.join(imageDir, `${index}.png`);
    const file = Bun.file(filePath);

    if (await file.exists()) {
      return new Response(file);
    } else {
      return new Response("Image not found", { status: 204 });
    }
  })
  .get("/", async (context) => {
    const {
      request,
      query,
      render,
      collections: appCollections,
      user: authenticatedUser,
    } = context;

    const hostname = request.headers.get("host") || "";

    if (hostname.startsWith("snake")) {
      return Bun.file(join(__dirname, "src/other/snake.html"));
    }

    let subdomain = hostname.startsWith("taxfree")
      ? "taxfree"
      : hostname.startsWith("vinmonopolet")
        ? "vinmonopolet"
        : "landing";

    const month = new Date().toISOString().slice(0, 7);
    if (_PRODUCTION) {
      await incrementVisitor(
        appCollections.metadata,
        month,
        subdomain,
        Object.keys(query).length === 0,
      );
    }

    const user = authenticatedUser // Use the authenticated user from context
      ? {
          username: authenticatedUser.username,
          email: authenticatedUser.email,
          notify: authenticatedUser.notify,
          favourites:
            (
              await appCollections.users.findOne(
                { username: authenticatedUser?.username },
                { projection: { _id: 0, favourites: 1 } },
              )
            ).favourites || [],
        }
      : null;

    let meta = await getMetadata(appCollections.metadata);

    if (subdomain === "landing") {
      return render(join(__dirname, "src/views/landing.ejs"), {
        user: user,
        visitors: {
          vinmonopolet: meta.visitors.fresh.month[month]?.vinmonopolet || 0,
          taxfree: meta.visitors.fresh.month[month]?.taxfree || 0,
        },
      });
    }

    if (!meta.stock.prices[subdomain]) {
      return Response.redirect(`/error`, 302);
    }

    const page = parseInt(query.page) || 1;
    const favourites = query.favourites === "true";

    const sort = query.sort || "discount";
    const sortBy =
      subdomain === "taxfree" && sort !== "alcohol"
        ? `taxfree.${sort}`
        : sort === "rating"
          ? "rating.value"
          : sort;
    const ascending = !(query.ascending === "false");

    const category = query.category || null;
    const country = query.country || null;

    const price = {
      value: parseFloat(query.price) || null,
      exact: query.cprice === "true",
    };
    const volume = {
      value: parseFloat(query.volume) || null,
      exact: query.cvolume === "true",
    };
    const alcohol = {
      value: parseFloat(query.alcohol) || null,
      exact: query.calcohol === "true",
    };
    const year = {
      value: parseInt(query.year) || null,
      exact: query.cyear === "true",
    };

    const search = query.search?.trim() || null;
    const storelike = query.storelike?.trim() || null;

    let store = {
      vinmonopolet:
        (subdomain === "vinmonopolet"
          ? query["store-vinmonopolet"] === "null"
            ? null
            : query["store-vinmonopolet"]
          : null) || null,
      taxfree:
        (subdomain === "taxfree"
          ? query["store-taxfree"] === "null"
            ? null
            : query["store-taxfree"]
          : null) || null,
    };
    let orderable =
      !store.vinmonopolet || store.vinmonopolet === "Spesifikk butikk";

    try {
      let { data, total } = await load({
        collection: appCollections.products,
        meta,
        subdomain,
        favourites: favourites && user ? user.favourites || [] : null,
        category: categories[category],
        country: country === "Alle land" ? null : country,
        nonalcoholic: false,
        orderable: orderable,
        store: store,
        price: price,
        volume: volume,
        alcohol: alcohol,
        year: year,
        sort: sortBy,
        ascending: ascending,
        page: page,
        perPage: 15,
        search: search,
        storelike: storelike === "null" ? null : storelike,
        fresh: true,
      });

      return render(join(__dirname, "src/views/products.ejs"), {
        visitors: meta.visitors.fresh.month[month]?.[subdomain] || 0,
        subdomain: subdomain,
        user: user,
        favourites: favourites,
        message:
          subdomain === "taxfree"
            ? "N.b.: Det hender at sammenlikninger er ukorrekte. Dette anbefales derfor å dobbeltsjekke før kjøp via lenkene til vinmonopolet og tax-free."
            : null,
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
      return Response.redirect(`/error`, 302);
    }
  });

export default snublejuice;

if (import.meta.main) {
  snublejuice.listen(3000);
  console.log(
    `Running at http://${snublejuice.server?.hostname}:${snublejuice.server?.port}`,
  );
}
