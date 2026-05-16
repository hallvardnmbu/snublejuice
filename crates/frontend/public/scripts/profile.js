const _MODALS = ["profile", "loginForm", "registerForm", "notifyUserForm", "deleteUserForm"];

function toggleView(modal) {
  // Close all modals except the one that was clicked.
  for (const arg of _MODALS.filter((m) => m !== modal)) {
    let element = document.getElementById(arg);
    element.style.display = "none";
  }

  // Close message.
  const userMessage = document.getElementById("userMessage");
  userMessage.style.display = "none";

  // Open the clicked modal.
  let element = document.getElementById(modal);
  element.style.display = element.style.display === "flex" ? "none" : "flex";
}

async function showError(message) {
  const userMessage = document.getElementById("userMessage");
  userMessage.style.display = "block";
  userMessage.textContent = message;
}

async function tryPost(endpoint, formData) {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify(formData),
    });
    if (!response.ok) {
      throw new Error();
    }
    window.location.reload();
  } catch (error) {
    showError(`Hmm, noe gikk galt... ${error.message || error}`);
  }
}

document.getElementById("loginForm").onsubmit = async function (event) {
  event.preventDefault();
  const formData = {
    username: document.getElementById("usernameLogin").value,
    password: document.getElementById("passwordLogin").value,
  };
  await tryPost("/account/login", formData);
};

document.getElementById("registerForm").onsubmit = async function (event) {
  event.preventDefault();
  const formData = {
    email: document.getElementById("emailRegister").value,
    notify: document.getElementById("notifyRegister").checked,
    username: document.getElementById("usernameRegister").value,
    password: document.getElementById("passwordRegister").value,
  };
  await tryPost("/account/signup", formData);
};

document.getElementById("notifyUserForm").onsubmit = async function (event) {
  event.preventDefault();
  const formData = {
    username: document.getElementById("usernameNotify").value,
    notify: document.getElementById("activeNotify").checked,
  };
  await tryPost("/account/notification", formData);
};

document.getElementById("deleteUserForm").onsubmit = async function (event) {
  event.preventDefault();
  const formData = {
    username: document.getElementById("usernameDelete").value,
    password: document.getElementById("passwordDelete").value,
  };
  await tryPost("/account/delete", formData);
};

async function logout() {
  await tryPost("/account/logout", {});
}

window.toggleView = toggleView;
window.logout = logout;

async function loadFavourites() {
  try {
    const response = await axios.get("/account/favourites");
    const stores = response.data;

    sessionStorage.setItem("favourites", JSON.stringify(stores));
  } catch (error) {
    console.error("Error fetching favourites:", error);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await loadFavourites();
});
