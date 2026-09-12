function toggleComparator(inputName, buttonId, labels) {
  const input = document.querySelector(`input[name="${inputName}"]`);
  const button = document.getElementById(buttonId);
  if (!input || !button) return;

  const active = input.value === "true";
  input.value = active ? "" : "true";
  button.textContent = active ? labels.off : labels.on;
}

function resetComparator(inputName, buttonId, offLabel) {
  const input = document.querySelector(`input[name="${inputName}"]`);
  const button = document.getElementById(buttonId);
  if (input) input.value = "";
  if (button) button.textContent = offLabel;
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("filter");
  if (!form) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
  });

  document.getElementById("sort")?.addEventListener("change", () => {
    window.fetchProducts({ page: 1 });
  });

  document.getElementById("toggleSort")?.addEventListener("click", (event) => {
    event.preventDefault();
    const input = document.querySelector('input[name="ascending"]');
    const button = document.getElementById("toggleSort");
    const descending = input.value === "false";
    input.value = descending ? "true" : "false";
    button.textContent = descending ? "stigende" : "synkende";
    window.fetchProducts({ page: 1 });
  });

  document.getElementById("togglePrice")?.addEventListener("click", (event) => {
    event.preventDefault();
    toggleComparator("cprice", "togglePrice", { on: "lik", off: "under" });
  });

  document.getElementById("toggleVolume")?.addEventListener("click", (event) => {
    event.preventDefault();
    toggleComparator("cvolume", "toggleVolume", { on: "lik", off: "over" });
  });

  document.getElementById("toggleAlcohol")?.addEventListener("click", (event) => {
    event.preventDefault();
    toggleComparator("calcohol", "toggleAlcohol", { on: "lik", off: "over" });
  });

  document.getElementById("toggleYear")?.addEventListener("click", (event) => {
    event.preventDefault();
    toggleComparator("cyear", "toggleYear", { on: "lik", off: "før" });
  });

  document.getElementById("applyFilters")?.addEventListener("click", (event) => {
    event.preventDefault();
    window.fetchProducts({ page: 1 });

    const panel = document.getElementById("advanced");
    const btn = document.getElementById("toggleAdvanced");

    panel?.classList.remove("open");
    btn?.setAttribute("aria-expanded", "false");
    sessionStorage.setItem("advanced", "false");
  });

  document.getElementById("clearFilters")?.addEventListener("click", (event) => {
    event.preventDefault();

    document.getElementById("nsearch").value = "";
    document.getElementById("category").value = "null";
    document.getElementById("price").value = "";
    document.getElementById("volume").value = "";
    document.getElementById("alcohol").value = "";
    document.getElementById("year").value = "";

    const storelike = document.querySelector('[name="storelike"]');
    if (storelike) storelike.value = "";

    const country = document.getElementById("country");
    if (country) country.value = "";

    const vinSelect = document.getElementById("stores-vinmonopolet");
    if (vinSelect) vinSelect.value = "";

    const taxfreeSelect = document.getElementById("stores-taxfree");
    if (taxfreeSelect) taxfreeSelect.value = "";

    resetComparator("cprice", "togglePrice", "under");
    resetComparator("cvolume", "toggleVolume", "over");
    resetComparator("calcohol", "toggleAlcohol", "over");
    resetComparator("cyear", "toggleYear", "før");

    document.querySelector('input[name="favourites"]').value = "";

    window.populateDropdowns?.();
    window.fetchProducts({ page: 1, favourites: false });

    const panel = document.getElementById("advanced");
    const btn = document.getElementById("toggleAdvanced");

    panel?.classList.remove("open");
    btn?.setAttribute("aria-expanded", "false");
    sessionStorage.setItem("advanced", "false");
  });

  document.getElementById("toggleFavourites")?.addEventListener("click", () => {
    const input = document.querySelector('input[name="favourites"]');
    const active = input.value === "true";
    input.value = active ? "" : "true";
    window.fetchProducts({ page: 1 });
  });

  const isOpen = sessionStorage.getItem("advanced") === "true";
  if (isOpen) {
    document.getElementById("advanced")?.classList.add("open");
    const btn = document.getElementById("toggleAdvanced");
    btn?.setAttribute("aria-expanded", "true");
  }

  document.getElementById("toggleAdvanced")?.addEventListener("click", (event) => {
    event.preventDefault();
    const panel = document.getElementById("advanced");
    const btn = document.getElementById("toggleAdvanced");
    const open = panel.classList.toggle("open");
    btn.setAttribute("aria-expanded", open);
    sessionStorage.setItem("advanced", open);
  });
});
