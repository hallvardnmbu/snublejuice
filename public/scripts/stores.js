const _DEFAULTS = {
  vinmonopolet: "Spesifikk butikk",
  taxfree: "Alle flyplasser",
};

async function fetchStores() {
  try {
    const response = await axios.get("/data/stores");
    const stores = response.data;

    sessionStorage.setItem("stores", JSON.stringify(stores));
    populateStores(stores);
  } catch (error) {
    console.error("Error fetching stores:", error);
  }
}

function populateStores(stores) {
  for (const key in stores) {
    const dropdown = document.getElementById(`stores-${key}`);
    const search = document.getElementById(`stores-search-${key}`) || null;

    // Clear existing options
    dropdown.innerHTML = "";

    // Add default option
    const defaultOption = document.createElement("option");
    defaultOption.value = _DEFAULTS[key];
    defaultOption.text = _DEFAULTS[key];
    dropdown.appendChild(defaultOption);

    // Add new options
    for (const store of stores[key]) {
      if (!store) continue;
      const option = document.createElement("option");
      option.value = store;
      option.text = store.charAt(0).toUpperCase() + store.slice(1);
      dropdown.appendChild(option);
    }

    // Retrieve the selected store from local storage
    const selected = sessionStorage.getItem("store");
    if (selected) {
      dropdown.value = selected;
    } else {
      // Reset to default option if no selected store is found in sessionStorage
      dropdown.value = _DEFAULTS[key];
    }

    // Add event listener to save the selected store to local storage
    dropdown.addEventListener("change", () => {
      sessionStorage.setItem("store", dropdown.value);
      displayMessage(_DEFAULTS[key] !== dropdown.value || search?.value);
    });

    // Display message if a store other than "null" is selected on page load
    displayMessage(_DEFAULTS[key] !== dropdown.value || search?.value);
  }
}

// Function to display a message if a store other than "null" is selected
function displayMessage(active = false) {
  const messageElement = document.getElementById("message-stores");
  messageElement.style.display = active ? "block" : "none";
}

// Fetch stores on page load or use cached data
window.addEventListener("load", () => {
  const cachedStores = sessionStorage.getItem("stores");
  if (cachedStores) {
    populateStores(JSON.parse(cachedStores));
  } else {
    fetchStores();
  }
});
