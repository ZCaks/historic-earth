let map;
let selectedCoordinates = null;
let markers = [];
let tempMarker = null;
let uploadMode = false;
let editingPhoto = null;
let editMarker = null;
let isModerator = false;



function initMap() {
  map = new google.maps.Map(document.getElementById("map"), {
    center: { lat: 0, lng: 0 },
    zoom: 2,
    gestureHandling: "greedy" // 🔥 Enables regular scroll zoom
  });
  
  fetchPhotos(); // Ensure photos load correctly

  map.addListener("click", (event) => {
    if (uploadMode) {
      selectUploadLocation(event.latLng);
    } else if (editingPhoto) {
      setEditLocation(event.latLng);
    } else {
      hidePhotoViewer();
    }
  });
  

  const toggleUploadButton = document.getElementById("toggle-upload-button");
  if (toggleUploadButton) {
    toggleUploadButton.addEventListener("click", toggleUploadMode);
  }

  setupSearch();
  setupLegendFilters();
  setupAuthentication();
  checkLoginStatus(); // 🔥 Ensure session check runs
}

// 🔹 Check Login Status and Display User Info
async function checkLoginStatus() {
  try {
    const response = await fetch("/api/auth-status", {
      credentials: "include" // ✅ required
    });
    
    const data = await response.json();

    // Get elements safely
    const menuContent = document.getElementById("menu-content");
    const usernameDisplay = document.getElementById("user-username");
    const userStatus = document.getElementById("user-status");
    const uploadButton = document.getElementById("toggle-upload-button");

    // If any elements are missing, stop the function
    if (!menuContent || !usernameDisplay || !userStatus || !uploadButton) {
      console.warn("⚠️ Some elements are missing. Skipping updates.");
      return;
    }

    if (data.loggedIn) {
      usernameDisplay.textContent = data.user.username;
      userStatus.style.display = "block";
      uploadButton.disabled = false;
    
      // ✅ Store moderator status
      isModerator = data.user.isModerator || false;
      localStorage.setItem("isModerator", isModerator ? "true" : "false");
    
      menuContent.innerHTML = ""; // ✅ clear first
    
      menuContent.innerHTML = `
      <p>Logged in as <strong>${data.user.username}</strong></p>
      <a href="/account.html">My Account</a>
      <a href="/about.html">About</a>
      <a href="#" id="logout">Logout</a>
    `;
    
    


      document.getElementById("logout").addEventListener("click", async () => {
        await fetch("/api/logout", {
          method: "POST",
          credentials: "include" // ✅ required
        });
        
        window.location.reload();
      });
    } else {
      userStatus.style.display = "none";
      uploadButton.disabled = true;
      menuContent.innerHTML = `
  <a href="/about.html">About</a><br>
  <a href="/login.html">Login / Sign Up</a>
`;

    }

    if (data.user.isModerator) {
      // ✅ Show moderator controls, like edit/delete buttons
    }
    

  } catch (error) {
    console.error("❌ Error checking auth status:", error);
  }
}


// 🔹 Fetch Photos & Restore Markers on the Map
async function fetchPhotos() {
  try {
    const response = await fetch("/api/photos"); // ✅ Ensure correct API endpoint
    if (!response.ok) throw new Error("Failed to fetch photos.");

    const photos = await response.json();
    console.log("Fetched Photos:", photos);

    photos.forEach((photo) => {
      if (!photo.coordinates || !photo.coordinates.lat || !photo.coordinates.lng) {
        console.warn("Skipping photo due to missing coordinates:", photo);
        return; // ✅ Skip if coordinates are missing
      }

      const position = {
        lat: parseFloat(photo.coordinates.lat),
        lng: parseFloat(photo.coordinates.lng),
      };

      const markerColor = getMarkerColor(photo.category);
      const marker = new google.maps.Marker({
        position,
        map: map,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: markerColor,
          fillOpacity: 0.8,
          strokeWeight: 0,
        },
      });

      marker.categoryColor = markerColor;
      markers.push(marker);

      marker.addListener("click", () => {
        displayPhoto(photo);
      });

      marker.addListener("dblclick", () => {
        map.setCenter(marker.getPosition());
        map.setZoom(14); // You can adjust zoom level if needed
      });
      
    });
  } catch (error) {
    console.error("Error fetching photos:", error);
  }
}


