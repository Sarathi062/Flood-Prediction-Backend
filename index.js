require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const xlsx = require("xlsx");
const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");

// const FloodPredictor = require("./mlService");
const DamReleaseLSTMPredictor = require("./DamReleaseLSTMPredictor");

const app = express();
const PORT = process.env.PORT || 3001;
// const predictor = new FloodPredictor();

const predictorDam = new DamReleaseLSTMPredictor();

// Middleware
app.use(cors());
app.use(express.json());

const apiKey = process.env.OPENWEATHER_API_KEY || "";

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = "./uploads";
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({
  storage: storage,
  fileFilter: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== ".xlsx" && ext !== ".xls") {
      return cb(new Error("Only Excel files are allowed"));
    }
    cb(null, true);
  },
});

// Helper function to convert Excel date to JavaScript Date
function excelDateToJSDate(excelDate) {
  if (typeof excelDate === "number") {
    // Excel stores dates as serial numbers
    // Adjust for Excel's leap year bug and timezone
    return new Date((excelDate - 25569) * 86400 * 1000);
  }
  return excelDate; // Already a date string or Date object
}

// Helper function to parse and validate Excel data
function parseExcelData(filePath) {
  try {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0]; // Use first sheet
    const worksheet = workbook.Sheets[sheetName];

    // Convert to JSON with raw values to handle dates properly
    const rawData = xlsx.utils.sheet_to_json(worksheet, {
      raw: false,
      dateNF: "yyyy-mm-dd hh:mm:ss",
    });

    console.log(`Loaded ${rawData.length} rows from Excel sheet`);

    // Transform and validate data
    const transformedData = rawData
      .map((row, index) => {
        try {
          // Handle datetime conversion
          let datetime;
          if (row.datetime) {
            if (typeof row.datetime === "number") {
              datetime = excelDateToJSDate(row.datetime);
            } else {
              datetime = new Date(row.datetime);
            }
          } else if (row.date) {
            if (typeof row.date === "number") {
              datetime = excelDateToJSDate(row.date);
            } else {
              datetime = new Date(row.date);
            }
          } else {
            throw new Error(
              `No datetime/date column found in row ${index + 1}`
            );
          }

          // Extract hour_of_day if not present
          let hour_of_day = row.hour_of_day;
          if (hour_of_day === undefined) {
            hour_of_day = datetime.getHours();
          }

          // Determine monsoon season (June to September in India)
          let is_monsoon_season = row.is_monsoon_season;
          if (is_monsoon_season === undefined) {
            const month = datetime.getMonth() + 1; // getMonth() returns 0-11
            is_monsoon_season = month >= 6 && month <= 9 ? 1 : 0;
          }

          return {
            timestamp: datetime.toISOString(),
            datetime: datetime.toISOString(),
            date: datetime.toISOString().split("T")[0],
            hour_of_day: Number(hour_of_day) || 0,
            is_monsoon_season: Number(is_monsoon_season) || 0,
            unix_timestamp:
              row.unix_timestamp || Math.floor(datetime.getTime() / 1000),

            // Weather data
            rainfall_1h: Number(row.rainfall_1h) || 0,
            temperature_celsius: Number(row.temperature_celsius) || 25,
            humidity: Number(row.humidity) || 70,
            pressure: Number(row.pressure) || 1013,
            wind_deg: Number(row.wind_deg) || 0,
            wind_gust: Number(row.wind_gust) || 0,
            wind_speed: Number(row.wind_speed) || 5,
            clouds: Number(row.clouds) || 0,
            visibility: Number(row.visibility) || 10000,
            dew_point: Number(row.dew_point) || 15,
            uvi: Number(row.uvi) || 0,
            rainfall_6h: Number(row.rainfall_6h) || 0,
            rainfall_24h: Number(row.rainfall_24h) || 0,

            // Dam/reservoir data
            current_water_level_percent:
              Number(row.current_water_level_percent) || 50,

            // Target variables
            release_occurred: Number(row.release_occurred) || 0,
            discharge_volume: Number(row.discharge_volume) || 0,
          };
        } catch (error) {
          console.warn(
            `Warning: Error processing row ${index + 1}:`,
            error.message
          );
          return null; // Skip invalid rows
        }
      })
      .filter((row) => row !== null); // Remove null rows

    console.log(`Successfully parsed ${transformedData.length} valid rows`);
    return transformedData;
  } catch (error) {
    throw new Error(`Failed to parse Excel file: ${error.message}`);
  }
}

