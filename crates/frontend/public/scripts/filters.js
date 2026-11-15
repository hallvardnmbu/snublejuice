import { initNearby } from "./nearby.js";

function updateMultiselectSummary(details) {
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

function updateSingleselectSummary(details) {
  const checked = details.querySelector("input:checked");
  if (checked) details.querySelector("summary").textContent = checked.parentElement.textContent;
}

function clearField(element) {
  if (!element) return;
  if (element.classList?.contains("singleselect")) {
    const first = element.querySelector("input");
    if (first) first.checked = true;
    element.open = false;
    updateSingleselectSummary(element);
  } else if (element.tagName === "DETAILS") {
    element.querySelectorAll("input:checked").forEach((input) => (input.checked = false));
    element.open = false;
    updateMultiselectSummary(element);
  } else {
    element.value = "";
  }
}

document.addEventListener("change", (event) => {
  const single = event.target.closest?.("details.singleselect");
  if (single) {
    updateSingleselectSummary(single);
    single.open = false;
  }

  const details = event.target.closest?.("details.multiselect");
  if (details) updateMultiselectSummary(details);
});

document.addEventListener("click", (event) => {
  document.querySelectorAll("details.multiselect[open], details.singleselect[open]").forEach((details) => {
    if (!details.contains(event.target)) details.open = false;
  });
});

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

  document.querySelectorAll("details.singleselect").forEach(updateSingleselectSummary);
  document.querySelectorAll("details.multiselect").forEach(updateMultiselectSummary);

  const { setNearby } = initNearby(form);

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

    for (const id of [
      "category",
      "stores-search-vinmonopolet",
      "country",
      "pair",
      "stores-vinmonopolet",
      "stores-taxfree",
      "price",
      "volume",
      "alcohol",
      "year",
    ]) {
      clearField(document.getElementById(id));
    }

    resetComparator("cprice", "togglePrice", "under");
    resetComparator("cvolume", "toggleVolume", "over");
    resetComparator("calcohol", "toggleAlcohol", "over");
    resetComparator("cyear", "toggleYear", "før");

    setNearby(null);

    applyBtn?.classList.remove("changed");
    dialog?.close();
    window.fetchProducts({ page: 1 });
  });
});
