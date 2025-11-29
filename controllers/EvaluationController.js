const DamData = require("../models/DamData");
const EvaluationSample = require("../models/EvaluationSample");
const DamReleaseLSTMPredictor = require("../DamReleaseLSTMPredictor");

const predictorDam = new DamReleaseLSTMPredictor();

/**
 * Build 24-hour rolling sequences from evaluation rows
 */
function buildSequences(evalRows, sequenceLength = 24) {
  const sequences = [];

  for (let i = sequenceLength; i < evalRows.length; i++) {
    const seq = evalRows.slice(i - sequenceLength, i);  // 24 hours before this row
    const target = evalRows[i];                         // evaluate this row

    sequences.push({
      input: seq,
      actualRelease: target.release_occurred,
      actualDischarge: target.discharge_volume,
      timestamp: target.timestamp
    });
  }

  return sequences;
}

/**
 * GET /api/evaluation/run
 * Evaluate model on the stored 20% evaluation dataset
 */
const runEvaluation = async (req, res) => {
  try {
    // 1) Load model
    await predictorDam.loadModel();

    // 2) Fetch 20% evaluation rows
    const evalRows = await EvaluationSample.find({}).sort({ timestamp: 1 });

    if (evalRows.length < 25) {
      return res.status(400).json({
        success: false,
        message: "Not enough evaluation data. Train model again.",
      });
    }

    console.log(`🧪 Evaluation samples fetched: ${evalRows.length}`);

    // 3) Convert MongoDB documents → plain objects
    const evalData = evalRows.map(row => row.toObject());

    // 4) Build sequences for evaluation
    const sequences = buildSequences(evalData, 24);

    if (sequences.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Not enough data to build 24-hour sequences.",
      });
    }

    console.log(`📊 Built evaluation sequences: ${sequences.length}`);

    // Metrics
    let correct = 0;
    let total = sequences.length;
    let squaredErrorSum = 0;

    let TP = 0, TN = 0, FP = 0, FN = 0;

    // Chart response array
    const timeline = [];

    // 5) Run model on each evaluation sequence
    for (const seq of sequences) {
      const inputWeather = seq.input.map(row => ({
        rainfall_1h: row.rainfall_1h,
        rainfall_6h: row.rainfall_6h,
        rainfall_24h: row.rainfall_24h,
        temperature_celsius: row.temperature_celsius,
        humidity: row.humidity,
        pressure: row.pressure,
        wind_deg: row.wind_deg,
        wind_gust: row.wind_gust,
        wind_speed: row.wind_speed,
        clouds: row.clouds,
        visibility: row.visibility,
        dew_point: row.dew_point,
        uvi: row.uvi,
        hour_of_day: row.hour_of_day,
        is_monsoon_season: row.is_monsoon_season,
      }));

      const predicted = await predictorDam.predict(
        inputWeather,
        seq.input[seq.input.length - 1].current_water_level_percent
      );

      const predRelease = predicted.willRelease ? 1 : 0;
      const predDischarge = predicted.estimatedDischarge;

      const actualRelease = seq.actualRelease;
      const actualDischarge = seq.actualDischarge;

      // Binary classification: accuracy
      if (predRelease === actualRelease) correct++;

      // Confusion matrix
      if (actualRelease === 1 && predRelease === 1) TP++;
      else if (actualRelease === 0 && predRelease === 0) TN++;
      else if (actualRelease === 0 && predRelease === 1) FP++;
      else if (actualRelease === 1 && predRelease === 0) FN++;

      // Regression RMSE: discharge
      squaredErrorSum += Math.pow(actualDischarge - predDischarge, 2);

      // Timeline chart data
      timeline.push({
        timestamp: seq.timestamp,
        actualRelease,
        predictedRelease: predRelease,
        actualDischarge,
        predictedDischarge: predDischarge,
        releaseProbability: predicted.releaseProbability,
      });
    }

    // Final metrics
    const accuracy = (correct / total) * 100;
    const rmse = Math.sqrt(squaredErrorSum / total);

    // 6) Response
    return res.json({
      success: true,
      message: "Model evaluated successfully.",
      metrics: {
        accuracy: Number(accuracy.toFixed(2)),
        rmse: Number(rmse.toFixed(2)),
        confusionMatrix: { TP, TN, FP, FN },
        totalSamples: total,
      },
      timeline, // for UI charts
      modelInfo: predictorDam.getModelInfo(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Evaluation error:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = { runEvaluation };
