require("dotenv").config({ path: __dirname + "/.env" });
console.log("Loaded MONGO_URI:", process.env.MONGO_URI); // Debugging

const express = require("express");
const app = express();

const session = require("express-session");
const MongoStore = require("connect-mongo");
const multer = require("multer");
const { Storage } = require("@google-cloud/storage");
const path = require("path");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const axios = require("axios");
const upload = multer({ storage: multer.memoryStorage() });


// ✅ Load environment variables
require("dotenv").config();

// ✅ Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 60000
})
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch(err => console.error("❌ MongoDB connection error:", err));

app.use(express.json());
app.use(cors({
  origin: ["https://earththen.net", "https://www.earththen.net"],
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization", "Set-Cookie"]
}));

app.set("trust proxy", 1); // 🔥 REQUIRED for secure cookies on Vercel

app.use(session({
  secret: process.env.SESSION_SECRET || "fallback_secret",
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI,
    collectionName: "sessions",
    ttl: 60 * 60 * 24,
    autoRemove: "interval",
    autoRemoveInterval: 10
  }),
  cookie: {
    secure: true,         // ✅ Must be true to allow cookies over HTTPS
    httpOnly: true,
    sameSite: "None",     // ✅ Required for cross-origin cookies
    maxAge: 1000 * 60 * 60 * 24
  }
}));


// ✅ Serve frontend files
app.use(express.static(path.join(__dirname, "../")));

// ✅ Initialize Google Cloud Storage
const storage = new Storage({ keyFilename: path.join(__dirname, "service-account-key.json") });
const bucketName = "historic-earth-uploads";
const bucket = storage.bucket(bucketName);

// ✅ Secure Google Maps API loader
app.get("/api/maps-loader", (req, res) => {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  res.set("Content-Type", "application/javascript");
  res.send(`
    const script = document.createElement('script');
    script.src = "https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places";
    script.async = true;
    document.head.appendChild(script);
  `);
});

// ✅ Fallback to `index.html` for SPA support
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../index.html"));
});


// ✅ Fallback to `index.html` for SPA support
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../index.html"));
});

// ✅ User Model
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  isModerator: { type: Boolean, default: false }
});
const User = mongoose.model("User", userSchema);

// ✅ User Signup Route (Only One Version)
app.post("/api/signup", async (req, res) => {
  try {
    const { username, email, password, passwordRepeat, recaptchaToken } = req.body;

    if (!username || !email || !password || !passwordRepeat || !recaptchaToken) {
      return res.status(400).json({ error: "All fields and reCAPTCHA are required." });
    }

    if (password !== passwordRepeat) {
      return res.status(400).json({ error: "Passwords do not match." });
    }

    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({ error: "Username or email already exists." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, email, password: hashedPassword });

    await newUser.save();
    res.status(201).json({ message: "Signup successful!" });

  } catch (error) {
    console.error("Signup Error:", error);
    res.status(500).json({ error: "Error signing up." });
  }
});

// ✅ ReCAPTCHA Verification (Only One Version)
app.post("/api/verify-recaptcha", async (req, res) => {
  try {
    const { recaptchaToken } = req.body;
    if (!recaptchaToken) {
      return res.status(400).json({ error: "Missing reCAPTCHA token." });
    }

    const recaptchaEnterpriseUrl = `https://recaptchaenterprise.googleapis.com/v1/projects/historicearth-61013/assessments?key=${process.env.RECAPTCHA_API_KEY}`;
    const requestData = {
      event: {
        token: recaptchaToken,
        siteKey: process.env.RECAPTCHA_SITE_KEY,
        expectedAction: "submit",
      }
    };

    const { data } = await axios.post(recaptchaEnterpriseUrl, requestData, {
      headers: { "Content-Type": "application/json" }
    });

    if (!data.tokenProperties.valid) {
      return res.status(400).json({ error: "reCAPTCHA verification failed.", details: data });
    }

    res.json({ success: true });

  } catch (error) {
    console.error("🔥 Error verifying reCAPTCHA:", error);
    res.status(500).json({ error: "Server error verifying reCAPTCHA." });
  }
});

// ✅ DELETE photo
app.delete("/api/photo/:filename", (req, res) => {
  if (!req.session?.user?.isModerator) {
    return res.status(403).json({ error: "Only moderators can edit or delete content" });
  }

  const filename = req.params.filename;
  const file = bucket.file(filename);

  file.delete()
    .then(() => res.json({ message: "Photo deleted" }))
    .catch(err => {
      console.error("Error deleting file:", err);
      res.status(500).json({ error: "Failed to delete" });
    });
});

