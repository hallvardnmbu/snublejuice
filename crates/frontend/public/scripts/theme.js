// Theme toggle functionality
const themeToggle = document.getElementById("toggleTheme");
const prefersDarkScheme = window.matchMedia("(prefers-color-scheme: dark)");

// Function to set theme
function setTheme(theme) {
  document.documentElement.setAttribute(
    "data-theme",
    theme === "Mørkt" ? "dark" : "light",
  );
  sessionStorage.setItem("theme", theme);
  themeToggle.innerHTML = theme === "Mørkt" ? "Lyst" : "Mørkt";
}

// Check for saved theme preference or system preference
const savedTheme = sessionStorage.getItem("theme");
if (savedTheme) {
  setTheme(savedTheme);
} else if (prefersDarkScheme.matches) {
  setTheme("Mørkt");
}

// Toggle theme when button is clicked
themeToggle.addEventListener("click", () => {
  const currentTheme = document.documentElement.getAttribute("data-theme");
  setTheme(currentTheme === "dark" ? "Lyst" : "Mørkt");
});

// Listen for system theme changes
prefersDarkScheme.addEventListener("change", (e) => {
  if (!sessionStorage.getItem("theme")) {
    setTheme(e.matches ? "Mørkt" : "Lyst");
  }
});
