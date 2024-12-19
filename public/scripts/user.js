// LOGIN
// ------------------------------------------------------------------------------------------------

function loginModal() {
  const register = document.getElementById("registerModal");
  register.style.display = "none";

  const login = document.getElementById("loginModal");
  login.style.display = login.style.display === "block" ? "none" : "block";

  const userMessages = document.getElementsByClassName("userMessage");
  for (let i = 0; i < userMessages.length; i++) {
    userMessages[i].style.display = "none";
  }
}

document.getElementById("loginForm").onsubmit = async function (event) {
  event.preventDefault();

  const formData = {
    username: document.getElementById("usernameLOG").value,
    password: document.getElementById("passwordLOG").value,
  };

  try {
    const response = await fetch("/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify(formData),
    });

    const data = await response.json();
    loginMessage.style.display = "flex";

    if (response.ok) {
      loginMessage.textContent = data.message;

      // Reload the page after successful login
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } else {
      loginMessage.textContent = data.message;
    }
  } catch (error) {
    loginMessage.style.display = "flex";
    loginMessage.textContent = "Hmm, noe gikk galt...";
  }
};

// REGISTER
// ------------------------------------------------------------------------------------------------

function registerModal() {
  const login = document.getElementById("loginModal");
  login.style.display = "none";

  const register = document.getElementById("registerModal");
  register.style.display = register.style.display === "block" ? "none" : "block";

  const userMessages = document.getElementsByClassName("userMessage");
  for (let i = 0; i < userMessages.length; i++) {
    userMessages[i].style.display = "none";
  }
}

document.getElementById("registerForm").onsubmit = async function (event) {
  event.preventDefault();

  const formData = {
    email: document.getElementById("emailSUP").value,
    username: document.getElementById("usernameSUP").value,
    password: document.getElementById("passwordSUP").value,
  };

  try {
    const response = await fetch("/register", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(formData),
    });

    const data = await response.json();
    registerMessage.style.display = "flex";

    if (response.ok) {
      registerMessage.textContent = data.message;

      // Reload the page after successful register
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } else {
      registerMessage.textContent = data.message;
    }
  } catch (error) {
    registerMessage.style.display = "flex";
    registerMessage.textContent = "Hmm, noe gikk galt...";
  }
};

// PROFILE
// ------------------------------------------------------------------------------------------------

function profileModal() {
  const login = document.getElementById("loginModal");
  login.style.display = "none";

  const register = document.getElementById("registerModal");
  register.style.display = "none";

  const profile = document.getElementById("profileModal");
  profile.style.display = profile.style.display === "block" ? "none" : "block";

  const userMessages = document.getElementsByClassName("userMessage");
  for (let i = 0; i < userMessages.length; i++) {
    userMessages[i].style.display = "none";
  }
}

document.getElementById("deleteUserForm").onsubmit = async function (event) {
  event.preventDefault();

  const formData = {
    username: document.getElementById("usernameDEL").value,
    password: document.getElementById("passwordDEL").value,
  };

  try {
    const response = await fetch("/delete", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(formData),
    });

    const data = await response.json();
    profileMessage.style.display = "flex";

    if (response.ok) {
      profileMessage.textContent = data.message;

      // Reload the page after successful register.
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } else {
      profileMessage.textContent = data.message;
    }
  } catch (error) {
    profileMessage.style.display = "flex";
    profileMessage.textContent = "Hmm, noe gikk galt...";
  }
};

// LOGOUT
// ------------------------------------------------------------------------------------------------

function logout() {
  fetch("/logout", {
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
