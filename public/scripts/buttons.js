// Submit the form.
function applyFilters(resetPage = false) {
  if (resetPage) {
    document.querySelector('input[name="page"]').value = 1;
  }
  document.getElementById("filter").submit();
}

function changePage(newPage) {
  document.querySelector('input[name="page"]').value = newPage;

  // Handle favourites.
  if (!window.location.href.includes("favourites=true")) {
    applyFilters();
  } else {
    window.location.href = "/?page=" + newPage + "&favourites=true";
  }
}

// Toggle sort order.
document.getElementById("sortButton").onclick = function (event) {
  event.preventDefault();

  const ascendingInput = document.querySelector('input[name="ascending"]');
  ascending = ascendingInput.value === "true" ? "false" : "true";

  ascendingInput.value = ascending;

  applyFilters();
};

// Reset the page.
document.getElementById("clearFilters").onclick = function (event) {
  event.preventDefault();
  sessionStorage.clear();
  window.location.href = "/?fresh=false";
};

// Toggle advanced visibility.
document.getElementById("toggleAdvanced").onclick = function (event) {
  event.preventDefault();

  const section = document.getElementById("advancedSelection");
  section.style.display = section.style.display === "flex" ? "none" : "flex";

  // Set the button text based on visibility.
  document.getElementById("toggleAdvanced").innerHTML =
    section.style.display === "flex" ? "Skjul valg" : "Flere valg";

  // Save the visibility state to session storage.
  sessionStorage.setItem("advancedSelection", section.style.display === "flex");
};

// Update the button text based on visibility (from storage).
document.addEventListener("DOMContentLoaded", function () {
  const element = document.getElementById("advancedSelection");
  const isVisible = sessionStorage.getItem("advancedSelection") === "true";
  element.style.display = isVisible ? "flex" : "none";
  document.getElementById("toggleAdvanced").innerHTML = isVisible ? "Skjul valg" : "Flere valg";
});

// Volume, alcohol and search change.
document.getElementById("fvolume").addEventListener("change", function () {
  applyFilters(true);
});
document.getElementById("falcohol").addEventListener("change", function () {
  applyFilters(true);
});
document.getElementById("iyear").addEventListener("change", function () {
  applyFilters(true);
});
document.getElementById("nsearch").addEventListener("change", function () {
  applyFilters(true);
});
document.getElementById("ssearch").addEventListener("change", function () {
  applyFilters(true);
});
document.getElementById("delta").addEventListener("input", function () {
  const today = new Date();
  const compareDate = new Date(today.setMonth(today.getMonth() - this.value));
  const month = String(compareDate.getMonth() + 1).padStart(2, "0");
  const year = compareDate.getFullYear().toString().slice(2);
  document.getElementById("deltaValue").textContent = `Førpris ${month}.${year}`;
});
document.getElementById("delta").addEventListener("change", function () {
  applyFilters(true);
});

// Information toggle.
document.getElementById("info").onclick = function (event) {
  event.preventDefault();
  const div = document.getElementById("infobox");
  div.style.display = div.style.display === "flex" ? "none" : "flex";
};
document.querySelector(".exit").onclick = function (event) {
  event.preventDefault();
  document.getElementById("infobox").style.display = "none";
};

// Update cookies.
document.getElementById("updateCookies").onclick = function (event) {
  event.preventDefault();
  const selectCookies = document.getElementById("selectCookies");
  selectCookies.style.display = "flex";
};

// Toggle favourite.
document.querySelectorAll(".favourite-toggle").forEach((img) => {
  img.addEventListener("click", async function (event) {
    event.stopPropagation();

    // Send POST request to server.
    const index = this.dataset.index;
    await fetch("/api/favourite", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({ index: index }),
    });

    // Toggle image.
    this.src = this.src.includes("favourite-filled.png")
      ? "./images/favourite.png"
      : "./images/favourite-filled.png";
  });

  // // Hover events
  // img.addEventListener("mouseenter", function () {
  //   this.src = this.src.includes("favourite-filled.png")
  //     ? "./images/favourite.png"
  //     : "./images/favourite-filled.png";
  // });
  // img.addEventListener("mouseleave", function () {
  //   this.src = this.src.includes("favourite-filled.png")
  //     ? "./images/favourite.png"
  //     : "./images/favourite-filled.png";
  // });
});

function changeModal(currentModal, newModal, event) {
  event.stopPropagation();

  document.getElementById(currentModal).style.display = "none";
  document.getElementById(newModal).style.display = "block";

  graphPrice(newModal);
}

document.addEventListener("DOMContentLoaded", function () {
  // Open modal when section is clicked
  const productSections = document.querySelectorAll(".product");
  productSections.forEach((section) => {
    section.addEventListener("click", function () {
      const itemIndex = this.getAttribute("index");
      const modal = document.getElementById(itemIndex);

      // Prevent modal from opening if it's already open (to avoid graphing etc.)
      if (modal.style.display === "block") {
        return;
      }
      modal.style.display = "block";

      // Graph the price history
      graphPrice(itemIndex);
    });
  });

  // Close modal when the 'x' is clicked
  const closeModalButtons = document.querySelectorAll(".close");
  closeModalButtons.forEach((button) => {
    button.addEventListener("click", function (event) {
      event.stopPropagation(); // Prevent bubbling to avoid modal reopening
      const itemIndex = this.getAttribute("index");
      const modal = document.getElementById(itemIndex);
      modal.style.display = "none";
    });
  });

  // Close modal when clicking outside of the modal content
  window.onclick = function (event) {
    const modals = document.querySelectorAll(".modal");
    modals.forEach((modal) => {
      if (event.target === modal && modal.id !== "selectCookies") {
        modal.style.display = "none";
      }
    });
  };

  // Close modal when ESC key is pressed
  document.addEventListener("keydown", function (event) {
    if (
      event.key === "Escape" ||
      event.key === "Esc" ||
      event.key === "Enter" ||
      event.key === "Return"
    ) {
      const modals = document.querySelectorAll(".modal");
      modals.forEach((modal) => {
        if (modal.style.display === "block" && modal.id !== "selectCookies") {
          modal.style.display = "none";
        }
      });
    }
  });
});
