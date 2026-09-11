const _STORE_DEFAULTS = {
  vinmonopolet: { text: "Spesifikk butikk", value: "" },
  taxfree: { text: "Alle flyplasser", value: "" },
};

const _COUNTRY_DEFAULT = { text: "Alle land", value: "" };

let _storesCache = null;
let _countriesCache = null;

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
}

window.populateDropdowns = loadDropdowns;

window.addEventListener("load", loadDropdowns);
