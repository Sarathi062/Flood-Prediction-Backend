const express = require("express");
const router = express.Router();
const { verifyJWT } = require("../middleware/verifyJWT");

const {
  markNotificationsSeen,
  updateAlertProfile,
  subscribeToRegion,
} = require("../controllers/UserController");

// Must be protected
router.post("/mark-seen", verifyJWT, markNotificationsSeen);
router.post("/alert-profile", verifyJWT, updateAlertProfile);
router.post("/subscribe-region", verifyJWT, subscribeToRegion);

module.exports = router;
