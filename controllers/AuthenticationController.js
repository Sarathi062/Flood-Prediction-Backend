const jwt = require("jsonwebtoken");
const User = require("../models/User"); // your MongoDB user model

const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: "7d", // token valid for 7 days
  });
};

const googleCallback = async (req, res) => {
  try {
    // Passport stores Google user info in req.user
    const googleUser = req.user;

    if (!googleUser) {
      return res.status(400).json({ message: "Google authentication failed" });
    }

    // Check if user exists in MongoDB
    let user = await User.findOne({ googleId: googleUser.id });

    // If user does NOT exist -> create new user
    if (!user) {
      user = await User.create({
        googleId: googleUser.id,
        name: googleUser.displayName,
        email: googleUser.emails[0].value,
        picture: googleUser.photos[0].value,
        // role: "student"  // optional: assign default role
      });
    }

    // Generate YOUR OWN JWT for your application
    const token = generateToken(user._id);

    res.cookie("token", token, {
      httpOnly: true,
      secure: true, // must be false on localhost
      sameSite: "None", // important for localhost cross-port cookies
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    // Redirect user to frontend (e.g., dashboard)
    return res.redirect("https://www.floodprediction.in/dashboard");
  } catch (error) {
    console.log("Google Callback Error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-__v");

    if (!user) return res.status(404).json({ message: "User not found" });

    return res.status(200).json({ user });
  } catch (error) {
    console.log("Profile Error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const logout = async (req, res) => {
  try {
    res.clearCookie("token", {
      httpOnly: true,
      secure: true,
      sameSite: "None",
    });

    return res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    console.log("Logout Error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  googleCallback,
  getUserProfile,
  logout,
};
