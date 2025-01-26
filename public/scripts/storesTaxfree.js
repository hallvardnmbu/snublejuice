const _TAXFREE_DEFAULT = ["Alle flyplasser"];

async function fetchTaxfreeStores() {
  try {
    const response = await axios.get("/api/taxfree/stores");
    const stores = response.data;
    sessionStorage.setItem("taxfreeStoresData", JSON.stringify(stores));
    populateTaxfreeStores(stores);
  } catch (error) {
    console.error("Error fetching stores:", error);
  }
}

function populateTaxfreeStores(stores) {
  const storeSelect = document.getElementById("taxfreeStore");

  // Clear existing options
  storeSelect.innerHTML = "";

  // Add default options
  for (const text of _TAXFREE_DEFAULT) {
    const defaultOption = document.createElement("option");
    defaultOption.value = text;
    defaultOption.text = text;
    storeSelect.appendChild(defaultOption);
  }

  // Add new options
  for (const store of stores) {
    if (!store) continue;
    const option = document.createElement("option");
    option.value = store;
    option.text = store.charAt(0).toUpperCase() + store.slice(1);
    storeSelect.appendChild(option);
  }

  // Retrieve the selected store from local storage
  const selectedStore = sessionStorage.getItem("selectedTaxfreeStore");
  if (selectedStore) {
    storeSelect.value = selectedStore;
  } else {
    // Reset to default option if no selected store is found in sessionStorage
    storeSelect.value = _TAXFREE_DEFAULT[0];
  }

  // Add event listener to save the selected store to local storage
  storeSelect.addEventListener("change", () => {
    sessionStorage.setItem("selectedTaxfreeStore", storeSelect.value);
    displayMessage(!_TAXFREE_DEFAULT.includes(storeSelect.value));
  });

  // Display message if a store other than "null" is selected on page load
  displayMessage(!_TAXFREE_DEFAULT.includes(storeSelect.value));
}

// Function to display a message if a store other than "null" is selected
function displayMessage(active = false) {
  const messageElement = document.getElementById("message-stores");
  messageElement.style.display = active ? "block" : "none";
}

// Fetch stores on page load or use cached data
window.addEventListener("load", () => {
  const cachedStores = sessionStorage.getItem("taxfreeStoresData");
  if (cachedStores) {
    populateTaxfreeStores(JSON.parse(cachedStores));
  } else {
    fetchTaxfreeStores();
  }
});
