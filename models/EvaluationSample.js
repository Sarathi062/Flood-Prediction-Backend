const mongoose = require("mongoose");

const EvaluationSampleSchema = new mongoose.Schema({
  timestamp: String,
  hour_of_day: Number,
  is_monsoon_season: Number,
  rainfall_1h: Number,
  rainfall_6h: Number,
  rainfall_24h: Number,
  temperature_celsius: Number,
  humidity: Number,
  pressure: Number,
  wind_deg: Number,
  wind_gust: Number,
  wind_speed: Number,
  clouds: Number,
  visibility: Number,
  dew_point: Number,
  uvi: Number,
  current_water_level_percent: Number,

  // Targets
  release_occurred: Number,
  discharge_volume: Number,
});

module.exports = mongoose.model("EvaluationSample", EvaluationSampleSchema);
