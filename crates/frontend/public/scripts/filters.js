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

  const dialog = document.getElementById("advanced");
  const applyBtn = document.getElementById("applyFilters");
  const markChanged = () => applyBtn?.classList.add("changed");
  let searchTimer;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    clearTimeout(searchTimer);
    window.fetchProducts({ page: 1 });
  });

  // The main filters apply immediately, while the dialog's fields apply when it closes.
  dialog?.addEventListener("input", markChanged);
  dialog?.addEventListener("change", markChanged);

  for (const id of ["sort", "category", "stores-vinmonopolet", "stores-taxfree"]) {
    document.getElementById(id)?.addEventListener("change", () => {
      window.fetchProducts({ page: 1 });
    });
  }

  document.getElementById("nsearch")?.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => window.fetchProducts({ page: 1 }), 400);
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
    markChanged();
  });

  document.getElementById("toggleVolume")?.addEventListener("click", (event) => {
    event.preventDefault();
    toggleComparator("cvolume", "toggleVolume", { on: "lik", off: "over" });
    markChanged();
  });

  document.getElementById("toggleAlcohol")?.addEventListener("click", (event) => {
    event.preventDefault();
    toggleComparator("calcohol", "toggleAlcohol", { on: "lik", off: "over" });
    markChanged();
  });

  document.getElementById("toggleYear")?.addEventListener("click", (event) => {
    event.preventDefault();
    toggleComparator("cyear", "toggleYear", { on: "lik", off: "før" });
    markChanged();
  });

  document.getElementById("toggleAdvanced")?.addEventListener("click", (event) => {
    event.preventDefault();
    dialog?.showModal();
  });

  // Every way of closing the dialog (button, backdrop, Escape) applies its filters.
  dialog?.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });

  dialog?.addEventListener("close", () => {
    if (!applyBtn?.classList.contains("changed")) return;
    applyBtn.classList.remove("changed");
    window.fetchProducts({ page: 1 });
  });

  applyBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    dialog?.close();
  });

  document.getElementById("clearFilters")?.addEventListener("click", (event) => {
    event.preventDefault();

    for (const id of ["stores-search-vinmonopolet", "country", "price", "volume", "alcohol", "year"]) {
      const field = document.getElementById(id);
      if (field) field.value = "";
    }

    resetComparator("cprice", "togglePrice", "under");
    resetComparator("cvolume", "toggleVolume", "over");
    resetComparator("calcohol", "toggleAlcohol", "over");
    resetComparator("cyear", "toggleYear", "før");

    markChanged();
  });

  document.getElementById("toggleFavourites")?.addEventListener("click", () => {
    const input = document.querySelector('input[name="favourites"]');
    const active = input.value === "true";
    input.value = active ? "" : "true";
    window.fetchProducts({ page: 1 });
  });
});