// Training endpoint with file upload
app.post("/api/train", upload.single("excel"), async (req, res) => {
  try {
    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Please upload an Excel file (.xlsx or .xls)",
      });
    }

    console.log("Processing uploaded file:", req.file.filename);

    // Parse Excel data
    const trainingData = parseExcelData(req.file.path);

    if (trainingData.length < 25) {
      return res.status(400).json({
        success: false,
        message: `Insufficient data: Need at least 25 rows, got ${trainingData.length}`,
      });
    }

    // Sort data by timestamp to ensure proper sequence
    trainingData.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    // Build rolling sequences of real records
    const SEQ_LEN = 24;
    const trainingBatch = [];

    for (let i = SEQ_LEN; i < trainingData.length; i++) {
      trainingBatch.push(trainingData.slice(i - SEQ_LEN, i));
    }

    console.log("Total training sequences:", trainingBatch.length);
    console.log("Total training samples (flat):", trainingBatch.flat().length);

    if (trainingBatch.length === 0) {
      return res.status(400).json({
        success: false,
        message: `Need at least ${
          SEQ_LEN + 1
        } rows for sequence training, got ${trainingData.length}`,
      });
    }

    // Train the model with processed data
    console.log("Starting model training...");
    await predictorDam.trainModel(trainingBatch.flat());

    // Save the model
    await predictorDam.saveModel();

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    // Get and return model info
    res.json({
      success: true,
      message: "LSTM model trained successfully with Excel data!",
      dataInfo: {
        totalRows: trainingData.length,
        trainingSequences: trainingBatch.length,
        sequenceLength: SEQ_LEN,
        dateRange: {
          start: trainingData[0]?.timestamp,
          end: trainingData[trainingData.length - 1]?.timestamp,
        },
      },
      modelInfo: predictorDam.getModelInfo(),
    });
  } catch (error) {
    console.error("Training error:", error);

    // Clean up uploaded file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      success: false,
      message: error.message || "Training failed",
    });
  }
});

// Alternative endpoint for training with direct Excel file path (no upload)
app.get("/api/train-file", async (req, res) => {
  try {
    const filePath = "./dam_prediction_data_2025-10-10.xlsx";

    if (!filePath) {
      return res.status(400).json({
        success: false,
        message: "Please provide filePath in request body",
      });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(400).json({
        success: false,
        message: `File not found: ${filePath}`,
      });
    }

    console.log("Processing file:", filePath);

    // Parse Excel data
    const trainingData = parseExcelData(filePath);

    if (trainingData.length < 25) {
      return res.status(400).json({
        success: false,
        message: `Insufficient data: Need at least 25 rows, got ${trainingData.length}`,
      });
    }

    // Sort data by timestamp
    trainingData.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    // Build rolling sequences
    const SEQ_LEN = 24;
    const trainingBatch = [];

    for (let i = SEQ_LEN; i < trainingData.length; i++) {
      trainingBatch.push(trainingData.slice(i - SEQ_LEN, i));
    }

    console.log("Total training sequences:", trainingBatch.length);

    if (trainingBatch.length === 0) {
      return res.status(400).json({
        success: false,
        message: `Need at least ${SEQ_LEN + 1} rows for sequence training`,
      });
    }

    // Train the model
    console.log("Starting model training...");
    await predictorDam.trainModel(trainingBatch);

    // Save the model
    await predictorDam.saveModel();

    res.json({
      success: true,
      message: "LSTM model trained successfully!",
      dataInfo: {
        totalRows: trainingData.length,
        trainingSequences: trainingBatch.length,
        sequenceLength: SEQ_LEN,
        dateRange: {
          start: trainingData[0]?.timestamp,
          end: trainingData[trainingData.length - 1]?.timestamp,
        },
      },
      modelInfo: predictorDam.getModelInfo(),
    });
  } catch (error) {
    console.error("Training error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Training failed",
    });
  }
});