function getMarkerColor(category) {
  switch (category) {
    case "complete":
      return "orange";
    case "missing_year":
      return "yellow";
    case "approx_location":
      return "darkblue";
    case "multiple_missing":
      return "darkgreen";
    default:
      return "gray";
  }
}

function displayPhoto(photoData) {
  const photoViewer = document.getElementById("photo-viewer");
  const metadata = document.getElementById("photo-metadata");
  console.log("👀 Viewing photo:", photoData);
   console.log("🔐 Moderator?", localStorage.getItem("isModerator"));


  document.getElementById("photo-preview").src = photoData.url;
  document.getElementById("photo-name-display").textContent = photoData.name;
  document.getElementById("photo-year-display").textContent = photoData.year || "Unknown";
  document.getElementById("photo-description-display").textContent = photoData.description || "No description provided.";
  document.getElementById("photo-uploader-display").textContent = photoData.uploader || "Unknown";

  // Show both containers
  photoViewer.style.display = "block";
  photoViewer.style.padding = "0"; // 👈 This removes the default inline padding
  photoViewer.style.background = "transparent"; // 👈 this is the magic
  metadata.style.display = "block";

  // Inject moderator buttons
  const modControls = document.getElementById("moderator-controls");
  modControls.innerHTML = "";

  if (localStorage.getItem("isModerator") === "true") {
    const editBtn = document.createElement("button");
    editBtn.textContent = "Edit";
    editBtn.onclick = () => prepareEditPhoto(photoData.url, photoData.name, photoData.year, photoData.description);

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "Delete";
    deleteBtn.onclick = () => deletePhoto(photoData.url);

    modControls.appendChild(editBtn);
    modControls.appendChild(deleteBtn);
  }
}


function prepareEditPhoto(url, name, year, description) {
  editingPhoto = { url, name, year, description };

  const photoViewer = document.getElementById("photo-viewer");

  photoViewer.innerHTML = `
    <h2>Edit Photo</h2>
    <label>Name: <input id="edit-name" value="${name}" /></label><br>

    <label>
      <input type="radio" name="edit-year-mode" value="exact" checked> Exact Date
    </label>
    <label>
      <input type="radio" name="edit-year-mode" value="range"> Year Range
    </label><br>

    <div id="edit-exact-fields">
      <input type="number" id="edit-year" placeholder="Year" min="1000" max="2100" value="${year || ""}" />
      <select id="edit-month"><option value="">--</option></select>
      <select id="edit-day"><option value="">--</option></select>
    </div>

    <div id="edit-range-fields" style="display: none;">
      <input type="number" id="edit-start-year" placeholder="Start Year" min="1000" max="2100" />
      <input type="number" id="edit-end-year" placeholder="End Year" min="1000" max="2100" />
    </div>

    <label>Description:<br><textarea id="edit-description">${description}</textarea></label><br>
    <p><strong>New Location:</strong> Click on the map</p>
    <button onclick="submitPhotoEdit()">Save Changes</button>
    <button onclick="cancelPhotoEdit()">Cancel</button>

    <label>
   <input type="checkbox" id="edit-exact-location-checkbox" checked>
   This is the exact location
   </label><br>


    <p><strong>New Location:</strong> Click on the map</p>

  `;

  populateMonthDayDropdowns("edit-month", "edit-day");

  // Toggle range/exact year inputs
  document.querySelectorAll('input[name="edit-year-mode"]').forEach(radio => {
    radio.addEventListener("change", () => {
      const mode = document.querySelector('input[name="edit-year-mode"]:checked').value;
      document.getElementById("edit-exact-fields").style.display = mode === "exact" ? "block" : "none";
      document.getElementById("edit-range-fields").style.display = mode === "range" ? "block" : "none";
    });
  });

  alert("Click on the map to set a new location (optional).");
}

