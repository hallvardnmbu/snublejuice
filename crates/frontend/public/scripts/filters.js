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

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    window.fetchProducts({ page: 1 });
  });

  dialog.addEventListener("input", markChanged);
  dialog.addEventListener("change", markChanged);

  for (const id of ["sort"]) {
    document.getElementById(id)?.addEventListener("change", () => {
      window.fetchProducts({ page: 1 });
    });
  }

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
    applyBtn.classList.remove("changed");
    dialog?.close();
    window.fetchProducts({ page: 1 });
  });

  document.getElementById("clearFilters")?.addEventListener("click", (event) => {
    event.preventDefault();

    document.getElementById("nsearch").value = "";

    for (const id of ["category", "stores-search-vinmonopolet", "country", "pair", "stores-vinmonopolet", "stores-taxfree", "price", "volume", "alcohol", "year"]) {
      clearField(document.getElementById(id));
    }

    resetComparator("cprice", "togglePrice", "under");
    resetComparator("cvolume", "toggleVolume", "over");
    resetComparator("calcohol", "toggleAlcohol", "over");
    resetComparator("cyear", "toggleYear", "før");

    applyBtn?.classList.remove("changed");
    dialog?.close();
    window.fetchProducts({ page: 1 });
  });

  document.getElementById("toggleFavourites")?.addEventListener("click", () => {
    const input = document.querySelector('input[name="favourites"]');
    const active = input.value === "true";
    input.value = active ? "" : "true";
    window.fetchProducts({ page: 1 });
  });
});