// ML Prediction endpoint (same as before)
// app.get('/api/predict', async (req, res) => {
//   try {
//     const weatherSequence = [
//   { rainfall_1h: 0, rainfall_6h: 0, rainfall_24h: 0, temperature_celsius: 25, humidity: 70, pressure: 1013, wind_deg: 12, wind_gust: 0, wind_speed: 5, clouds: 0, visibility: 10000, dew_point: 15, uvi: 0, hour_of_day: 0, is_monsoon_season: 0 },
//   { rainfall_1h: 0, rainfall_6h: 1, rainfall_24h: 2, temperature_celsius: 24, humidity: 71, pressure: 1012, wind_deg: 14, wind_gust: 1, wind_speed: 6, clouds: 5, visibility: 9800, dew_point: 14, uvi: 0, hour_of_day: 1, is_monsoon_season: 0 },
//   { rainfall_1h: 2, rainfall_6h: 3, rainfall_24h: 5, temperature_celsius: 23, humidity: 75, pressure: 1011, wind_deg: 15, wind_gust: 2, wind_speed: 5, clouds: 10, visibility: 9500, dew_point: 16, uvi: 0, hour_of_day: 2, is_monsoon_season: 1 },
//   { rainfall_1h: 3, rainfall_6h: 4, rainfall_24h: 7, temperature_celsius: 22, humidity: 77, pressure: 1010, wind_deg: 13, wind_gust: 3, wind_speed: 7, clouds: 20, visibility: 9200, dew_point: 17, uvi: 1, hour_of_day: 3, is_monsoon_season: 1 },
//   { rainfall_1h: 0, rainfall_6h: 3, rainfall_24h: 8, temperature_celsius: 24, humidity: 74, pressure: 1013, wind_deg: 12, wind_gust: 2, wind_speed: 6, clouds: 15, visibility: 9600, dew_point: 15, uvi: 1, hour_of_day: 4, is_monsoon_season: 1 },
//   { rainfall_1h: 0, rainfall_6h: 3, rainfall_24h: 8, temperature_celsius: 25, humidity: 73, pressure: 1014, wind_deg: 10, wind_gust: 1, wind_speed: 5, clouds: 5, visibility: 9800, dew_point: 14, uvi: 2, hour_of_day: 5, is_monsoon_season: 1 },
//   { rainfall_1h: 1, rainfall_6h: 4, rainfall_24h: 9, temperature_celsius: 26, humidity: 70, pressure: 1015, wind_deg: 12, wind_gust: 0, wind_speed: 4, clouds: 0, visibility: 10000, dew_point: 13, uvi: 2, hour_of_day: 6, is_monsoon_season: 1 },
//   { rainfall_1h: 0, rainfall_6h: 4, rainfall_24h: 9, temperature_celsius: 28, humidity: 68, pressure: 1016, wind_deg: 15, wind_gust: 0, wind_speed: 5, clouds: 0, visibility: 10000, dew_point: 12, uvi: 3, hour_of_day: 7, is_monsoon_season: 1 },
//   { rainfall_1h: 0, rainfall_6h: 3, rainfall_24h: 8, temperature_celsius: 29, humidity: 67, pressure: 1015, wind_deg: 13, wind_gust: 1, wind_speed: 6, clouds: 0, visibility: 9900, dew_point: 12, uvi: 5, hour_of_day: 8, is_monsoon_season: 1 },
//   { rainfall_1h: 0, rainfall_6h: 2, rainfall_24h: 6, temperature_celsius: 30, humidity: 65, pressure: 1014, wind_deg: 12, wind_gust: 0, wind_speed: 5, clouds: 0, visibility: 10000, dew_point: 11, uvi: 6, hour_of_day: 9, is_monsoon_season: 1 },
//   { rainfall_1h: 0, rainfall_6h: 1, rainfall_24h: 4, temperature_celsius: 31, humidity: 63, pressure: 1013, wind_deg: 14, wind_gust: 0, wind_speed: 5, clouds: 0, visibility: 10000, dew_point: 11, uvi: 7, hour_of_day: 10, is_monsoon_season: 1 },
//   { rainfall_1h: 0, rainfall_6h: 0, rainfall_24h: 2, temperature_celsius: 32, humidity: 61, pressure: 1012, wind_deg: 15, wind_gust: 0, wind_speed: 4, clouds: 0, visibility: 10000, dew_point: 10, uvi: 8, hour_of_day: 11, is_monsoon_season: 1 },
//   { rainfall_1h: 0, rainfall_6h: 0, rainfall_24h: 2, temperature_celsius: 33, humidity: 60, pressure: 1011, wind_deg: 13, wind_gust: 0, wind_speed: 4, clouds: 0, visibility: 10000, dew_point: 10, uvi: 8, hour_of_day: 12, is_monsoon_season: 1 },
//   { rainfall_1h: 0, rainfall_6h: 0, rainfall_24h: 1, temperature_celsius: 34, humidity: 58, pressure: 1010, wind_deg: 12, wind_gust: 0, wind_speed: 4, clouds: 0, visibility: 10000, dew_point: 9, uvi: 8, hour_of_day: 13, is_monsoon_season: 1 },
//   { rainfall_1h: 0, rainfall_6h: 0, rainfall_24h: 1, temperature_celsius: 34, humidity: 57, pressure: 1009, wind_deg: 12, wind_gust: 0, wind_speed: 3, clouds: 0, visibility: 10000, dew_point: 9, uvi: 7, hour_of_day: 14, is_monsoon_season: 1 },
//   { rainfall_1h: 0, rainfall_6h: 0, rainfall_24h: 0, temperature_celsius: 33, humidity: 56, pressure: 1009, wind_deg: 13, wind_gust: 0, wind_speed: 3, clouds: 0, visibility: 10000, dew_point: 8, uvi: 6, hour_of_day: 15, is_monsoon_season: 1 },
//   { rainfall_1h: 0, rainfall_6h: 0, rainfall_24h: 0, temperature_celsius: 32, humidity: 55, pressure: 1009, wind_deg: 14, wind_gust: 0, wind_speed: 3, clouds: 0, visibility: 10000, dew_point: 8, uvi: 4, hour_of_day: 16, is_monsoon_season: 1 },
//   { rainfall_1h: 0, rainfall_6h: 0, rainfall_24h: 0, temperature_celsius: 31, humidity: 55, pressure: 1010, wind_deg: 15, wind_gust: 0, wind_speed: 3, clouds: 0, visibility: 10000, dew_point: 8, uvi: 3, hour_of_day: 17, is_monsoon_season: 1 },
//   { rainfall_1h: 0, rainfall_6h: 0, rainfall_24h: 0, temperature_celsius: 30, humidity: 54, pressure: 1011, wind_deg: 15, wind_gust: 0, wind_speed: 3, clouds: 0, visibility: 10000, dew_point: 8, uvi: 2, hour_of_day: 18, is_monsoon_season: 1 },
//   { rainfall_1h: 0, rainfall_6h: 0, rainfall_24h: 0, temperature_celsius: 29, humidity: 54, pressure: 1011, wind_deg: 16, wind_gust: 0, wind_speed: 3, clouds: 0, visibility: 10000, dew_point: 7, uvi: 1, hour_of_day: 19, is_monsoon_season: 1 },
//   { rainfall_1h: 0, rainfall_6h: 0, rainfall_24h: 0, temperature_celsius: 28, humidity: 54, pressure: 1012, wind_deg: 15, wind_gust: 0, wind_speed: 3, clouds: 0, visibility: 10000, dew_point: 7, uvi: 1, hour_of_day: 20, is_monsoon_season: 0 },
//   { rainfall_1h: 0, rainfall_6h: 0, rainfall_24h: 0, temperature_celsius: 27, humidity: 54, pressure: 1012, wind_deg: 14, wind_gust: 0, wind_speed: 3, clouds: 0, visibility: 10000, dew_point: 7, uvi: 0, hour_of_day: 21, is_monsoon_season: 0 },
//   { rainfall_1h: 0, rainfall_6h: 0, rainfall_24h: 0, temperature_celsius: 26, humidity: 54, pressure: 1013, wind_deg: 13, wind_gust: 0, wind_speed: 3, clouds: 0, visibility: 10000, dew_point: 6, uvi: 0, hour_of_day: 22, is_monsoon_season: 0 },
//   { rainfall_1h: 0, rainfall_6h: 0, rainfall_24h: 0, temperature_celsius: 25, humidity: 53, pressure: 1013, wind_deg: 12, wind_gust: 0, wind_speed: 3, clouds: 0, visibility: 10000, dew_point: 6, uvi: 0, hour_of_day: 23, is_monsoon_season: 0 }
// ];

