// Submit the form.
function applyFilters() {
  document.getElementById("filter").submit();
}

function changePage(newPage) {
  document.querySelector('input[name="page"]').value = newPage;
  applyFilters();
}

// Toggle sort order.
document.getElementById("sortButton").onclick = function (event) {
  event.preventDefault();

  const ascendingInput = document.querySelector('input[name="ascending"]');
  ascending = ascendingInput.value === "true" ? "false" : "true";

  ascendingInput.value = ascending;

  applyFilters();
};

// Toggle advanced visibility.
document.getElementById("toggleAdvanced").onclick = function (event) {
  event.preventDefault();

  const section = document.getElementById("advancedSelection");
  section.style.display = section.style.display === "flex" ? "none" : "flex";

  // Set the button text based on visibility.
  document.getElementById("toggleAdvanced").innerHTML =
    section.style.display === "flex" ? "&divide;" : "+";

  // Save the visibility state to session storage.
  sessionStorage.setItem("advancedSelection", section.style.display === "flex");
};

// Update the button text based on visibility (from storage).
document.addEventListener("DOMContentLoaded", function () {
  const element = document.getElementById("advancedSelection");
  const isVisible = sessionStorage.getItem("advancedSelection") === "true";
  element.style.display = isVisible ? "flex" : "none";
  document.getElementById("toggleAdvanced").innerHTML = isVisible ? "&divide;" : "+";
});

// Volume, alcohol and search change.
document.getElementById("volume").addEventListener("change", function () {
  applyFilters();
});
document.getElementById("alcohol").addEventListener("change", function () {
  applyFilters();
});
document.getElementById("search").addEventListener("change", function () {
  applyFilters();
});

// New products toggle.
document.getElementById("newsButton").onclick = function (event) {
  event.preventDefault();
  const newsInput = document.querySelector('input[name="news"]');
  newsInput.value = newsInput.value === "true" ? "false" : "true";
  applyFilters();
};

// Information popup modal.
document.getElementById("info").onclick = function (event) {
  event.preventDefault();
  document.getElementById("infobox").style.display = "block";
};
document.querySelector(".close").onclick = function (event) {
  event.preventDefault();
  document.getElementById("infobox").style.display = "none";
};
window.onclick = function (event) {
  if (event.target === document.getElementById("infobox")) {
    document.getElementById("infobox").style.display = "none";
  }
};


document.addEventListener("DOMContentLoaded", function () {
  // Open modal when section is clicked
  const productSections = document.querySelectorAll(".product-section");
  productSections.forEach(section => {
    section.addEventListener("click", function () {
      const itemId = this.getAttribute("data-item-id");
      const modal = document.getElementById(`modal-${itemId}`);
      modal.style.display = "block";
    });
  });

  // Close modal when the 'x' is clicked
  const closeModalButtons = document.querySelectorAll(".close");
  closeModalButtons.forEach(button => {
    button.addEventListener("click", function (event) {
      event.stopPropagation(); // Prevent bubbling to avoid modal reopening
      const itemId = this.getAttribute("data-item-id");
      const modal = document.getElementById(`modal-${itemId}`);
      modal.style.display = "none";
    });
  });

  // Close modal when clicking outside of the modal content
  window.onclick = function (event) {
    const modals = document.querySelectorAll(".modal");
    modals.forEach(modal => {
      if (event.target === modal) {
        modal.style.display = "none";
      }
    });
  };
});



