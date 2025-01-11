export const categories = {
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

export async function load({
  collection,
  visits,

  // Month delta:
  delta = 1,

  // Favourites:
  favourites = null,

  // Single parameters:
  category = null,
  subcategory = null,
  country = null,
  district = null,
  subdistrict = null,
  year = null,
  cork = null,
  storage = null,

  // Include non-alcoholic products:
  nonalcoholic = false,

  // Only show new products:
  news = false,

  // Show orderable and instores products:
  orderable = true,
  instores = false,

  // Array parameters:
  description = null,
  store = null,
  pair = null,

  // If specified, only include values >=:
  volume = null,
  alcohol = null,

  // Sorting:
  sort = "discount",
  ascending = true,

  // Pagination:
  page = 1,
  perPage = 15,

  // Search for name:
  search = null,
  storelike = null,

  // Calculate total pages:
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

  if (storelike && !favourites) {
    pipeline.push({
      $match: {
        stores: {
          $regex: `(^|[^a-zæøåA-ZÆØÅ])${storelike}([^a-zæøåA-ZÆØÅ]|$)`,
          $options: "i",
        },
      },
    });
  }

  let matchStage;
  if (favourites) {
    pipeline.push({ $match: { index: { $in: favourites } } });
    matchStage = {};
  } else {
    matchStage = {
      // Only include updated products.
      updated: true,

      // If favourites are specified, disregard the buyable parameter.
      ...(!favourites ? { buyable: true } : {}),

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
      ...(store && !search && !storelike ? { stores: { $in: [store] } } : {}),
      // ...(pair.length && !search ? { pair: { $in: pair } } : {}),
    };
  }

  let updated = null;
  if (!store && !storelike && !search && !favourites) {
    if (orderable) {
      matchStage["orderable"] = true;
    }
    if (instores) {
      matchStage["instores"] = true;
    }
  } else {
    const date = await visits.findOne({ class: "stores" }, { _id: 0 });
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

  if (!search && !favourites) {
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
      total = Math.floor(tot[0].amount / perPage) + 1;
    }
  } else {
    total = null;
  }

  if (!search) {
    pipeline.push({ $sort: { [sort]: ascending ? 1 : -1 } });
  }
  pipeline.push({ $skip: (page - 1) * perPage }, { $limit: perPage });

  try {
    let data = await collection.aggregate(pipeline).toArray();

    if (delta > 1) {
      data.forEach((item) => {
        item["oldprice"] = item["prices"][item["prices"].length - delta - 1];
        item["discount"] = ((item["price"] - item["oldprice"]) * 100) / item["oldprice"];
      });
    }

    return { data, total, updated };
  } catch (err) {
    return { data: null, total: 1, updated: null };
  }
}
