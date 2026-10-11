const _STORE_DEFAULTS = {
  vinmonopolet: { text: "Spesifikk butikk", value: "" },
  taxfree: { text: "Alle flyplasser", value: "" },
};

const _COUNTRY_DEFAULT = { text: "Alle land", value: "" };

let _storesCache = null;
let _countriesCache = null;
let _pairsCache = null;

function capitalize(text) {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function populateSelect(select, items, defaultOption, selectedValue) {
  if (!select) return;

  const value = selectedValue ?? select.value ?? defaultOption.value;
  select.replaceChildren();

  const defaultEl = document.createElement("option");
  defaultEl.value = defaultOption.value;
  defaultEl.text = defaultOption.text;
  select.appendChild(defaultEl);

  for (const item of items) {
    if (!item) continue;
    const option = document.createElement("option");
    option.value = item;
    option.text = capitalize(item);
    select.appendChild(option);
  }

  select.value = value;
}

async function fetchStores() {
  const response = await fetch("/data/stores");
  if (!response.ok) throw new Error("Failed to fetch stores");
  return response.json();
}

async function fetchCountries() {
  const response = await fetch("/data/countries");
  if (!response.ok) throw new Error("Failed to fetch countries");
  return response.json();
}

async function fetchPairs() {
  const response = await fetch("/data/pairs");
  if (!response.ok) throw new Error("Failed to fetch pairs");
  return response.json();
}

function updateMultiselectSummary(details) {
  const summary = details.querySelector("summary");
  const checked = [...details.querySelectorAll("input:checked")].map((input) => input.value);
  if (checked.length === 0) {
    summary.textContent = summary.dataset.default;
  } else if (checked.length === 1) {
    summary.textContent = checked[0];
  } else {
    summary.textContent = `${checked[0]} +${checked.length - 1}`;
  }
}

function populatePairDropdown(pairs) {
  const details = document.getElementById("pair");
  const list = details?.querySelector(".card");
  if (!list) return;

  const checked = new Set([...list.querySelectorAll("input:checked")].map((input) => input.value));
  list.replaceChildren();

  for (const pair of pairs) {
    if (!pair) continue;
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = "pair";
    input.value = pair;
    input.checked = checked.has(pair);
    label.append(input, capitalize(pair));
    list.appendChild(label);
  }

  updateMultiselectSummary(details);
}

document.addEventListener("change", (event) => {
  const details = event.target.closest?.("details.multiselect");
  if (details) updateMultiselectSummary(details);
});

document.addEventListener("click", (event) => {
  document.querySelectorAll("details.multiselect[open]").forEach((details) => {
    if (!details.contains(event.target)) details.open = false;
  });
});

function populateStoreDropdowns(stores) {
  const subdomain = document.location.hostname.split(".")[0];
  const storeSelect = document.getElementById(`stores-${subdomain}`);
  if (storeSelect) {
    populateSelect(storeSelect, stores, _STORE_DEFAULTS[subdomain] ?? _STORE_DEFAULTS.vinmonopolet);
  }
}

function populateCountryDropdown(countries) {
  const countrySelect = document.getElementById("country");
  if (countrySelect) {
    populateSelect(countrySelect, countries, _COUNTRY_DEFAULT);
  }
}

async function loadDropdowns() {
  try {
    if (!_storesCache) {
      _storesCache = await fetchStores();
    }
    populateStoreDropdowns(_storesCache);
  } catch (error) {
    console.error("Error fetching stores:", error);
  }

  try {
    if (!_countriesCache) {
      _countriesCache = await fetchCountries();
    }
    populateCountryDropdown(_countriesCache);
  } catch (error) {
    console.error("Error fetching countries:", error);
  }

  try {
    if (!_pairsCache) {
      _pairsCache = await fetchPairs();
    }
    populatePairDropdown(_pairsCache);
  } catch (error) {
    console.error("Error fetching pairs:", error);
  }
}

window.populateDropdowns = loadDropdowns;

window.addEventListener("load", loadDropdowns);
