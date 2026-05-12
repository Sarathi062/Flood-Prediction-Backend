const mongoose = require("mongoose");

/* 🔔 Notification Schema (with timestamps) */
const notificationSchema = new mongoose.Schema(
  {
    id: { type: String }, // unique notification key
    title: String,
    message: String,
    seen: { type: Boolean, default: false },
  },
  { timestamps: true }, // <-- IMPORTANT: adds createdAt & updatedAt
);

/* 📱 Alert Profile Schema */
const alertProfileSchema = new mongoose.Schema({
  phone: { type: String },
  smsEnabled: { type: Boolean, default: false },
  emailEnabled: { type: Boolean, default: true },
  completed: { type: Boolean, default: false },
});

/* 👤 User Schema */
const userSchema = new mongoose.Schema(
  {
    googleId: { type: String, required: true },
    name: String,
    email: String,
    picture: String,

    /* 🔔 In-App Notifications */
    notifications: {
      type: [notificationSchema],
      default: () => [],
    },

    /* 📱 User alert preferences */
    alertProfile: {
      type: alertProfileSchema,
      default: () => ({}),
    },

    /* 🌍 Regions user subscribed to */
    subscribedRegions: [
      {
        type: [String],
        ref: "Region",
      },
    ],
  },
  { timestamps: true },
);

module.exports = mongoose.model("User", userSchema);
