import express from "express";

const router = express.Router();

router.get("/stores", async (req, res) => {
  try {
    const products = req.app.locals.products;

    const vinmonopolet = await products.distinct("stores");
    const taxfree = await products.distinct("taxfree.stores");
    res.status(200).json({ vinmonopolet: vinmonopolet, taxfree: taxfree });
  } catch (err) {
    res.status(500).send(err);
  }
});

router.get("/countries", async (req, res) => {
  try {
    const products = req.app.locals.products;

    const countries = await products.distinct("country");
    res.status(200).json(countries);
  } catch (err) {
    res.status(500).send(err);
  }
});

export default router;
