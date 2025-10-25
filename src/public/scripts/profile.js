const _MODALS = [
  "profile",
  "loginForm",
  "registerForm",
  "notifyUserForm",
  "deleteUserForm",
];

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

async function displayUserMessage(response) {
  const userMessage = document.getElementById("userMessage");
  userMessage.style.display = "block";

  const data = await response.json();
  if (response.ok) {
    userMessage.textContent = data.message;
    userMessage.style.background = "rgba(var(--positive), 0.2)";
    userMessage.style.border = "2px solid rgba(var(--positive), 0.6)";

    // Reload the page after a slight delay (time to read the message).
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  } else {
    userMessage.textContent = data.message;
    userMessage.style.background = "rgba(var(--negative), 0.2)";
    userMessage.style.border = "2px solid rgba(var(--negative), 0.6)";
  }
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
    const response = await fetch("/account/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify(formData),
    });
    await displayUserMessage(response);
  } catch (error) {
    await displayUserMessage(
      new Response(JSON.stringify({ message: "Hmm, noe gikk galt..." }), {
        ok: false,
        status: 500,
      }),
    );
  }
};

// REGISTER
// ------------------------------------------------------------------------------------------------

document.getElementById("registerForm").onsubmit = async function (event) {
  event.preventDefault();

  const formData = {
    email: document.getElementById("emailRegister").value,
    notify: document.getElementById("notifyRegister").checked,
    username: document.getElementById("usernameRegister").value,
    password: document.getElementById("passwordRegister").value,
  };

  try {
    const response = await fetch("/account/register", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(formData),
    });
    await displayUserMessage(response);
  } catch (error) {
    await displayUserMessage(
      new Response(JSON.stringify({ message: "Hmm, noe gikk galt..." }), {
        ok: false,
        status: 500,
      }),
    );
  }
};

// PROFILE
// ------------------------------------------------------------------------------------------------

document.getElementById("notifyUserForm").onsubmit = async function (event) {
  event.preventDefault();

  const formData = {
    username: document.getElementById("usernameNotify").value,
    notify: document.getElementById("activeNotify").checked,
  };

  try {
    const response = await fetch("/account/notification", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(formData),
    });
    await displayUserMessage(response);
  } catch (error) {
    await displayUserMessage(
      new Response(JSON.stringify({ message: "Hmm, noe gikk galt..." }), {
        ok: false,
        status: 500,
      }),
    );
  }
};

document.getElementById("deleteUserForm").onsubmit = async function (event) {
  event.preventDefault();

  const formData = {
    username: document.getElementById("usernameDelete").value,
    password: document.getElementById("passwordDelete").value,
  };

  try {
    const response = await fetch("/account/delete", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(formData),
    });
    await displayUserMessage(response);
  } catch (error) {
    await displayUserMessage(
      new Response(JSON.stringify({ message: "Hmm, noe gikk galt..." }), {
        ok: false,
        status: 500,
      }),
    );
  }
};

// LOGOUT
// ------------------------------------------------------------------------------------------------

function logout() {
  fetch("/account/logout", {
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
