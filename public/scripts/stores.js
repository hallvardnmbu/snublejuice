const _DEFAULT = ["Spesifikk butikk"];

async function fetchStores() {
  try {
    const response = await axios.get("/api/stores");
    const stores = response.data;
    sessionStorage.setItem("storesData", JSON.stringify(stores));
    populateStores(stores);
  } catch (error) {
    console.error("Error fetching stores:", error);
  }
}

function populateStores(stores) {
  const storeSelect = document.getElementById("store");
  const storeSearch = document.getElementById("ssearch");

  // Clear existing options
  storeSelect.innerHTML = "";

  // Add default options
  for (const text of _DEFAULT) {
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
  const selectedStore = sessionStorage.getItem("selectedStore");
  if (selectedStore) {
    storeSelect.value = selectedStore;
  } else {
    // Reset to default option if no selected store is found in sessionStorage
    storeSelect.value = _DEFAULT[0];
  }

  // Add event listener to save the selected store to local storage
  storeSelect.addEventListener("change", () => {
    sessionStorage.setItem("selectedStore", storeSelect.value);
    displayMessage(!_DEFAULT.includes(storeSelect.value) || storeSearch.value);
  });

  // Display message if a store other than "null" is selected on page load
  displayMessage(!_DEFAULT.includes(storeSelect.value) || storeSearch.value);
}

// Function to display a message if a store other than "null" is selected
function displayMessage(active = false) {
  const messageElement = document.getElementById("message-stores");
  messageElement.style.display = active ? "block" : "none";
}

// Fetch stores on page load or use cached data
window.addEventListener("load", () => {
  const cachedStores = sessionStorage.getItem("storesData");
  if (cachedStores) {
    populateStores(JSON.parse(cachedStores));
  } else {
    fetchStores();
  }
});
