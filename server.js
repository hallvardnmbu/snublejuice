import { renderFile } from "ejs";
import { Elysia } from "elysia";
import { staticPlugin } from "@elysiajs/static";
import { spawn } from "bun";
import path from "path";

import ordApp from "./src/other/ord/app.js";
import elektronApp from "./src/other/elektron/app.js";
import dilettantApp from "./src/other/dilettant/app.js";

import accountRouter, { authenticate } from "./src/routes/account.js";
import dataRouter from "./src/routes/data.js";

import { databaseConnection } from "./src/database/connect.js";
import {
  incrementVisitor,
  getMetadata,
  categories,
  load,
} from "./src/database/operations.js";

const _PRODUCTION = process.env.NODE_ENV.trim() === "production";
const port = 8080;
const _RATINGS = false;

const collections = await databaseConnection();

// Helper function to render EJS templates
async function render(filePath, data) {
  return new Response(await renderFile(filePath, data), {
    headers: { "Content-Type": "text/html; charset=utf8" },
  });
}

const app = new Elysia()
  .use(
    staticPlugin({
      assets: "src/public",
      prefix: "/",
    }),
  )
  .decorate("collections", collections)
  .decorate("render", render)
  .derive(authenticate)
  .group("/account", (app) => app.use(accountRouter))
  .group("/data", (app) => app.use(dataRouter))
  .get("/error", async ({ query, render }) => {
    return render("src/views/error.ejs", {
      message: query.message || "Noe gikk galt.",
    });
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
      return render("src/views/landing.ejs", {
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

      return render("src/views/products.ejs", {
        visitors: meta.visitors.fresh.month[month]?.[subdomain] || 0,
        subdomain: subdomain,
        user: user,
        favourites: favourites,
        message:
          subdomain === "taxfree"
            ? "OBS: Det hender at sammenlikninger er ukorrekte. Det anbefales derfor alltid å dobbeltsjekke at produktene stemmer overens hos både vinmonopolet og tax-free ved å gå inn på lenkene deres. Beklager ulempen."
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
      return Response.redirect(`/error?message=Noe gikk galt.`, 302);
    }
  });

const hostApps = {};
if (_PRODUCTION) {
  // Start the Vivino rating script as a detached background process
  if (_RATINGS) {
    const ratingScript = path.resolve("fetch/vivino/rating.mjs");
    const ratingProcess = spawn({
      cmd: ["bun", ratingScript],
      stdio: ["ignore", "inherit", "inherit"],
    });
    ratingProcess.unref && ratingProcess.unref();
  }

  // ORD APPLICATION (dagsord.no)
  hostApps["dagsord.no"] = ordApp;
  hostApps["www.dagsord.no"] = ordApp;

  // ELEKTRON APPLICATION (elektron.dagsord.no)
  hostApps["elektron.dagsord.no"] = elektronApp;

  // DILETTANT APPLICATION (dilettant.no)
  hostApps["dilettant.no"] = dilettantApp;
  hostApps["www.dilettant.no"] = dilettantApp;

  // SNUBLEJUICE APPLICATION (snublejuice.no)
  hostApps["snublejuice.no"] = app;
  hostApps["www.snublejuice.no"] = app;
  hostApps["vinmonopolet.snublejuice.no"] = app;
  hostApps["taxfree.snublejuice.no"] = app;
} else {
  hostApps["dagsord.localhost"] = ordApp;
  hostApps["elektron.localhost"] = elektronApp;
  hostApps["dilettant.localhost"] = dilettantApp;

  hostApps["localhost"] = app;
  hostApps["vinmonopolet.localhost"] = app;
  hostApps["taxfree.localhost"] = app;
}

const mainServer = new Elysia()
  .all("*", async ({ request }) => {
    let hostname = request.headers.get("host") || "";
    hostname = hostname.split(":")[0];

    const targetApp = hostApps[hostname];

    if (targetApp) {
      return await targetApp.handle(request);
    }

    return new Response("No vhost match", { status: 404 });
  })
  .listen(port);

console.log(`Server running at http://localhost:${port}`);
if (!_PRODUCTION) {
  console.log(`http://localhost:${port}`);
  console.log(`http://vinmonopolet.localhost:${port}`);
  console.log(`http://taxfree.localhost:${port}`);
  console.log(`http://dagsord.localhost:${port}`);
  console.log(`http://elektron.localhost:${port}`);
  console.log(`http://dilettant.localhost:${port}`);
}