function populateMonthDayDropdowns(monthId, dayId) {
  const months = ["January", "February", "March", "April", "May", "June",
                  "July", "August", "September", "October", "November", "December"];
  const monthSelect = document.getElementById(monthId);
  const daySelect = document.getElementById(dayId);

  months.forEach((month, index) => {
    const opt = document.createElement("option");
    opt.value = (index + 1).toString().padStart(2, "0");
    opt.text = month;
    monthSelect.appendChild(opt);
  });

  for (let i = 1; i <= 31; i++) {
    const opt = document.createElement("option");
    opt.value = i.toString().padStart(2, "0");
    opt.text = i;
    daySelect.appendChild(opt);
  }
}



function hidePhotoViewer() {
  document.getElementById("photo-viewer").style.display = "none";
}

function setupSearch() {
  const searchInput = document.getElementById("search-input");
  const searchButton = document.getElementById("search-button");

  if (!searchInput || !searchButton) return;

  searchButton.addEventListener("click", () => {
    const query = searchInput.value.trim();
    if (!query) {
      alert("Please enter a city name to search.");
      return;
    }

    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ address: query }, (results, status) => {
      if (status === "OK" && results[0]) {
        const location = results[0].geometry.location;
        map.setCenter(location);
        map.setZoom(12);
      } else {
        alert("City not found. Please try again.");
      }
    });
  });
}

function setupLegendFilters() {
  const legendFilters = {
    filterComplete: "orange",
    filterMissingYear: "yellow",
    filterApproxLocation: "darkblue",
    filterMultipleMissing: "darkgreen",
    filterSelectedLocation: "red",
  };

  Object.keys(legendFilters).forEach((filterId) => {
    const checkbox = document.getElementById(filterId);

    if (checkbox) {
      checkbox.addEventListener("change", () => {
        const visibleCategories = Object.keys(legendFilters)
          .filter((id) => document.getElementById(id).checked)
          .map((id) => legendFilters[id]);

        updateVisibleMarkers(visibleCategories);
      });
    }
  });
}

function updateVisibleMarkers(visibleCategories) {
  markers.forEach((marker) => {
    if (visibleCategories.includes(marker.categoryColor)) {
      marker.setMap(map);
    } else {
      marker.setMap(null);
    }
  });
}


