require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const PredictionRoutes = require("./routes/PredictionRoutes");
const TrainingRoutes = require("./routes/TrainingRoutes");
const AuthenticationRoutes = require("./routes/AuthenticationRoutes.js");
const connectDB = require("./config/connectDB");
const startAgenda = require("./agenda.js");
const passport = require("./config/passport.js");

// const FloodPredictor = require("./mlService");

const DamReleaseLSTMPredictor = require("./DamReleaseLSTMPredictor");

const predictorDam = new DamReleaseLSTMPredictor();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(
  cors({
    origin: ["https://floodprediction.in", "https://www.floodprediction.in"], // your frontend URL
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

app.use("/api", PredictionRoutes);
app.use("/api/train", TrainingRoutes);
app.use("/api/login", AuthenticationRoutes);

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
