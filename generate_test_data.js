// generate_test_data.js
const fs = require('fs');
const start = new Date('2025-09-01T00:00:00Z').getTime();
const hours = 40; // number of samples to generate
const arr = [];
for (let i = 0; i < hours; i++) {
  const t = new Date(start + i * 3600 * 1000).toISOString();
  // create a simple ramp + occasional heavy rain
  const baseRain = (i % 24 >= 6 && i % 24 <= 18) ? Math.random() * 0.5 : Math.random() * 0.2;
  const heavy = (i % 37 === 0) ? Math.random() * 10 + 5 : 0;
  const rainfall_1h = Number((baseRain + heavy).toFixed(2));
  const rainfall_6h = Number((Math.random() * 3).toFixed(2));
  const rainfall_24h = Number((Math.random() * 20).toFixed(2));
  const current_water_level_percent = Math.min(95, 40 + i * 0.5 + rainfall_1h * 2);
  const release_happens = (rainfall_1h > 5 || current_water_level_percent > 85) ? 1 : 0;
  const discharge_volume = release_happens ? Math.round(500 + Math.random() * 2000) : 0;
  arr.push({
    timestamp: t,
    rainfall_1h,
    rainfall_6h,
    rainfall_24h,
    temperature_celsius: 20 + Math.round(Math.random() * 10),
    humidity: 60 + Math.round(Math.random() * 30),
    pressure: 1005 + Math.round(Math.random() * 15),
    wind_speed: Math.round(Math.random() * 10),
    current_water_level_percent: Math.round(current_water_level_percent),
    hour_of_day: (new Date(t)).getUTCHours(),
    is_monsoon_season: 1,
    wind_deg: Math.round(Math.random() * 360),
    wind_gust: Math.round(Math.random() * 15),
    clouds: Math.round(Math.random() * 100),
    visibility: 5000 + Math.round(Math.random() * 5000),
    dew_point: 10 + Math.round(Math.random() * 15),
    uvi: 0,
    release_occurred: release_happens,
    discharge_volume
  });
}
fs.writeFileSync('test_data.json', JSON.stringify(arr, null, 2));
console.log('Wrote test_data.json with', arr.length, 'samples.');