function setupAuthentication() {
  console.log("Script loaded and running!");

  const loginForm = document.getElementById("login-form");
  const signupForm = document.getElementById("signup-form");

  // 🔹 LOGIN HANDLER
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const usernameOrEmail = document.getElementById("login-username-or-email").value;
      const password = document.getElementById("login-password").value;

      if (typeof grecaptcha !== "undefined" && grecaptcha.enterprise) {
        grecaptcha.enterprise.ready(() => {
          grecaptcha.enterprise.execute("6LeAPxcrAAAAAGzen-KVMpVjbEKaKnfNSLEyqdQn", { action: "login" })
            .then(async (token) => {
              try {
                const response = await fetch("/api/login", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ usernameOrEmail, password, recaptchaToken: token }),
                  credentials: "include"
                });

                const data = await response.json();

                if (response.ok) {
                  // ✅ Save username and moderator status locally
                  localStorage.setItem("username", data.user.username);
                  localStorage.setItem("isModerator", data.user.isModerator ? "true" : "false");
                
                  alert(`Welcome, ${data.user.username}!`);
                  window.location.href = "index.html";
                }
                 else {
                  alert("Login failed: " + (data.error || "Unknown error."));
                }
              } catch (err) {
                console.error("Login error:", err);
                alert("Login failed.");
              }
            })
            .catch((err) => {
              console.error("reCAPTCHA error (login):", err);
              alert("reCAPTCHA verification failed.");
            });
        });
      } else {
        alert("reCAPTCHA not loaded.");
      }
    });
  }

  // 🔹 SIGNUP HANDLER
  if (signupForm) {
    signupForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const username = document.getElementById("signup-username").value;
      const email = document.getElementById("signup-email").value;
      const password = document.getElementById("signup-password").value;
      const passwordRepeat = document.getElementById("signup-password-repeat").value;
      const termsAccepted = document.getElementById("terms-checkbox").checked;

      if (!termsAccepted) {
        alert("You must accept the Terms of Agreement.");
        return;
      }

      if (password !== passwordRepeat) {
        alert("Passwords do not match.");
        return;
      }

      if (typeof grecaptcha !== "undefined" && grecaptcha.enterprise) {
        grecaptcha.enterprise.ready(() => {
          grecaptcha.enterprise.execute("6LeAPxcrAAAAAGzen-KVMpVjbEKaKnfNSLEyqdQn", { action: "signup" })
            .then(async (recaptchaToken) => {
              try {
                const response = await fetch("/api/signup", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    username,
                    email,
                    password,
                    passwordRepeat,
                    recaptchaToken
                  }),
                  credentials: "include"
                });

                const data = await response.json();

                if (response.ok) {
                  alert('Signup successful! Please verify your email before logging in.');
                  window.location.href = "login.html";
                } else {
                  alert("Signup failed: " + (data.error || "Unknown error."));
                }
              } catch (err) {
                console.error("Signup error:", err);
                alert("Signup failed.");
              }
            })
            .catch((err) => {
              console.error("reCAPTCHA error (signup):", err);
              alert("reCAPTCHA verification failed.");
            });
        });
      } else {
        alert("reCAPTCHA not loaded.");
      }
    });
  }
}


function toggleUploadMode() {
  console.log("🔥 Upload button clicked!");
  uploadMode = !uploadMode;
  console.log("📌 Upload mode is now:", uploadMode);

  const uploadContainer = document.getElementById("upload-container");
  const toggleUploadButton = document.getElementById("toggle-upload-button");

  if (uploadMode) {
    uploadContainer.style.display = "block";
    toggleUploadButton.textContent = "Disable Upload Mode";
  } else {
    uploadContainer.style.display = "none";
    toggleUploadButton.textContent = "Enable Upload Mode";

    if (tempMarker) {
      tempMarker.setMap(null);
      tempMarker = null;
      selectedCoordinates = null;
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM fully loaded! Initializing scripts...");

  // 🔹 Year Mode Switching for Upload Form
  document.querySelectorAll('input[name="year-mode"]').forEach(radio => {
    radio.addEventListener("change", () => {
      const selected = document.querySelector('input[name="year-mode"]:checked').value;

      document.getElementById("exact-date-fields").style.display = selected === "exact" ? "block" : "none";
      document.getElementById("year-range-fields").style.display = selected === "range" ? "block" : "none";
    });
  });

  // 🔹 Populate month/day dropdowns
  const daySelect = document.getElementById("photo-day");
  const monthSelect = document.getElementById("photo-month");

  if (daySelect && monthSelect) {
    for (let i = 1; i <= 31; i++) {
      const option = document.createElement("option");
      option.value = i.toString().padStart(2, "0");
      option.text = i;
      daySelect.appendChild(option);
    }

    const months = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];
    months.forEach((month, index) => {
      const option = document.createElement("option");
      option.value = (index + 1).toString().padStart(2, "0");
      option.text = month;
      monthSelect.appendChild(option);
    });
  }

  // 🔹 Map Initialization
  if (document.getElementById("map")) {
    initMap();
  }

  // 🔹 Auth Setup
  if (document.getElementById("login-form") || document.getElementById("signup-form")) {
    setupAuthentication();
  }

  checkLoginStatus();
});


