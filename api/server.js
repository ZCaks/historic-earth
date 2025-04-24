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
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB max
});
const crypto = require("crypto");
const { Resend } = require("resend");
const resend = new Resend("re_Jexwy3nK_G7rb1ZCicbr66k5Q7EFwKt81");
const connectDB = require("../db");

connectDB(); // Call it early — NOT inside route handlers


// ✅ Load environment variables
require("dotenv").config();

app.use(express.json());
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));

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
app.use("/images", express.static(path.join(__dirname, "../images")));


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
    script.src = "https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places&callback=initMap";
    script.async = true;
    script.defer = true;
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
  isModerator: { type: Boolean, default: false },
  verified: { type: Boolean, default: false },
  profilePic: { type: String },
  createdAt: { type: Date, default: Date.now },
  passwordResetToken: { type: String },
  passwordResetExpires: { type: Date }
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
    const newUser = new User({ username, email, password: hashedPassword, verified: false });




    await newUser.save();

    const token = crypto.randomBytes(32).toString("hex");

await EmailVerification.create({
  userId: newUser._id,
  token
})

const link = `https://earththen.net/api/verify-email?token=${token}`;

console.log("🔗 Verification link:", link);
;

const response = await resend.emails.send({
  from: "Earththen <no-reply@earththen.net>",
  to: [email],
  subject: "Verify your Earththen account",
  html: `
    <h1>Welcome to Earththen 🌍</h1>
    <p>Please verify your account by clicking the button below:</p>
    <a href="${link}" style="display:inline-block;padding:10px 20px;background:#4eaaff;color:white;border-radius:5px;text-decoration:none;">Verify Email</a>
    <p>This link will expire in 24 hours.</p>
  `
});

console.log("📧 Resend response:", response);



    res.status(201).json({ message: "Signup successful! Please check your email to verify your account." });

  } catch (error) {
    console.error("Signup Error:", error);
    res.status(500).json({ error: "Error signing up." });
  }
});

const emailVerificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  token: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: 86400 } // 24 hours
});

const EmailVerification = mongoose.model("EmailVerification", emailVerificationSchema);


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
    const { usernameOrEmail, password } = req.body;

    const user = await User.findOne({
      $or: [
        { email: usernameOrEmail },
        { username: usernameOrEmail }
      ]
    });
    
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    
    if (!user.verified) {
      return res.status(403).json({ error: "Please verify your email before logging in." });
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

app.get("/api/get-profile-pic", async (req, res) => {
  const { username } = req.query;
  if (!username) return res.status(400).json({ error: "Username is required." });

  try {
    const user = await User.findOne({ username });
    if (user?.profilePic) {
      return res.json({ url: user.profilePic });
    } else {
      return res.json({ url: "https://storage.googleapis.com/historic-earth-uploads/Default_profile.png" });
    }
  } catch (err) {
    console.error("Error loading profile picture:", err);
    res.status(500).json({ error: "Server error." });
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

app.get("/api/auth-status", async (req, res) => {

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
      
        const fullUser = await User.findOne({ email: req.session.user.email });
      
        return res.json({
          loggedIn: true,
          user: {
            username: fullUser.username,
            isModerator: !!fullUser.isModerator,
            createdAt: fullUser.createdAt
          }
        });
      }
       else {
          console.log("❌ No user logged in.");
          return res.json({ loggedIn: false });
      }
  } catch (error) {
      console.error("🔥 Server error in /api/auth-status:", error);
      res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
});

app.get("/api/verify-email", async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.redirect("/verify-email.html?status=missing");
    }

    const record = await EmailVerification.findOne({ token });

    if (!record) {
      return res.redirect("/verify-email.html?status=invalid");
    }

    // ✅ Mark user as verified
    await User.updateOne({ _id: record.userId }, { $set: { verified: true } });

    // ✅ Remove token after use
    await EmailVerification.deleteOne({ _id: record._id });

    return res.redirect("/verify-email.html?status=success");

  } catch (error) {
    console.error("Verification Error:", error);
    return res.redirect("/verify-email.html?status=error");
  }
});

// 🔐 Password Reset Request Handler
app.post("/api/request-password-reset", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email is required." });

  const user = await User.findOne({ email });
  if (!user) {
    // Respond the same for all to prevent email guessing
    return res.status(200).json({ message: "If that email exists, a reset link will be sent." });
  }

  const token = crypto.randomBytes(32).toString("hex");
  const tokenExpiry = Date.now() + 1000 * 60 * 30; // 30 minutes

  user.passwordResetToken = token;
  user.passwordResetExpires = new Date(tokenExpiry);
  await user.save();

  const resetUrl = `https://www.earththen.net/reset-password.html?token=${token}`;
  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": "Bearer re_Jexwy3nK_G7rb1ZCicbr66k5Q7EFwKt81", // ✅ Your Resend API key
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: "noreply@earththen.net",
      to: email,
      subject: "Reset your Earththen password",
      html: `
        <p>You requested to reset your password.</p>
        <p><a href="${resetUrl}">Click here to reset your password</a></p>
        <p>This link will expire in 30 minutes.</p>
      `
    })
  });

  if (!resendResponse.ok) {
    console.error("❌ Failed to send reset email:", await resendResponse.text());
    return res.status(500).json({ error: "Failed to send reset email." });
  }

  res.status(200).json({ message: "Reset email sent." });
});


