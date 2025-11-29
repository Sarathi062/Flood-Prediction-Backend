const mongoose = require("mongoose");

const DamDataSchema = new mongoose.Schema({
  datetime: String,
  date: Date,
  hour_of_day: Number,
  is_monsoon_season: Number,
  unix_timestamp: Number,

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

  release_occurred: Number,
  discharge_volume: Number,
});

module.exports = mongoose.model("DamData", DamDataSchema);
