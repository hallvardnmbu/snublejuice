export async function incrementVisitor(collection, month, subdomain, fresh) {
  const current = fresh ? "fresh" : "newpage";

  await collection.updateOne(
    { id: "visitors" },
    {
      $inc: {
        [`${current}.total`]: 1,
        [`${current}.month.${month}.${subdomain}`]: 1,
      },
    },
    { upsert: true },
  );
}

export async function getMetadata(collection) {
  return (await collection.find({}, { _id: 0 }).toArray()).reduce((acc, item) => {
    const { id, ...rest } = item;
    acc[id] = rest;
    return acc;
  }, {});
}

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
  meta,
  subdomain,

  // Month delta:
  delta = 1,

  // Favourites:
  favourites = null,

  // Single parameters:
  category = null,
  country = null,

  // Include non-alcoholic products:
  nonalcoholic = false,

  // Show orderable and instores products:
  orderable = true,
  instores = false,

  // Array parameters:
  store = { vinmonopolet: null, taxfree: null },

  // Special parameters:
  price = { value: null, exact: false },
  volume = { value: null, exact: false },
  alcohol = { value: null, exact: false },
  year = { value: null, exact: false },

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
  const taxfree = subdomain === "taxfree";

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

  if (storelike && !favourites && !taxfree) {
    pipeline.push({
      $match: {
        stores: {
          $regex: `(^|[^a-zæøåA-ZÆØÅ])${storelike}([^a-zæøåA-ZÆØÅ]|$)`,
          $options: "i",
        },
      },
    });
  }

  if (favourites) {
    pipeline.push({ $match: { index: { $in: favourites } } });
  }

  let matchStage = {
    // Only include updated products.
    ...(!taxfree ? { updated: true } : { "taxfree.updated": true }),

    // If favourites are specified, disregard the buyable parameter.
    ...(!favourites && !taxfree ? { buyable: true } : {}),

    // Match the specified parameters if they are not null.
    ...(category && !search ? { category: category } : {}),
    ...(country && !search ? { country: country } : {}),

    // Parameters that are arrays are matched using the $in operator.
    ...(store.vinmonopolet && !search && !storelike && !taxfree
      ? { stores: { $in: [store.vinmonopolet] } }
      : {}),
    ...(store.taxfree && !search && taxfree ? { "taxfree.stores": { $in: [store.taxfree] } } : {}),
  };

  let updated = null;
  if (!store.vinmonopolet && !storelike && !search && !favourites && !taxfree) {
    if (orderable) {
      matchStage["orderable"] = true;
    }
    if (instores) {
      matchStage["instores"] = true;
    }
  } else {
    let date = meta.stock[subdomain];
    // Set the `updated` variable as the difference wrt. today as text.
    if (date) {
      const ONE_DAY = 1000 * 60 * 60 * 24;
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Reset time to start of day

      const compareDate = new Date(date);
      compareDate.setHours(0, 0, 0, 0); // Reset time to start of day

      const diff = Math.floor((today - compareDate) / ONE_DAY);

      updated = diff === 0 ? "i dag" : diff === 1 ? "i går" : `for ${diff} dager siden`;
    }
  }

  if (!search) {
    if (price.value) {
      matchStage["price"] = {
        ...matchStage["price"],
        [price["exact"] ? "$eq" : "$lte"]: price["value"],
      };
    }

    if (volume.value) {
      matchStage["volume"] = {
        ...matchStage["volume"],
        [volume["exact"] ? "$eq" : "$gte"]: volume["value"],
      };
    }

    if (alcohol.value) {
      matchStage["alcohol"] = {
        ...matchStage["alcohol"],
        [alcohol["exact"] ? "$eq" : "$gte"]: alcohol["value"],
      };
    }

    if (year.value) {
      matchStage["year"] = {
        ...matchStage["year"],
        [year["exact"] ? "$eq" : "$lte"]: year["value"],
      };
    }

    if (!nonalcoholic) {
      matchStage["alcohol"] = { ...matchStage["alcohol"], $ne: null, $exists: true, $gt: 0 };
    }

    matchStage[sort] = { ...matchStage[sort], $exists: true, $ne: null };
    if (sort === "rating") {
      matchStage["rating.value"] = { $exists: true, $ne: null };
    }
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
        item["oldprice"] = item["prices"][Math.max(item["prices"].length - delta - 1, 0)];
        item["discount"] = ((item["price"] - item["oldprice"]) * 100) / item["oldprice"];
      });
    }

    return { data, total, updated };
  } catch (err) {
    console.log(err);
    return { data: null, total: 1, updated: null };
  }
}
