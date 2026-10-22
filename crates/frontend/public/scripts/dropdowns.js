const _cache = {};

function capitalize(text) {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

async function fetchList(path) {
  if (!_cache[path]) {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Failed to fetch ${path}`);
    _cache[path] = await response.json();
  }
  return _cache[path];
}

// Checkboxes are built after load, so the browser can't restore them; keep them per tab.
function loadSelection(details) {
  try {
    return JSON.parse(sessionStorage.getItem(`multiselect:${details.id}`)) ?? [];
  } catch {
    return [];
  }
}

function saveSelection(details) {
  const values = [...details.querySelectorAll("input:checked")].map((input) => input.value);
  try {
    sessionStorage.setItem(`multiselect:${details.id}`, JSON.stringify(values));
  } catch {}
}

function updateMultiselectSummary(details) {
  saveSelection(details);
  const summary = details.querySelector("summary");
  const [first, ...rest] = [...details.querySelectorAll("input:checked")].map(
    (input) => input.parentElement.textContent,
  );
  summary.textContent = !first
    ? summary.dataset.default
    : rest.length
      ? `${first} +${rest.length}`
      : first;
}

// Resets a multiselect, or a plain/hidden input standing in for it.
function clearField(element) {
  if (!element) return;
  if (element.tagName === "DETAILS") {
    element.querySelectorAll("input:checked").forEach((input) => (input.checked = false));
    element.open = false;
    updateMultiselectSummary(element);
  } else {
    element.value = "";
  }
}

function renderOptions(details, items, checked) {
  const list = details?.querySelector(".card");
  if (!list) return;

  list.replaceChildren();
  for (const item of items) {
    if (!item) continue;
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = details.dataset.name;
    input.value = item;
    input.checked = checked.has(item);
    label.append(input, capitalize(item));
    list.appendChild(label);
  }

  updateMultiselectSummary(details);
}

function populateMultiselect(details, items) {
  const list = details?.querySelector(".card");
  if (!list) return;
  renderOptions(details, items, new Set([...list.querySelectorAll("input:checked")].map((input) => input.value)));
}

// Show the stored selection right away, so the first product fetch already uses it.
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("details.multiselect").forEach((details) => {
    const stored = loadSelection(details);
    if (stored.length) renderOptions(details, stored, new Set(stored));
  });
});

document.addEventListener("change", (event) => {
  const details = event.target.closest?.("details.multiselect");
  if (details) updateMultiselectSummary(details);
});

document.addEventListener("click", (event) => {
  document.querySelectorAll("details.multiselect[open]").forEach((details) => {
    if (!details.contains(event.target)) details.open = false;
  });
});

async function loadDropdowns() {
  const subdomain = document.location.hostname.split(".")[0];
  const dropdowns = [
    [`stores-${subdomain}`, "/data/stores"],
    ["country", "/data/countries"],
    ["pair", "/data/pairs"],
  ];

  for (const [id, path] of dropdowns) {
    const details = document.getElementById(id);
    if (details?.tagName !== "DETAILS") continue;
    try {
      populateMultiselect(details, await fetchList(path));
    } catch (error) {
      console.error(`Error fetching ${path}:`, error);
    }
  }
}

window.populateDropdowns = loadDropdowns;

window.addEventListener("load", loadDropdowns);