// const currentWaterLevelPercent = 52;

//     if (!weatherSequence || !Array.isArray(weatherSequence) || weatherSequence.length !== predictorDam.sequenceLength) {
//       return res.status(400).json({
//         error: `weatherSequence must be an array of length ${predictorDam.sequenceLength}`,
//         status: 'error'
//       });
//     }

//     if (currentWaterLevelPercent === undefined || currentWaterLevelPercent === null) {
//       return res.status(400).json({
//         error: 'currentWaterLevelPercent is required',
//         status: 'error'
//       });
//     }

//     // Await the asynchronous prediction
//     const result = await predictorDam.predict(weatherSequence, Number(currentWaterLevelPercent));

//     // Respond with prediction results
//     res.json({
//       success: true,
//       releaseProbability: result.releaseProbability,
//       willRelease: result.willRelease,
//       estimatedDischarge: result.estimatedDischarge,
//       status: 'success',
//       timestamp: new Date(),
//       modelInfo: predictorDam.getModelInfo()
//     });

//   } catch (error) {
//     res.status(500).json({
//       error: error.message,
//       status: 'error'
//     });
//   }
// });

// Initialize model loading on startup
async function initializeDamModel() {
  try {
    await predictorDam.loadModel(); // Load saved model
    console.log("✅ Dam prediction model loaded on startup");
  } catch (error) {
    console.log("⚠️ No saved dam model found. Please train the model first.");
  }
}