// ✅ Update profile username
app.put("/api/update-profile", async (req, res) => {
  if (!req.session?.user) return res.status(401).json({ error: "Not logged in." });

  const { username } = req.body;
  if (!username) return res.status(400).json({ error: "Username required." });

  try {
    const existing = await User.findOne({ username });
    if (existing && existing.email !== req.session.user.email) {
      return res.status(400).json({ error: "Username already taken." });
    }

    const updated = await User.findOneAndUpdate(
      { email: req.session.user.email },
      { username },
      { new: true }
    );

    req.session.user.username = updated.username;
    res.json({ message: "Username updated." });
  } catch (err) {
    console.error("Update error:", err);
    res.status(500).json({ error: "Update failed." });
  }
});

// ✅ Change password
app.put("/api/change-password", async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!req.session?.user) return res.status(401).json({ error: "Not logged in." });

  try {
    const user = await User.findOne({ email: req.session.user.email });
    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) return res.status(401).json({ error: "Incorrect current password." });

    const hashed = await bcrypt.hash(newPassword, 10);
    user.password = hashed;
    await user.save();

    res.json({ message: "Password updated." });
  } catch (err) {
    console.error("Password update error:", err);
    res.status(500).json({ error: "Error changing password." });
  }
});

// ✅ Upload profile picture
app.post("/api/upload-profile-pic", upload.single("profilePic"), async (req, res) => {
  if (!req.session?.user) return res.status(401).json({ error: "Not logged in." });
  if (!req.file) return res.status(400).json({ error: "No file uploaded." });

  try {
    const filename = `profilepics/${Date.now()}-${req.file.originalname}`;
    const blob = bucket.file(filename);

    const stream = blob.createWriteStream({
      metadata: { contentType: req.file.mimetype }
    });

    stream.on("error", (err) => {
      console.error("Profile pic upload error:", err);
      res.status(500).json({ error: "Upload failed." });
    });

    stream.on("finish", async () => {
      const publicUrl = `https://storage.googleapis.com/${bucketName}/${filename}`;
      await User.updateOne({ email: req.session.user.email }, { profilePic: publicUrl });
      res.json({ message: "Profile picture uploaded.", url: publicUrl });
    });

    stream.end(req.file.buffer);
  } catch (err) {
    console.error("Profile pic upload error:", err);
    res.status(500).json({ error: "Internal error." });
  }
});

app.get("/api/profile-picture", async (req, res) => {
  if (!req.session?.user) return res.status(401).json({ error: "Not logged in." });

  try {
    const user = await User.findOne({ email: req.session.user.email });

    if (user?.profilePic) {
      return res.json({ url: user.profilePic });
    }

    // ✅ Fallback to local static image
    return res.json({ url: "https://storage.googleapis.com/historic-earth-uploads/Default_profile.png" });

  } catch (err) {
    console.error("Error getting profile picture:", err);
    res.status(500).json({ error: "Failed to load profile picture." });
  }
});

// ✅ Reset Password Handler
app.post("/api/reset-password", async (req, res) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return res.status(400).json({ error: "Missing token or new password." });
  }

  try {
    const user = await User.findOne({
      passwordResetToken: token,
      passwordResetExpires: { $gt: Date.now() } // still valid
    });

    if (!user) {
      return res.status(400).json({ error: "Invalid or expired token." });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    user.password = hashed;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    res.status(200).json({ message: "Password reset successful. You can now log in." });
  } catch (err) {
    console.error("❌ Reset password error:", err);
    res.status(500).json({ error: "Server error while resetting password." });
  }
});


// ✅ Get logged-in user's uploaded photos
app.get("/api/my-photos", async (req, res) => {
  if (!req.session?.user) return res.status(401).json({ error: "Not logged in." });

  try {
    const [files] = await bucket.getFiles();
    const photos = [];

    for (const file of files) {
      const [metadata] = await file.getMetadata();
      if (metadata?.metadata?.uploader === req.session.user.username) {
        photos.push({
          url: `https://storage.googleapis.com/${bucketName}/${file.name}`,
          name: metadata.metadata.name || "Untitled",
        });
      }
    }

    res.json(photos);
  } catch (err) {
    console.error("Error fetching user photos:", err);
    res.status(500).json({ error: "Error fetching your photos." });
  }
});

// ✅ Delete account + all uploaded photos
app.delete("/api/delete-account", async (req, res) => {
  if (!req.session?.user) return res.status(401).json({ error: "Not logged in." });

  try {
    const username = req.session.user.username;

    // Delete user files from bucket
    const [files] = await bucket.getFiles();
    const deleteOps = files
      .filter(file => file.metadata?.metadata?.uploader === username)
      .map(file => file.delete());

    await Promise.all(deleteOps);

    // Delete profile picture if exists
    const user = await User.findOne({ username });
    if (user?.profilePic?.includes("profilepics/")) {
      const picFile = user.profilePic.split("/").pop();
      await bucket.file(`profilepics/${picFile}`).delete().catch(() => {});
    }

    await User.deleteOne({ username });
    req.session.destroy(() => {
      res.clearCookie("connect.sid", {
        path: "/",
        sameSite: "None",
        secure: true
      });
      res.json({ message: "Account deleted." });
    });
  } catch (err) {
    console.error("Delete account error:", err);
    res.status(500).json({ error: "Failed to delete account." });
  }
});


module.exports = app;
