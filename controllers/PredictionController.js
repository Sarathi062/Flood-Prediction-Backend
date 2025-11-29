const fetch = require("node-fetch");
const DamReleaseLSTMPredictor = require("../DamReleaseLSTMPredictor");
const FloodResult = require("../models/FloodResult");

const apiKey = process.env.OPENWEATHER_API_KEY || ""; 

const predictorDam = new DamReleaseLSTMPredictor();

const damPredict = async (req, res) => {
  try {
    // Check if model is loaded
    if (!predictorDam.trained) {
      return res.status(400).json({
        success: false,
        error: "Model not loaded. Please train the model first.",
        status: "error",
      });
    }

    const { weatherSequence, currentWaterLevelPercent } = req.body;
    // console.log(weatherSequence);
    // Validate input
    if (!weatherSequence || !Array.isArray(weatherSequence)) {
      return res.status(400).json({
        success: false,
        error: "weatherSequence must be an array",
        status: "error",
      });
    }

    if (weatherSequence.length !== predictorDam.sequenceLength) {
      return res.status(400).json({
        success: false,
        error: `weatherSequence must contain exactly ${predictorDam.sequenceLength} hours of data`,
        expectedLength: predictorDam.sequenceLength,
        receivedLength: weatherSequence.length,
        status: "error",
      });
    }

    if (
      currentWaterLevelPercent === undefined ||
      currentWaterLevelPercent === null
    ) {
      return res.status(400).json({
        success: false,
        error: "currentWaterLevelPercent is required",
        status: "error",
      });
    }

    // Make prediction
    const prediction = await predictorDam.predict(
      weatherSequence,
      Number(currentWaterLevelPercent)
    );

    // Return prediction results
    res.json({
      success: true,
      prediction: {
        releaseProbability: prediction.releaseProbability,
        willRelease: prediction.willRelease,
        estimatedDischarge: prediction.estimatedDischarge,
        waterLevelInput: currentWaterLevelPercent,
      },
      modelInfo: predictorDam.getModelInfo(),
      timestamp: new Date().toISOString(),
      status: "success",
    });
  } catch (error) {
    console.error("Prediction error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      status: "error",
    });
  }
};

const floodPredict = async (req, res) => {
  try {
    const responseData = await FloodResult.findOne().sort({ timestamp: -1 });

    if (!responseData) {
      return res.status(404).json({
        success: false,
        message:
          "No predictions available yet. Data will appear after the scheduled run.",
      });
    }

    res.json(responseData);
  } catch (error) {
    console.error("Flood prediction error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      status: "error",
    });
  }
};

module.exports = {
  floodPredict,
  damPredict,
};
