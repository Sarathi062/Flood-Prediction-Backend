const express = require("express");
const passport = require("passport");
const { verifyJWT } = require("../middleware/verifyJWT");
const {
  googleCallback,
  getUserProfile,
  logout,
} = require("../controllers/AuthenticationController");

const router = express.Router();

router.get(
  "/me",
  (req, res, next) => {
    next();
  },
  verifyJWT,
  getUserProfile
);

router.get(
  "/auth/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false,
  })
);

router.get(
  "/auth/google/callback",
  passport.authenticate("google", {
    failureRedirect: "/login",
    session: false,
  }),
  googleCallback
);

// Protected route example
router.get("/getUserProfile", getUserProfile);

// Logout
router.delete("/logout", logout);

module.exports = router;
