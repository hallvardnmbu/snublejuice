// Submit the form.
function applyFilters(resetPage = true, toggleFavourites = false) {
  if (resetPage) {
    document.querySelector('input[name="page"]').value = 1;
  }
  if (toggleFavourites) {
    const old = document.querySelector('input[name="favourites"]').value;
    document.querySelector('input[name="favourites"]').value =
      old === "true" ? "false" : "true";
  }
  document.getElementById("filter").submit();
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
    "/?fresh=false" +
    (document.querySelector('input[name="favourites"]').value === "true"
      ? "&favourites=true"
      : "");
};

// Toggle advanced visibility.
document.getElementById("toggleAdvanced").onclick = function (event) {
  event.preventDefault();

  const section = document.getElementById("advanced");
  section.style.display = section.style.display === "flex" ? "none" : "flex";

  // Set the button text based on visibility.
  document.getElementById("toggleAdvanced").innerHTML =
    section.style.display === "flex" ? "Færre" : "Flere";

  // Save the visibility state to session storage.
  sessionStorage.setItem("advanced", section.style.display === "flex");
};

// Update the button text based on visibility (from storage).
document.addEventListener("DOMContentLoaded", function () {
  const element = document.getElementById("advanced");
  const isVisible = sessionStorage.getItem("advanced") === "true";
  element.style.display = isVisible ? "flex" : "none";
  document.getElementById("toggleAdvanced").innerHTML = isVisible
    ? "Færre"
    : "Flere";
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
document
  .getElementById("stores-search-vinmonopolet")
  .addEventListener("change", function () {
    applyFilters(true, false);
  });

// Toggle favourite.
document.querySelectorAll(".favourite-toggle").forEach((star) => {
  star.addEventListener("click", async function (event) {
    event.stopPropagation();

    // Send POST request to server.
    const index = this.dataset.index;
    await fetch("/account/favourite", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({ index: index }),
    });

    // Toggle star.
    this.innerText = this.innerText === "☆" ? "★" : "☆";
  });

  // Hover events
  star.addEventListener("mouseenter", function () {
    this.innerText = this.innerText === "☆" ? "★" : "☆";
  });
  star.addEventListener("mouseleave", function () {
    this.innerText = this.innerText === "☆" ? "★" : "☆";
  });
});

document.addEventListener("DOMContentLoaded", function () {
  // Detailed view.
  const expands = document.querySelectorAll(".expand");
  expands.forEach((expand) => {
    expand.addEventListener("click", function () {
      const itemIndex = this.getAttribute("index");
      const aside = document.getElementById(itemIndex);
      aside.style.display = aside.style.display === "block" ? "none" : "block";
      expand.innerText = aside.style.display === "block" ? "Lukk" : "Utvid";
    });
  });
});
