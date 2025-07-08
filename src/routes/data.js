import { Elysia } from "elysia";

const dataRouter = new Elysia()
  .get("/stores", async ({ collections, set }) => {
    try {
      const products = collections.products;
      if (!products) {
        set.status = 500;
        return { message: "Database products collection not available." };
      }

      const vinmonopolet = await products.distinct("stores");
      const taxfree = await products.distinct("taxfree.stores");
      set.status = 200;
      return { vinmonopolet, taxfree };
    } catch (err) {
      console.error("Error fetching stores:", err);
      set.status = 500;
      return { message: "Failed to fetch stores.", error: err.message };
    }
  })
  .get("/countries", async ({ collections, set }) => {
    try {
      const products = collections.products;
      if (!products) {
        set.status = 500;
        return { message: "Database products collection not available." };
      }

      const countries = await products.distinct("country");
      set.status = 200;
      return countries;
    } catch (err) {
      console.error("Error fetching countries:", err);
      set.status = 500;
      return { message: "Failed to fetch countries.", error: err.message };
    }
  });

export default dataRouter;
