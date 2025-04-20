// db.js
const mongoose = require("mongoose");

let isConnected = false;

async function connectDB() {
  if (isConnected) return;

  const uri = process.env.MONGO_URI;

  if (!uri) {
    throw new Error("❌ MONGO_URI not defined in environment.");
  }

  try {
    await mongoose.connect(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    isConnected = true;
    console.log("✅ MongoDB connected.");
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
    throw error;
  }
}

module.exports = connectDB;
