const jwt = require("jsonwebtoken");

const verifyJWT = (req, res, next) => {
  try {
    const token = req.cookies.token || ""; // Read httpOnly cookie

    if (!token) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: decoded.id };

    next();
  } catch (error) {
    return res.status(401).json({ message: "Unauthorized" });
  }
};
module.exports = { verifyJWT };
