const _MODALS = ["login", "register", "profile"];

function toggleView(modal) {
  // Close all modals except the one that was clicked.
  for (const arg of _MODALS.filter((m) => m !== modal)) {
    let element = document.getElementById(arg);
    element.style.display = "none";
  }

  // Close message.
  const message = document.getElementById("userMessage");
  message.style.display = "none";

  // Open the clicked modal.
  let element = document.getElementById(modal);
  element.style.display = element.style.display === "block" ? "none" : "block";
}

// LOGIN
// ------------------------------------------------------------------------------------------------

document.getElementById("loginForm").onsubmit = async function (event) {
  event.preventDefault();

  const formData = {
    username: document.getElementById("usernameLogin").value,
    password: document.getElementById("passwordLogin").value,
  };

  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify(formData),
    });

    const data = await response.json();
    userMessage.style.display = "block";
    userMessage.style.backgroundColor = response.ok ? "var(--positive)" : "var(--negative)";

    if (response.ok) {
      userMessage.textContent = data.message;

      // Reload the page after successful login
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } else {
      userMessage.textContent = data.message;
    }
  } catch (error) {
    userMessage.style.display = "block";
    userMessage.style.backgroundColor = "var(--negative)";
    userMessage.textContent = "Hmm, noe gikk galt...";
  }
};

// REGISTER
// ------------------------------------------------------------------------------------------------

document.getElementById("registerForm").onsubmit = async function (event) {
  event.preventDefault();

  const formData = {
    email: document.getElementById("emailRegister").value,
    username: document.getElementById("usernameRegister").value,
    password: document.getElementById("passwordRegister").value,
  };

  try {
    const response = await fetch("/api/register", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(formData),
    });

    const data = await response.json();
    userMessage.style.display = "block";
    userMessage.style.backgroundColor = response.ok ? "var(--positive)" : "var(--negative)";

    if (response.ok) {
      userMessage.textContent = data.message;

      // Reload the page after successful register
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } else {
      userMessage.textContent = data.message;
    }
  } catch (error) {
    userMessage.style.display = "block";
    userMessage.style.backgroundColor = "var(--negative)";
    userMessage.textContent = "Hmm, noe gikk galt...";
  }
};

// PROFILE
// ------------------------------------------------------------------------------------------------

document.getElementById("deleteUserForm").onsubmit = async function (event) {
  event.preventDefault();

  const formData = {
    username: document.getElementById("usernameDelete").value,
    password: document.getElementById("passwordDelete").value,
  };

  try {
    const response = await fetch("/api/delete", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(formData),
    });

    const data = await response.json();
    userMessage.style.display = "block";
    userMessage.style.backgroundColor = response.ok ? "var(--positive)" : "var(--negative)";

    if (response.ok) {
      userMessage.textContent = data.message;

      // Reload the page after successful register.
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } else {
      userMessage.textContent = data.message;
    }
  } catch (error) {
    userMessage.style.display = "block";
    userMessage.style.backgroundColor = "var(--negative)";
    userMessage.textContent = "Hmm, noe gikk galt...";
  }
};

// LOGOUT
// ------------------------------------------------------------------------------------------------

function logout() {
  fetch("/api/logout", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.ok) {
        window.location.reload();
      }
    });
}