app.put("/api/photo/:filename", async (req, res) => {
  if (!req.session?.user?.isModerator) {
    return res.status(403).json({ error: "Only moderators can edit or delete content" });
  }

  const { filename } = req.params;
  const { name, year, description, coordinates, exactLocation } = req.body;

  try {
    const file = bucket.file(filename);
    const [metadata] = await file.getMetadata();
    const currentMeta = metadata.metadata || {};

    const newYear = year || currentMeta.year;
const newCoords = coordinates ? JSON.stringify(coordinates) : currentMeta.coordinates;

await file.setMetadata({
  metadata: {
    name: name || currentMeta.name,
    year: newYear,
    description: description || currentMeta.description,
    coordinates: newCoords,
    category: determineCategory(newYear, newCoords, exactLocation === "true"),
  }
});


    res.json({ message: "Metadata updated!" });
  } catch (err) {
    console.error("Error updating metadata:", err);
    res.status(500).json({ error: "Failed to update metadata." });
  }
});



// ✅ User Login Route
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

// ✅ This saves login info to the session:
req.session.user = {
  username: user.username,
  email: user.email,
  isModerator: !!user.isModerator
 // ✅ include moderator info in session
};

console.log("✅ Stored in session:", req.session.user);

res.status(200).json({
  message: "Login successful!",
  user: {
    username: user.username,
    email: user.email,
    isModerator: user.isModerator // ✅ send to frontend
  }
});


  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ error: "Error logging in." });
  }
});

app.post("/api/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Logout error:", err);
      return res.status(500).json({ error: "Logout failed" });
    }

    res.clearCookie("connect.sid", {
      path: "/",
      sameSite: "None",
      secure: true
    });

    console.log("✅ User successfully logged out.");
    res.json({ message: "Logged out successfully." });
  });
});


// ✅ Fetch Photos Route
app.get("/api/photos", async (req, res) => {
  try {
    const [files] = await bucket.getFiles();
    const photos = await Promise.all(
      files.map(async (file) => {
        try {
          const [metadata] = await file.getMetadata();
          const { name, year, description, coordinates, category, uploader } = metadata.metadata || {};
    
          let parsedCoordinates = null;
          try {
            if (coordinates) {
              parsedCoordinates = JSON.parse(coordinates);
            }
          } catch (err) {
            console.warn("⚠️ Invalid coordinates format:", coordinates);
          }
    
          return {
            name: name || "Unknown",
            year: year || "Unknown",
            description: description || "No description provided.",
            coordinates: parsedCoordinates,
            category: category || "complete",
            uploader: uploader || "Anonymous",
            url: `https://storage.googleapis.com/${bucketName}/${file.name}`,
          };
        } catch (innerErr) {
          console.error("❌ Error reading metadata for file:", file.name, innerErr);
          return null;
        }
      })
    );
    

    res.json(photos.filter(photo => photo !== null));

  } catch (error) {
    console.error("🔥 Error fetching photos:", error);
    res.status(500).json({ error: "Error fetching photos." });
  }
});

app.post("/api/upload", upload.single("photo"), async (req, res) => {
  try {
    const { name, year, description, coordinates, exactLocation } = req.body;


      // ✅ Clean the year and coordinates
    const cleanedYear = typeof year === "string" ? year.trim() : "";
    let cleanedCoords = null;
    try {
      cleanedCoords = coordinates ? JSON.parse(coordinates) : null;
    } catch (err) {
      console.warn("⚠️ Coordinates were not valid JSON:", coordinates);
    }


    const uploader = req.session?.user?.username;
    if (!uploader) {
      console.warn("⚠️ No uploader in session!");
      return res.status(401).json({ error: "You must be logged in to upload." });
    }


    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded." });
    }

    const blob = bucket.file(Date.now() + "-" + req.file.originalname);

    const stream = blob.createWriteStream({
      metadata: {
        contentType: req.file.mimetype,
        metadata: {
          name,
          year: cleanedYear,
          description,
          coordinates: JSON.stringify(cleanedCoords),
          category: determineCategory(cleanedYear, cleanedCoords, exactLocation === "true"),
          uploader
        }
      }
    });
    
    
    
    stream.on("error", (err) => {
      console.error("Upload error:", err);
      res.status(500).json({ error: "Upload failed." });
    });

    stream.on("finish", () => {
      res.status(200).json({ message: "Upload successful!" });
    });

    stream.end(req.file.buffer);
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
  
});

function determineCategory(year, coordinates, isExact) {
  if (!year && !isExact) return "multiple_missing";
  if (!year) return "missing_year";
  if (!isExact) return "approx_location";
  return "complete";
}


// ✅ Start Server
if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
  });
}

// ✅ Auth Status Route

app.get("/api/auth-status", (req, res) => {
  try {
      console.log("🔥 SESSION CHECK:", req.session);
      console.log("🔍 Checking auth status...");

      if (!req.session) {
          console.log("⚠️ req.session is undefined!");
          return res.status(500).json({ error: "Session is not available. Ensure express-session is correctly configured." });
      }

      console.log("Session Data:", req.session);

      if (req.session.user) {
          console.log("✅ User is logged in:", req.session.user);
          return res.json({
            loggedIn: true,
            user: {
              username: req.session.user.username,
              isModerator: !!req.session.user.isModerator
            }
          });
          
      } else {
          console.log("❌ No user logged in.");
          return res.json({ loggedIn: false });
      }
  } catch (error) {
      console.error("🔥 Server error in /api/auth-status:", error);
      res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
});


module.exports = app;
