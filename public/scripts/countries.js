const _DEFAULT = "Alle land";

async function fetchCountries() {
  try {
    const response = await axios.get("/data/countries");
    const countries = response.data;
    sessionStorage.setItem("countries", JSON.stringify(countries));
    populateCountries(countries);
  } catch (error) {
    console.error("Error fetching countries:", error);
  }
}

function populateCountries(countries) {
  const dropdown = document.getElementById("country");

  // Clear existing options
  dropdown.innerHTML = "";

  // Add default option
  const defaultOption = document.createElement("option");
  defaultOption.value = _DEFAULT;
  defaultOption.text = _DEFAULT;
  dropdown.appendChild(defaultOption);

  // Add new options
  for (const country of countries) {
    if (!country) continue;
    const option = document.createElement("option");
    option.value = country;
    option.text = country.charAt(0).toUpperCase() + country.slice(1);
    dropdown.appendChild(option);
  }

  // Retrieve the selected country from local storage
  const selected = sessionStorage.getItem("country");
  if (selected) {
    dropdown.value = selected;
  } else {
    // Reset to default option if no selected country is found in sessionStorage
    dropdown.value = _DEFAULT;
  }

  // Add event listener to save the selected country to local storage
  dropdown.addEventListener("change", () => {
    sessionStorage.setItem("country", dropdown.value);
  });
}

// Fetch countries on page load or use cached data
window.addEventListener("load", () => {
  const cachedCountries = sessionStorage.getItem("countries");
  if (cachedCountries) {
    populateCountries(JSON.parse(cachedCountries));
  } else {
    fetchCountries();
  }
});