function selectUploadLocation(latLng) {
  if (tempMarker) {
    tempMarker.setMap(null); // Remove old one
  }

  tempMarker = new google.maps.Marker({
    position: latLng,
    map: map,
    icon: {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 8,
      fillColor: "red",
      fillOpacity: 0.9,
      strokeWeight: 0
    }
  });

  selectedCoordinates = {
    lat: latLng.lat(),
    lng: latLng.lng()
  };

  console.log("📍 Selected coordinates:", selectedCoordinates);
}

function editPhoto(photoUrl) {
  const filename = photoUrl.split("/").pop(); // Extract filename from URL

  const newName = prompt("New photo name (leave blank to keep current):");
  const newYear = prompt("New year taken (leave blank to keep current):");
  const newDescription = prompt("New description (leave blank to keep current):");

  const lat = prompt("New latitude (leave blank to keep current):");
  const lng = prompt("New longitude (leave blank to keep current):");

  const updateData = {};
  if (newName) updateData.name = newName;
  if (newYear) updateData.year = newYear;
  if (newDescription) updateData.description = newDescription;

  if (lat && lng) {
    updateData.coordinates = JSON.stringify({
      lat: parseFloat(lat),
      lng: parseFloat(lng)
    });
  }

  if (Object.keys(updateData).length === 0) {
    alert("No updates entered.");
    return;
  }

  fetch(`/api/photo/${filename}/edit`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(updateData)
  })
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        alert("Edit failed: " + data.error);
      } else {
        alert("Photo updated!");
        window.location.reload();
      }
    })
    .catch(err => {
      console.error("Edit failed:", err);
      alert("An error occurred during edit.");
    });
}


function deletePhoto(photoUrl) {
  const filename = photoUrl.split("/").pop(); // get the file name from URL
  if (!confirm("Are you sure you want to delete this photo?")) return;

  fetch(`/api/photo/${filename}`, {
    method: "DELETE",
    credentials: "include"
  })
    .then((res) => res.json())
    .then((data) => {
      alert("Photo deleted.");
      window.location.reload(); // reload to refresh markers
    })
    .catch((err) => {
      console.error("Delete failed:", err);
      alert("Failed to delete photo.");
    });
}

function setEditLocation(latLng) {
  if (editMarker) {
    editMarker.setMap(null);
  }

  editMarker = new google.maps.Marker({
    position: latLng,
    map: map,
    icon: {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 8,
      fillColor: "red",
      fillOpacity: 0.9,
      strokeWeight: 0
    }
  });

  editingPhoto.newCoordinates = {
    lat: latLng.lat(),
    lng: latLng.lng()
  };

  console.log("📍 New edit location selected:", editingPhoto.newCoordinates);
}


