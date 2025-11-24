const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    googleId: { type: String, required: true },
    name: String,
    email: String,
    picture: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
