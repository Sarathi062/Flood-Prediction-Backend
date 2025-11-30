require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const PredictionRoutes = require("./routes/PredictionRoutes");
const TrainingRoutes = require("./routes/TrainingRoutes");
const EvaluationRoutes = require("./routes/EvaluationRoutes");
const AuthenticationRoutes = require("./routes/AuthenticationRoutes.js");
const connectDB = require("./config/connectDB");
const startAgenda = require("./agenda.js");
const passport = require("./config/passport.js");
const { verifyJWT } = require("./middleware/verifyJWT.js");
// const FloodPredictor = require("./mlService");

const DamReleaseLSTMPredictor = require("./DamReleaseLSTMPredictor");

const predictorDam = new DamReleaseLSTMPredictor();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(
  cors({
    origin: ["https://floodprediction.in", "https://www.floodprediction.in"], // your frontend URL
    //origin: "http://localhost:3000",
    credentials: true, // allow cookies
  })
);

app.use(express.json());
app.use(cookieParser());
app.use(passport.initialize());

// Initialize model loading on startup
// async function initializeDamModel() {
//   try {
//     await predictorDam.loadModel(); // Load saved model
//     console.log("✅ Dam prediction model loaded on startup");
//   } catch (error) {
//     console.log("⚠️ No saved dam model found. Please train the model first.");
//   }
// }
app.get("/", (req, res) => {
  res.send("Flood Prediction API is running 🚀");
});
app.use("/api/login", AuthenticationRoutes);

app.use("/api", verifyJWT, PredictionRoutes);
app.use("/api/train", verifyJWT, TrainingRoutes);
app.use("/api/evaluation", verifyJWT, EvaluationRoutes);

connectDB().then(async () => {
  // Start server and initialize model
  await startAgenda();
  app.listen(PORT, async () => {
    console.log(`Backend running on http://localhost:${PORT}`);
    console.log(`Test: http://localhost:${PORT}/api/predict-flood'`);

    // Initialize model on startup
    // await initializeDamModel();
  });
});
