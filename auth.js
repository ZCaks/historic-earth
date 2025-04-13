document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("login-email").value;
  const password = document.getElementById("login-password").value;

  try {
    const response = await fetch("/api/login", { // 🔥 FIXED: Changed to /api/login
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      credentials: "include" // ✅ Ensures session cookies are included
    });

    if (response.ok) {
      const { user } = await response.json();
      localStorage.setItem("username", user.username); // ✅ Save username instead of token
      alert(`Welcome, ${user.username}!`);
      window.location.href = "index.html"; // ✅ Redirect to main page
    } else {
      alert(await response.text());
    }
  } catch (error) {
    console.error(error);
    alert("Login failed.");
  }
});

document.getElementById("signup-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = document.getElementById("signup-username").value; // ✅ Added username
  const email = document.getElementById("signup-email").value;
  const password = document.getElementById("signup-password").value;
  const passwordRepeat = document.getElementById("signup-password-repeat").value; // ✅ Added password confirmation

  if (password !== passwordRepeat) {
    alert("Passwords do not match!"); // ✅ Prevent signup if passwords don't match
    return;
  }

  try {
    const response = await fetch("/api/signup", { // 🔥 FIXED: Changed to /api/signup
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password, passwordRepeat }),
    });

    if (response.ok) {
      alert("Signup successful! You can now log in.");
      window.location.href = "login.html"; // ✅ Redirect to login page
    } else {
      alert(await response.text());
    }
  } catch (error) {
    console.error(error);
    alert("Signup failed.");
  }
});
