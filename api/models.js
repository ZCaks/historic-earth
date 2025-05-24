const mongoose = require("mongoose");

const commentSchema = new mongoose.Schema({
  photoUrl: { type: String, required: true },
  username: { type: String, required: true },
  text: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const preserveSchema = new mongoose.Schema({
  photoUrl: { type: String, required: true },
  username: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const Comment = mongoose.model("Comment", commentSchema);
const Preserve = mongoose.model("Preserve", preserveSchema);

module.exports = { Comment, Preserve };