const uploadForm = document.getElementById("upload-form");
if (uploadForm) {
  uploadForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const file = document.getElementById("photo-input").files[0];
    const name = document.getElementById("photo-name").value;
    let year = "";
    const selectedMode = document.querySelector('input[name="year-mode"]:checked').value;
    
    if (selectedMode === "exact") {
      const day = document.getElementById("photo-day").value;
      const month = document.getElementById("photo-month").value;
      const y = document.getElementById("photo-year").value;
    
      if (y && month && day) {
        year = `${y}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`; // yyyy-mm-dd
      } else if (y && month) {
        year = `${y}-${month.padStart(2, "0")}`;
      } else if (y) {
        year = y;
      }
    } else if (selectedMode === "range") {
      const start = document.getElementById("photo-start-year").value;
      const end = document.getElementById("photo-end-year").value;
    
      if (start && end) {
        year = `${start}-${end}`;
      } else if (start) {
        year = start;
      }
    }
    
    const description = document.getElementById("photo-description").value;
    const isExactLocation = document.getElementById("exact-location-checkbox").checked;



    if (!file || !selectedCoordinates) {
      alert("Please select a photo and a location on the map.");
      return;
    }

    const formData = new FormData();
    formData.append("photo", file);
    formData.append("name", name);
    formData.append("year", year);
    formData.append("description", description);
    formData.append("exactLocation", isExactLocation ? "true" : "false");
    formData.append("coordinates", JSON.stringify(selectedCoordinates));

    const uploader = localStorage.getItem("username");
    formData.append("uploader", uploader || "Anonymous");
    
    const isExact = document.getElementById("exact-location-checkbox").checked;
    let category = "complete";

    if (!year && !isExact) {
      category = "multiple_missing";
    } else if (!year) {
      category = "missing_year";
    } else if (!isExact) {
      category = "approx_location";
    }
    
    formData.append("category", category);
        


    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
        credentials: "include" // ✅ This tells the browser to include cookies (session)
      });
      

      if (response.ok) {
        alert("Photo uploaded successfully!");
        window.location.reload();
      } else {
        const data = await response.json();
        alert("Upload failed: " + (data.error || "Unknown error"));
      }
    } catch (error) {
      console.error("Upload failed:", error);
      alert("Upload failed.");
    }
  });
}
async function submitPhotoEdit() {
  if (!editingPhoto) return;

  const name = document.getElementById("edit-name").value;
  const description = document.getElementById("edit-description").value;

  const mode = document.querySelector('input[name="edit-year-mode"]:checked').value;
  let year = "";

  if (mode === "exact") {
    const y = document.getElementById("edit-year").value;
    const m = document.getElementById("edit-month").value;
    const d = document.getElementById("edit-day").value;

    if (y && m && d) year = `${y}-${m}-${d}`;
    else if (y && m) year = `${y}-${m}`;
    else if (y) year = y;
  } else {
    const start = document.getElementById("edit-start-year").value;
    const end = document.getElementById("edit-end-year").value;
    if (start && end) year = `${start}-${end}`;
    else if (start) year = start;
  }

  const isExact = document.getElementById("edit-exact-location-checkbox").checked;

  const updateData = {
    name,
    year,
    description,
    coordinates: editingPhoto.newCoordinates,
    exactLocation: isExact ? "true" : "false"
  };
  

  const filename = editingPhoto.url.split("/").pop();

  try {
    const response = await fetch(`/api/photo/${filename}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updateData),
      credentials: "include"
    });

    const data = await response.json();
    if (response.ok) {
      alert("Photo updated successfully!");
      window.location.reload();
    } else {
      alert("Failed to update: " + (data.error || "Unknown error"));
    }
  } catch (err) {
    console.error("Update failed:", err);
    alert("Update failed.");
  }
}

function cancelPhotoEdit() {
  editingPhoto = null;
  if (editMarker) {
    editMarker.setMap(null);
    editMarker = null;
  }
  hidePhotoViewer();
}

window.initMap = initMap;

// 🔐 Load account page logic when on account.html
document.addEventListener("DOMContentLoaded", () => {
  if (window.location.pathname.includes("account.html")) {
    loadAccountPage(); // ✅ Always call this
  }
});



async function loadAccountPage() {
  try {
    const response = await fetch("/api/auth-status", {
      credentials: "include",
    });
    const { loggedIn, user } = await response.json();

    if (!loggedIn) {
      alert("Please log in to view your account.");
      window.location.href = "login.html";
      return;
    }

    document.getElementById("account-username-display").textContent = user.username;
    document.getElementById("account-created-date").textContent = new Date(user.createdAt).toLocaleDateString();
    

    loadUserPhotos();
    loadProfilePicture();

    document.getElementById("edit-profile-pic-btn").addEventListener("click", () => {
      document.getElementById("profile-pic-input").click();
    });
    
  document.getElementById("profile-pic-input").addEventListener("change", uploadProfilePicture);


    const saveBtn = document.getElementById("save-profile-btn");
    if (saveBtn) saveBtn.addEventListener("click", saveProfile);
    
    const uploadBtn = document.getElementById("upload-pic-btn");
    if (uploadBtn) uploadBtn.addEventListener("click", uploadProfilePicture);
    
    const changePassBtn = document.getElementById("change-password-btn");
    if (changePassBtn) changePassBtn.addEventListener("click", changePassword);
    
    const deleteBtn = document.getElementById("delete-account-btn");
    if (deleteBtn) deleteBtn.addEventListener("click", deleteAccount);
    

  } catch (err) {
    console.error("Error loading account page:", err);
    alert("Failed to load account page.");
  }
  const toggleBtn = document.getElementById("toggle-password-edit");
  const passwordFields = document.getElementById("password-fields");
  
  if (toggleBtn && passwordFields) {
    toggleBtn.addEventListener("click", () => {
      const isVisible = passwordFields.style.display === "block";
      passwordFields.style.display = isVisible ? "none" : "block";
      toggleBtn.textContent = isVisible ? "Edit" : "Cancel";
    });
  }
  
  
}

async function loadProfilePicture() {
  try {
    const res = await fetch("/api/profile-picture", { credentials: "include" });
    const data = await res.json();
    if (res.ok && data.url) {
      document.getElementById("profile-pic-preview").src = data.url;
    }
  } catch (err) {
    console.warn("No profile picture found.");
  }
}

async function saveProfile() {
  const newUsername = document.getElementById("account-username").value.trim();
  const res = await fetch("/api/update-profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ username: newUsername })
  });

  const data = await res.json();
  if (res.ok) {
    alert("Profile updated!");
    localStorage.setItem("username", newUsername);
    window.location.reload();
  } else {
    alert(data.error || "Failed to update profile.");
  }
}

async function uploadProfilePicture() {
  const file = document.getElementById("profile-pic-input").files[0];
  if (!file) {
    return alert("Please select a photo first.");
  }

  const formData = new FormData();
  formData.append("profilePic", file);

  const res = await fetch("/api/upload-profile-pic", {
    method: "POST",
    credentials: "include",
    body: formData
  });

  const data = await res.json();
  if (res.ok) {
    alert("Profile picture uploaded!");
    window.location.reload();
  } else {
    alert(data.error || "Upload failed.");
  }
}

async function changePassword() {
  const current = document.getElementById("current-password").value;
  const newPass = document.getElementById("new-password").value;
  const repeat = document.getElementById("repeat-new-password").value;

  if (newPass !== repeat) {
    return alert("New passwords do not match.");
  }

  const res = await fetch("/api/change-password", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ currentPassword: current, newPassword: newPass })
  });

  const data = await res.json();
  if (res.ok) {
    alert("Password changed successfully.");
  } else {
    alert(data.error || "Failed to change password.");
  }
}

async function deleteAccount() {
  if (!confirm("Are you sure you want to delete your account? This cannot be undone.")) return;

  const res = await fetch("/api/delete-account", {
    method: "DELETE",
    credentials: "include"
  });

  if (res.ok) {
    alert("Your account has been deleted.");
    window.location.href = "index.html";
  } else {
    const data = await res.json();
    alert(data.error || "Account deletion failed.");
  }
}

async function loadUserPhotos() {
  try {
    const res = await fetch("/api/my-photos", {
      credentials: "include"
    });
    const photos = await res.json();

    const container = document.getElementById("user-photos-container");
    if (Array.isArray(photos)) {
      photos.forEach(photo => {
        const img = document.createElement("img");
        img.src = photo.url;
        img.alt = photo.name;
        img.style.maxWidth = "150px";
        img.style.margin = "10px";
        container.appendChild(img);
      });
    }
  } catch (err) {
    console.error("Error loading photos:", err);
  }
}
