require("dotenv").config();
const express = require("express");
const cors = require("cors");

const PredictionRoutes = require("./routes/PredictionRoutes");
const TrainingRoutes = require("./routes/TrainingRoutes");
const connectDB = require("./config/connectDB");
const startAgenda = require("./agenda.js");
// const FloodPredictor = require("./mlService");

const DamReleaseLSTMPredictor = require("./DamReleaseLSTMPredictor");

const predictorDam = new DamReleaseLSTMPredictor();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

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
