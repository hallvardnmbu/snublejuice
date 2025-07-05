import { renderFile } from "ejs";
import { Elysia } from "elysia";
import { staticPlugin } from "@elysiajs/static";

// import { ordAPP } from "./src/other/ord/app.js"; // Commented out as requested
// import { elektronApp } from "./src/other/elektron/app.js"; // Commented out as requested

import accountRouter, { authenticate } from "./src/routes/account.js";
import dataRouter from "./src/routes/data.js";

import { databaseConnection } from "./src/database/connect.js";
import {
  incrementVisitor,
  getMetadata,
  categories,
  load,
} from "./src/database/operations.js";

const _PRODUCTION = process.env.NODE_ENV === "production";
const port = 8080;

const collections = await databaseConnection();

// Helper function to render EJS templates
async function render(filePath, data) {
  return new Response(await renderFile(filePath, data), {
    headers: { "Content-Type": "text/html; charset=utf8" },
  });
}

const app = new Elysia()
  .use(staticPlugin({
    assets: "src/public",
    prefix: "/"
  }))
  .decorate("collections", collections)
  .decorate("render", render)
  .group("/account", (app) => app.use(accountRouter))
  .group("/data", (app) => app.use(dataRouter))
  .get("/error", async ({ query, decorate }) => {
    return decorate.render("src/views/error.ejs", {
      message: query.message || "Noe gikk galt.",
    });
  })
  .get("/", async (context) => {
    // Authenticate middleware needs to be adapted or re-implemented for Elysia
    // For now, we'll simulate a basic authentication check
    // The 'authenticate' function in account.js now populates context.user or leaves it null.
    // It's applied via .derive in accountRouter or beforeHandle for specific routes.
    // For the main '/' route, we need to explicitly call it if auth is mandatory,
    // or check context.user if it's optional and authentication runs globally.

    // Assuming authenticate is run globally or we call it here if needed.
    // For this route, let's make it so user can be null if not logged in.
    await authenticate(context); // Ensure context.user is populated if a valid token exists

    const { request, query, decorate, collections: appCollections, user: authenticatedUser } = context;
    const hostname = request.headers.get("host") || "";
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

    const user = context.user // Assuming authenticate middleware adds user to context
      ? {
          username: context.user.username,
          email: context.user.email,
          favourites:
            (
              await appCollections.users.findOne(
                { username: context.user?.username },
                { projection: { _id: 0, favourites: 1 } },
              )
            ).favourites || [],
        }
      : null;

    let meta = await getMetadata(appCollections.metadata);

    if (subdomain === "landing") {
      return decorate.render("src/views/landing.ejs", {
        user: user,
        visitors: {
          vinmonopolet: meta.visitors.fresh.month[month]?.vinmonopolet || 0,
          taxfree: meta.visitors.fresh.month[month]?.taxfree || 0,
        },
      });
    }

    if (!meta.stock.prices[subdomain]) {
      return Response.redirect(
        `/error?message=Prisene er ikke oppdatert.`,
        302,
      );
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
    const delta = parseInt(query.delta) || 1;
    const ascending = !(query.ascending === "false");

    const category = query.category || null;
    const country = query.country || null;

    const price = {
      value: parseFloat(query.price) || null,
      exact: query.cprice === "on",
    };
    const volume = {
      value: parseFloat(query.volume) || null,
      exact: query.cvolume === "on",
    };
    const alcohol = {
      value: parseFloat(query.alcohol) || null,
      exact: query.calcohol === "on",
    };
    const year = {
      value: parseInt(query.year) || null,
      exact: query.cyear === "on",
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
      let { data, total, updated } = await load({
        collection: appCollections.products,
        meta,
        subdomain,
        favourites: favourites && user ? user.favourites || [] : null,
        delta: delta,
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

      return decorate.render("src/views/products.ejs", {
        visitors: meta.visitors.fresh.month[month]?.[subdomain] || 0,
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
      return Response.redirect(
        `/error?message=Noe gikk galt.`,
        302,
      );
    }
  })
  .listen(port);

console.log(`Server running at http://localhost:${port}`);

// Vhost functionality will need to be handled differently in Bun,
// possibly by running multiple Bun server instances or using a reverse proxy.
// The original vhost logic is commented out below for reference.

/*
if (_PRODUCTION) {
  // ORD APPLICATION (dagsord.no)
  // const ord = await ordAPP(); // Commented out

  // ELEKTRON APPLICATION (elektron.dagsord.no)
  let elektron;
  try {
    // elektron = await elektronApp(); // Commented out
    console.log("✓ Elektron app initialized successfully");
  } catch (err) {
    console.error("✗ Elektron app initialization failed:", err.message);
    // Create a fallback app that shows an error
    // This needs to be adapted for Bun's HTTP server
    // elektron = new Elysia().get('*', () => new Response('Service temporarily unavailable', { status: 503 }));
  }

  // FINAL APP WITH ALL VHOSTS
  // Vhost functionality needs rethinking with Bun.
  // app.use(vhost("snublejuice.no", snublejuice));
  // app.use(vhost("www.snublejuice.no", snublejuice));
  // app.use(vhost("vinmonopolet.snublejuice.no", snublejuice));
  // app.use(vhost("taxfree.snublejuice.no", snublejuice));
  // app.use(vhost("dagsord.no", ord));
  // app.use(vhost("www.dagsord.no", ord));
  // app.use(vhost("elektron.dagsord.no", elektron));

} else {
  // ELEKTRON APPLICATION (elektron.localhost)
  // const elektron = await elektronApp(); // Commented out

  // app.use(vhost("localhost", snublejuice));
  // app.use(vhost("vinmonopolet.localhost", snublejuice));
  // app.use(vhost("taxfree.localhost", snublejuice));
  // app.use(vhost("elektron.localhost", elektron));

  console.log(`http://localhost:${port}`);
  console.log(`http://vinmonopolet.localhost:${port}`);
  console.log(`http://taxfree.localhost:${port}`);
  // console.log(`http://elektron.localhost:${port}`); // Commented out
}
*/
