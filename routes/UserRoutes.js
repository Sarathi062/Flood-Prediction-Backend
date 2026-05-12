const express = require("express");
const router = express.Router();
const { verifyJWT } = require("../middleware/verifyJWT");

const {
  markNotificationsSeen,
  updateAlertProfile,
  subscribeToRegion,
  sendRegionAlertMail
} = require("../controllers/UserController");

// Must be protected
router.post("/mark-seen", verifyJWT, markNotificationsSeen);
router.post("/alert-profile", verifyJWT, updateAlertProfile);
router.post("/subscribe-region", verifyJWT, subscribeToRegion);
router.post("/subscribe-region-mail", verifyJWT, sendRegionAlertMail);

module.exports = router;
