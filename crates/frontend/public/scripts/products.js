const BOOL_FIELDS = new Set(["ascending", "favourites", "cprice", "cvolume", "calcohol", "cyear"]);
const INT_FIELDS = new Set(["page", "year"]);
const FLOAT_FIELDS = new Set(["price", "volume", "alcohol"]);
const ALWAYS = new Set(["ascending", "sort"]);
const BADGE_SKIP = new Set([
  "page",
  "ascending",
  "sort",
  "favourites",
  "cprice",
  "cvolume",
  "calcohol",
  "cyear",
]);

let lastAppliedParams = {};

function readParameters(overrides = {}) {
  const form = document.getElementById("filter");
  const data = new FormData(form);
  const params = {};

  for (const [key, value] of data.entries()) {
    if (!ALWAYS.has(key) && (value === "" || value === "null" || value === "false")) {
      continue;
    }

    if (BOOL_FIELDS.has(key)) {
      params[key] = value === "true";
    } else if (INT_FIELDS.has(key)) {
      params[key] = parseInt(value, 10);
    } else if (FLOAT_FIELDS.has(key)) {
      params[key] = parseFloat(value);
    } else {
      params[key] = value;
    }
  }

  if (!params.sort) {
    params.sort = "discount";
  }
  if (params.ascending === undefined) {
    params.ascending = true;
  }

  return { ...params, ...overrides };
}

function updateFilterBadge() {
  const badge = document.getElementById("filterBadge");
  if (!badge) return;

  let count = 0;
  for (const [key, value] of Object.entries(lastAppliedParams)) {
    if (BADGE_SKIP.has(key)) continue;
    if (value !== null && value !== undefined && value !== "" && value !== false) {
      count++;
    }
  }

  if (count > 0) {
    badge.textContent = count;
    badge.classList.add("visible");
  } else {
    badge.classList.remove("visible");
  }
}

function syncFavouritesButton(favourites) {
  const btn = document.getElementById("toggleFavourites");
  const input = document.querySelector('input[name="favourites"]');
  if (!btn || !input) return;

  btn.textContent = favourites ? "Alle produkter" : "Favoritter";
  input.value = favourites ? "true" : "";
}

function updateStoreFieldVisibility(favourites) {
  const taxfreeSelect = document.getElementById("stores-taxfree");
  const isTaxfree = taxfreeSelect?.tagName === "SELECT";
  const storelikeField = document.getElementById("storelike-field");
  const vinField = document.getElementById("store-vinmonopolet-field");
  if (!storelikeField || !vinField) return;

  const hide = favourites || isTaxfree;
  storelikeField.classList.toggle("hidden", hide);
  vinField.classList.toggle("hidden", hide);

  if (hide) {
    const storelike = document.querySelector('[name="storelike"]');
    if (storelike) storelike.value = "";
    const vinSelect = document.getElementById("stores-vinmonopolet");
    if (vinSelect) vinSelect.value = "";
  }
}

function bindPagination() {
  const container = document.getElementById("product-results");
  if (!container) return;

  container.querySelectorAll("nav button[data-page]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      const page = parseInt(btn.dataset.page, 10);
      if (page >= 1) {
        fetchProducts({ page });
      }
    });
  });
}

function bindProductInteractions() {
  const container = document.getElementById("product-results");
  if (!container) return;

  container.querySelectorAll(".favourite-toggle").forEach((star) => {
    star.addEventListener("click", async (event) => {
      event.stopPropagation();

      const index = parseInt(star.dataset.index, 10);
      const wasFilled = star.innerText.trim() === "★";

      const response = await fetch("/account/favourite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ index }),
      });

      if (!response.ok) return;

      star.innerText = wasFilled ? "☆" : "★";
    });
  });

  container.querySelectorAll(".product").forEach((section) => {
    section.addEventListener("click", (event) => {
      if (event.target.closest("button") || event.target.closest("a")) {
        return;
      }

      const itemIndex = section.getAttribute("index");
      const aside = document.getElementById(itemIndex)?.querySelector("aside");
      aside?.classList.toggle("hidden");
    });
  });
}

async function fetchProducts(overrides = {}) {
  const results = document.getElementById("product-results");
  if (!results) return;

  if (overrides.page !== undefined) {
    document.querySelector('input[name="page"]').value = overrides.page;
  }

  const params = readParameters(overrides);
  results.innerHTML = "<span>Laster …</span>";

  try {
    const response = await fetch("/data/products", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      results.innerHTML = "<span>Kunne ikke laste produkter.</span>";
      return;
    }

    const data = await response.json();
    results.innerHTML = data.html;
    lastAppliedParams = params;
    document.querySelector('input[name="page"]').value = data.page;

    updateFilterBadge();
    syncFavouritesButton(data.favourites);
    updateStoreFieldVisibility(data.favourites);
    bindPagination();
    bindProductInteractions();
  } catch (error) {
    console.error("Error fetching products:", error);
    results.innerHTML = "<span>Kunne ikke laste produkter.</span>";
  }
}

window.fetchProducts = fetchProducts;
window.readParameters = readParameters;

document.addEventListener("DOMContentLoaded", () => {
  fetchProducts();
});
