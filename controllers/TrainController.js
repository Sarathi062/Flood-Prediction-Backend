const xlsx = require("xlsx");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const DamReleaseLSTMPredictor = require("../DamReleaseLSTMPredictor");

const predictorDam = new DamReleaseLSTMPredictor();
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

const train = async () => {
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
};

const trainFile = async() =>{
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
}
module.exports = {
  train,
  trainFile,
};