// Prediction endpoint
app.post("/api/predict-dam", async (req, res) => {
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
});

// Test endpoint with hardcoded data
app.get("/api/test-predict", async (req, res) => {
  try {
    // Sample 24-hour weather sequence
    const weatherSequence = [
      {
        rainfall_1h: 0,
        rainfall_6h: 0,
        rainfall_24h: 0,
        temperature_celsius: 25,
        humidity: 70,
        pressure: 1013,
        wind_deg: 12,
        wind_gust: 0,
        wind_speed: 5,
        clouds: 0,
        visibility: 10000,
        dew_point: 15,
        uvi: 0,
        hour_of_day: 0,
        is_monsoon_season: 0,
      },
      {
        rainfall_1h: 0,
        rainfall_6h: 1,
        rainfall_24h: 2,
        temperature_celsius: 24,
        humidity: 71,
        pressure: 1012,
        wind_deg: 14,
        wind_gust: 1,
        wind_speed: 6,
        clouds: 5,
        visibility: 9800,
        dew_point: 14,
        uvi: 0,
        hour_of_day: 1,
        is_monsoon_season: 0,
      },
      {
        rainfall_1h: 2,
        rainfall_6h: 3,
        rainfall_24h: 5,
        temperature_celsius: 23,
        humidity: 75,
        pressure: 1011,
        wind_deg: 15,
        wind_gust: 2,
        wind_speed: 5,
        clouds: 10,
        visibility: 9500,
        dew_point: 16,
        uvi: 0,
        hour_of_day: 2,
        is_monsoon_season: 1,
      },
      {
        rainfall_1h: 3,
        rainfall_6h: 4,
        rainfall_24h: 7,
        temperature_celsius: 22,
        humidity: 77,
        pressure: 1010,
        wind_deg: 13,
        wind_gust: 3,
        wind_speed: 7,
        clouds: 20,
        visibility: 9200,
        dew_point: 17,
        uvi: 1,
        hour_of_day: 3,
        is_monsoon_season: 1,
      },
      {
        rainfall_1h: 0,
        rainfall_6h: 3,
        rainfall_24h: 8,
        temperature_celsius: 24,
        humidity: 74,
        pressure: 1013,
        wind_deg: 12,
        wind_gust: 2,
        wind_speed: 6,
        clouds: 15,
        visibility: 9600,
        dew_point: 15,
        uvi: 1,
        hour_of_day: 4,
        is_monsoon_season: 1,
      },
      {
        rainfall_1h: 0,
        rainfall_6h: 3,
        rainfall_24h: 8,
        temperature_celsius: 25,
        humidity: 73,
        pressure: 1014,
        wind_deg: 10,
        wind_gust: 1,
        wind_speed: 5,
        clouds: 5,
        visibility: 9800,
        dew_point: 14,
        uvi: 2,
        hour_of_day: 5,
        is_monsoon_season: 1,
      },
      {
        rainfall_1h: 1,
        rainfall_6h: 4,
        rainfall_24h: 9,
        temperature_celsius: 26,
        humidity: 70,
        pressure: 1015,
        wind_deg: 12,
        wind_gust: 0,
        wind_speed: 4,
        clouds: 0,
        visibility: 10000,
        dew_point: 13,
        uvi: 2,
        hour_of_day: 6,
        is_monsoon_season: 1,
      },
      {
        rainfall_1h: 0,
        rainfall_6h: 4,
        rainfall_24h: 9,
        temperature_celsius: 28,
        humidity: 68,
        pressure: 1016,
        wind_deg: 15,
        wind_gust: 0,
        wind_speed: 5,
        clouds: 0,
        visibility: 10000,
        dew_point: 12,
        uvi: 3,
        hour_of_day: 7,
        is_monsoon_season: 1,
      },
      {
        rainfall_1h: 0,
        rainfall_6h: 3,
        rainfall_24h: 8,
        temperature_celsius: 29,
        humidity: 67,
        pressure: 1015,
        wind_deg: 13,
        wind_gust: 1,
        wind_speed: 6,
        clouds: 0,
        visibility: 9900,
        dew_point: 12,
        uvi: 5,
        hour_of_day: 8,
        is_monsoon_season: 1,
      },
      {
        rainfall_1h: 0,
        rainfall_6h: 2,
        rainfall_24h: 6,
        temperature_celsius: 30,
        humidity: 65,
        pressure: 1014,
        wind_deg: 12,
        wind_gust: 0,
        wind_speed: 5,
        clouds: 0,
        visibility: 10000,
        dew_point: 11,
        uvi: 6,
        hour_of_day: 9,
        is_monsoon_season: 1,
      },
      {
        rainfall_1h: 0,
        rainfall_6h: 1,
        rainfall_24h: 4,
        temperature_celsius: 31,
        humidity: 63,
        pressure: 1013,
        wind_deg: 14,
        wind_gust: 0,
        wind_speed: 5,
        clouds: 0,
        visibility: 10000,
        dew_point: 11,
        uvi: 7,
        hour_of_day: 10,
        is_monsoon_season: 1,
      },
      {
        rainfall_1h: 0,
        rainfall_6h: 0,
        rainfall_24h: 2,
        temperature_celsius: 32,
        humidity: 61,
        pressure: 1012,
        wind_deg: 15,
        wind_gust: 0,
        wind_speed: 4,
        clouds: 0,
        visibility: 10000,
        dew_point: 10,
        uvi: 8,
        hour_of_day: 11,
        is_monsoon_season: 1,
      },
      {
        rainfall_1h: 0,
        rainfall_6h: 0,
        rainfall_24h: 2,
        temperature_celsius: 33,
        humidity: 60,
        pressure: 1011,
        wind_deg: 13,
        wind_gust: 0,
        wind_speed: 4,
        clouds: 0,
        visibility: 10000,
        dew_point: 10,
        uvi: 8,
        hour_of_day: 12,
        is_monsoon_season: 1,
      },
      {
        rainfall_1h: 0,
        rainfall_6h: 0,
        rainfall_24h: 1,
        temperature_celsius: 34,
        humidity: 58,
        pressure: 1010,
        wind_deg: 12,
        wind_gust: 0,
        wind_speed: 4,
        clouds: 0,
        visibility: 10000,
        dew_point: 9,
        uvi: 8,
        hour_of_day: 13,
        is_monsoon_season: 1,
      },
      {
        rainfall_1h: 0,
        rainfall_6h: 0,
        rainfall_24h: 1,
        temperature_celsius: 34,
        humidity: 57,
        pressure: 1009,
        wind_deg: 12,
        wind_gust: 0,
        wind_speed: 3,
        clouds: 0,
        visibility: 10000,
        dew_point: 9,
        uvi: 7,
        hour_of_day: 14,
        is_monsoon_season: 1,
      },
      {
        rainfall_1h: 0,
        rainfall_6h: 0,
        rainfall_24h: 0,
        temperature_celsius: 33,
        humidity: 56,
        pressure: 1009,
        wind_deg: 13,
        wind_gust: 0,
        wind_speed: 3,
        clouds: 0,
        visibility: 10000,
        dew_point: 8,
        uvi: 6,
        hour_of_day: 15,
        is_monsoon_season: 1,
      },
      {
        rainfall_1h: 0,
        rainfall_6h: 0,
        rainfall_24h: 0,
        temperature_celsius: 32,
        humidity: 55,
        pressure: 1009,
        wind_deg: 14,
        wind_gust: 0,
        wind_speed: 3,
        clouds: 0,
        visibility: 10000,
        dew_point: 8,
        uvi: 4,
        hour_of_day: 16,
        is_monsoon_season: 1,
      },
      {
        rainfall_1h: 0,
        rainfall_6h: 0,
        rainfall_24h: 0,
        temperature_celsius: 31,
        humidity: 55,
        pressure: 1010,
        wind_deg: 15,
        wind_gust: 0,
        wind_speed: 3,
        clouds: 0,
        visibility: 10000,
        dew_point: 8,
        uvi: 3,
        hour_of_day: 17,
        is_monsoon_season: 1,
      },
      {
        rainfall_1h: 0,
        rainfall_6h: 0,
        rainfall_24h: 0,
        temperature_celsius: 30,
        humidity: 54,
        pressure: 1011,
        wind_deg: 15,
        wind_gust: 0,
        wind_speed: 3,
        clouds: 0,
        visibility: 10000,
        dew_point: 8,
        uvi: 2,
        hour_of_day: 18,
        is_monsoon_season: 1,
      },
      {
        rainfall_1h: 0,
        rainfall_6h: 0,
        rainfall_24h: 0,
        temperature_celsius: 29,
        humidity: 54,
        pressure: 1011,
        wind_deg: 16,
        wind_gust: 0,
        wind_speed: 3,
        clouds: 0,
        visibility: 10000,
        dew_point: 7,
        uvi: 1,
        hour_of_day: 19,
        is_monsoon_season: 1,
      },
      {
        rainfall_1h: 0,
        rainfall_6h: 0,
        rainfall_24h: 0,
        temperature_celsius: 28,
        humidity: 54,
        pressure: 1012,
        wind_deg: 15,
        wind_gust: 0,
        wind_speed: 3,
        clouds: 0,
        visibility: 10000,
        dew_point: 7,
        uvi: 1,
        hour_of_day: 20,
        is_monsoon_season: 0,
      },
      {
        rainfall_1h: 0,
        rainfall_6h: 0,
        rainfall_24h: 0,
        temperature_celsius: 27,
        humidity: 54,
        pressure: 1012,
        wind_deg: 14,
        wind_gust: 0,
        wind_speed: 3,
        clouds: 0,
        visibility: 10000,
        dew_point: 7,
        uvi: 0,
        hour_of_day: 21,
        is_monsoon_season: 0,
      },
      {
        rainfall_1h: 0,
        rainfall_6h: 0,
        rainfall_24h: 0,
        temperature_celsius: 26,
        humidity: 54,
        pressure: 1013,
        wind_deg: 13,
        wind_gust: 0,
        wind_speed: 3,
        clouds: 0,
        visibility: 10000,
        dew_point: 6,
        uvi: 0,
        hour_of_day: 22,
        is_monsoon_season: 0,
      },
      {
        rainfall_1h: 0,
        rainfall_6h: 0,
        rainfall_24h: 0,
        temperature_celsius: 25,
        humidity: 53,
        pressure: 1013,
        wind_deg: 12,
        wind_gust: 0,
        wind_speed: 3,
        clouds: 0,
        visibility: 10000,
        dew_point: 6,
        uvi: 0,
        hour_of_day: 23,
        is_monsoon_season: 0,
      },
    ];

    const currentWaterLevelPercent = 75;

    const prediction = await predictorDam.predict(
      weatherSequence,
      currentWaterLevelPercent
    );

    res.json({
      success: true,
      message: "Test prediction completed",
      prediction: prediction,
      inputSummary: {
        sequenceLength: weatherSequence.length,
        waterLevel: currentWaterLevelPercent,
        sampleFeatures: weatherSequence[0],
      },
      modelInfo: predictorDam.getModelInfo(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Test prediction error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      status: "error",
    });
  }
});

app.get("/api/predict-flood", async (req, res) => {
  try {
    // Example locations (you can extend this)
    const locations = [
      {
        name: "Sinhagad Road (near Ekta/Ektanagari)",
        lat: 18.45719,
        lng: 73.8194179,
        waterLevel: 13.0,
      },
      { name: "Kasba Peth", lat: 18.5196, lng: 73.8553, waterLevel: 13.0 },
      {
        name: "Ektanagari (Ekta Nagar / Mutha riverbank)",
        lat: 18.4615,
        lng: 73.824,
        waterLevel: 13.0,
      },
      {
        name: "Patil Estate (Shivaji Nagar area)",
        lat: 18.531754,
        lng: 73.854022,
        waterLevel: 13.0,
      },
      {
        name: "Bopodi (river/riverbank low-lying pockets)",
        lat: 18.5693781,
        lng: 73.8345794,
        waterLevel: 13.0,
      },
      {
        name: "Dattawadi / Parvati (low-lying riverside pockets)",
        lat: 18.512,
        lng: 73.858,
        waterLevel: 13.0,
      },
      { name: "Katraj", lat: 18.456776, lng: 73.861019, waterLevel: 13.0 },
      {
        name: "Karvenagar / Karve Nagar (near river corridors)",
        lat: 18.4899059,
        lng: 73.8199014,
        waterLevel: 13.0,
      },
      {
        name: "Khadki / Khadaki (river/old cantonment low spots)",
        lat: 18.569937,
        lng: 73.850639,
        waterLevel: 13.0,
      },
      {
        name: "Dapodi (low-lying along Mula corridor)",
        lat: 18.585367,
        lng: 73.8299257,
        waterLevel: 13.0,
      },
      {
        name: "Baner (low pockets near river channels/seasonal streams)",
        lat: 18.559658,
        lng: 73.779938,
        waterLevel: 13.0,
      },
      {
        name: "Aundh (low pockets near Mula-Pavana tributaries)",
        lat: 18.562622,
        lng: 73.808723,
        waterLevel: 13.0,
      },
      {
        name: "Pulachi Wadi / Pulachiwadi (Sinhagad Rd riverside slum pockets)",
        lat: 18.4625,
        lng: 73.823,
        waterLevel: 13.0,
      },
      {
        name: "Narayan Peth / Deccan Gymkhana (riverside roads that get closed)",
        lat: 18.519,
        lng: 73.857,
        waterLevel: 13.0,
      },
    ];

    const forecastDays = 7;
    const results = [];

    for (const location of locations) {
      // --- 1️⃣ Fetch 7-day weather forecast (rainfall) ---

      const weatherUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${location.lat}&lon=${location.lng}&appid=${apiKey}&units=metric`;

      const weatherRes = await fetch(weatherUrl);
      const weatherData = await weatherRes.json();
      // console.log(weatherData);

      // Group rainfall by day
      const dailyRain = {};
      weatherData.list.forEach((item) => {
        const date = item.dt_txt.split(" ")[0];
        const rain = item.rain ? item.rain["3h"] || 0 : 0;
        dailyRain[date] = (dailyRain[date] || 0) + rain;
      });

      const forecast = Object.entries(dailyRain)
        .slice(0, forecastDays)
        .map(([date, rain]) => ({
          date,
          rainfall: rain.toFixed(2),
        }));

      // --- 2️⃣ Use dam model to predict for each day ---
      const damPredictions = [];
      for (const day of forecast) {
        const weatherSequence = Array(predictorDam.sequenceLength).fill({
          rainfall: parseFloat(day.rainfall),
        });

        const damPrediction = await predictorDam.predict(
          weatherSequence,
          location.waterLevel //current water level in the dam should be passed
        );

        damPredictions.push({
          date: day.date,
          rainfall: day.rainfall,
          releaseProbability: damPrediction.releaseProbability,
          willRelease: damPrediction.willRelease,
          estimatedDischarge: damPrediction.estimatedDischarge,
        });
      }

      // --- 3️⃣ Combine rainfall + dam release + water level → flood risk ---
      const floodForecast = damPredictions.map((d) => {
        let risk = "Safe";

        if (d.willRelease && d.rainfall > 20) risk = "Red Alert";
        else if (d.willRelease && d.rainfall > 10) risk = "Warning";
        else if (d.rainfall > 25) risk = "Warning";
        else if (d.rainfall > 40) risk = "Red Alert";

        return {
          date: d.date,
          rainfall: d.rainfall,
          releaseProbability: d.releaseProbability,
          estimatedDischarge: d.estimatedDischarge,
          riskLevel: risk,
        };
      });

      results.push({
        location: location.name,
        coordinates: { lat: location.lat, lng: location.lng },
        floodForecast,
      });
    }

    // --- 4️⃣ Return combined flood prediction result ---
    res.json({
      success: true,
      message: "7-day flood risk forecast generated successfully.",
      data: results,
      timestamp: new Date().toISOString(),
      status: "success",
    });
  } catch (error) {
    console.error("Flood prediction error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      status: "error",
    });
  }
});

// Start server and initialize model
app.listen(PORT, async () => {
  console.log(`Backend running on http://localhost:${PORT}`);
  console.log(`Test: http://localhost:${PORT}/api/predict-flood'`);

  // Initialize model on startup
  // await initializeModel();
});
