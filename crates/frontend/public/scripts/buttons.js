function applyFilters(resetPage = true, toggleFavourites = false) {
  const form = document.getElementById("filter");
  const data = new FormData(form);

  if (resetPage) data.set("page", "1");
  if (toggleFavourites) {
    data.set("favourites", data.get("favourites") === "true" ? "false" : "true");
  }

  const always = new Set(["ascending", "sort"]);
  const params = new URLSearchParams();
  for (const [key, value] of data.entries()) {
    if (always.has(key) || (value !== "" && value !== "null" && value !== "false")) {
      params.set(key, value);
    }
  }

  window.location.href = "/?" + params.toString();
}

function changePage(newPage) {
  document.querySelector('input[name="page"]').value = newPage;
  applyFilters(false, false);
}

function toggleHandler(name) {
  return function (event) {
    event.preventDefault();

    const inputElement = document.querySelector(`input[name="${name}"]`);

    console.log(inputElement.value);
    inputElement.value = inputElement.value === "true" ? "false" : "true";

    applyFilters(true, false);
  };
}

const toggles = [
  { buttonId: "toggleSort", inputName: "ascending" },
  { buttonId: "togglePrice", inputName: "cprice" },
  { buttonId: "toggleVolume", inputName: "cvolume" },
  { buttonId: "toggleAlcohol", inputName: "calcohol" },
  { buttonId: "toggleYear", inputName: "cyear" },
];
toggles.forEach((toggle) => {
  const button = document.getElementById(toggle.buttonId);
  button.onclick = toggleHandler(toggle.inputName);
});

// Reset the page.
document.getElementById("clearFilters").onclick = function (event) {
  event.preventDefault();
  sessionStorage.clear();
  window.location.href =
    "/?fresh=false" + (document.querySelector('input[name="favourites"]').value === "true" ? "&favourites=true" : "");
};

// Count active (non-default) filters and update the badge.
function updateFilterBadge() {
  const params = new URLSearchParams(window.location.search);
  // skip: meta params + comparator toggles (they modify price/volume/etc., not separate filters)
  const skip = new Set(["fresh", "page", "ascending", "sort", "favourites", "cprice", "cvolume", "calcohol", "cyear"]);
  let count = 0;
  for (const key of params.keys()) {
    if (!skip.has(key)) count++;
  }
  const badge = document.getElementById("filterBadge");
  if (count > 0) {
    badge.textContent = count;
    badge.classList.add("visible");
  } else {
    badge.classList.remove("visible");
  }
}

// Toggle advanced panel visibility via CSS class.
document.getElementById("toggleAdvanced").onclick = function (event) {
  event.preventDefault();
  const panel = document.getElementById("advanced");
  const btn = document.getElementById("toggleAdvanced");
  const isOpen = panel.classList.toggle("open");
  btn.classList.toggle("active", isOpen);
  btn.setAttribute("aria-expanded", isOpen);
  sessionStorage.setItem("advanced", isOpen);
};

// Restore panel state from session storage.
document.addEventListener("DOMContentLoaded", function () {
  const isOpen = sessionStorage.getItem("advanced") === "true";
  if (isOpen) {
    document.getElementById("advanced").classList.add("open");
    const btn = document.getElementById("toggleAdvanced");
    btn.classList.add("active");
    btn.setAttribute("aria-expanded", "true");
  }
  updateFilterBadge();
});

// Price, volume, alcohol and search change.
document.getElementById("price").addEventListener("change", function () {
  applyFilters(true, false);
});
document.getElementById("volume").addEventListener("change", function () {
  applyFilters(true, false);
});
document.getElementById("alcohol").addEventListener("change", function () {
  applyFilters(true, false);
});
document.getElementById("year").addEventListener("change", function () {
  applyFilters(true, false);
});
document.getElementById("nsearch").addEventListener("change", function () {
  applyFilters(true, false);
});
document.getElementById("stores-search-vinmonopolet").addEventListener("change", function () {
  applyFilters(true, false);
});

// Toggle favourite.
const mediaQuery = window.matchMedia("(min-width: 450px)");
document.querySelectorAll(".favourite-toggle").forEach((star) => {
  star.addEventListener("click", async function (event) {
    event.stopPropagation();

    // Send POST request to server.
    const index = parseInt(this.dataset.index, 10);
    await fetch("/account/favourite", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({ index: index }),
    });

    // Toggle star.
    this.innerText = this.innerText.trim() === "☆" ? "★" : "☆";
  });
});

// Touch-tap feedback on product cards (mirrors hover effect for ~2s).
if (window.matchMedia("(hover: none)").matches) {
  document.querySelectorAll(".product").forEach((card) => {
    let timer = null;
    card.addEventListener(
      "touchstart",
      function () {
        this.classList.add("touch-active");
        clearTimeout(timer);
        timer = setTimeout(() => this.classList.remove("touch-active"), 2000);
      },
      { passive: true },
    );
  });
}

// Detailed view.
document.addEventListener("DOMContentLoaded", function () {
  const sections = document.querySelectorAll(".product");
  sections.forEach((section) => {
    section.addEventListener("click", function (event) {
      if (event.target.closest("button") || event.target.closest("a")) {
        return; // Don't toggle the aside if a button or link was clicked
      }

      const itemIndex = this.getAttribute("index");
      const aside = document.getElementById(itemIndex).querySelector("aside");
      aside.classList.toggle("is-hidden");
    });
  });
});
