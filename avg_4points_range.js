const fetch = require("node-fetch");
const XLSX = require("xlsx");

// --- Configuration ---
const API_KEY = "a09e97cd1b12f89bcb8fad12d0a16cd3";

const locations = [
  { name: "Khadakwasla", lat: 18.430257, lon: 73.760422 },
  { name: "Varasgaon", lat: 18.391968, lon: 73.588515 },
  { name: "Panset", lat: 18.354437, lon: 73.572372 },
  { name: "Temghar", lat: 18.452709, lon: 18.452709 }
];

// --- Utilities ---
function toUnixTimestamp(date) {
  return Math.floor(date.getTime() / 1000);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isMonsoonSeason(date) {
  const month = date.getMonth() + 1; // 1-12
  return month >= 6 && month <= 9 ? 1 : 0; // June to September
}

// --- Data Fetching ---
async function getHourlyDataForLocation(location, startDate, endDate) {
  console.log(`\n🌦️  Fetching data for ${location.name}...`);

  let hourlyData = [];
  let currentDate = new Date(startDate);
  let requestCount = 0;

  while (currentDate <= endDate) {
    const dt = toUnixTimestamp(currentDate);
    const url = `https://api.openweathermap.org/data/3.0/onecall/timemachine?lat=${location.lat}&lon=${location.lon}&dt=${dt}&appid=${API_KEY}`;

    try {
      const response = await fetch(url);
      requestCount++;

      if (!response.ok) {
        console.error(
          `❌ Failed to fetch data for ${
            location.name
          } at ${currentDate.toISOString()}: ${response.status}`
        );
      } else {
        const data = await response.json();

        if (data.data && data.data.length > 0) {
          data.data.forEach((item) => {
            const itemDate = new Date(item.dt * 1000);
            hourlyData.push({
              location_name: location.name,
              datetime: itemDate.toISOString(),
              date: itemDate.toDateString(),
              hour_of_day: itemDate.getHours(),
              is_monsoon_season: isMonsoonSeason(itemDate),
              rainfall_1h:
                item.rain && item.rain["1h"]
                  ? parseFloat(item.rain["1h"]).toFixed(2)
                  : "0.00",
              temperature_celsius: (item.temp - 273.15).toFixed(2),
              humidity: item.humidity,
              pressure: item.pressure,
              wind_speed: item.wind_speed,
              wind_deg: item.wind_deg, // <-- Add wind direction here
              wind_gust: item.wind_gust ? item.wind_gust.toFixed(2) : "0.00", // <-- Add wind gust, default 0
              clouds: item.clouds,
              visibility: item.visibility || 10000,
              dew_point: (item.dew_point - 273.15).toFixed(2),
              uvi: item.uvi || 0,
              weather_main:
                item.weather && item.weather.length > 0
                  ? item.weather[0].main
                  : "N/A", // <-- Add weather main
              weather_description:
                item.weather && item.weather.length > 0
                  ? item.weather[0].description
                  : "N/A", // <-- Add weather desc
              unix_timestamp: item.dt,
            });
          });
        }
      }

      await delay(1000);
      if (requestCount % 10 === 0) {
        console.log(
          `   📊 Processed ${requestCount} requests for ${location.name}...`
        );
      }
    } catch (error) {
      console.error(
        `❌ Error fetching data for ${location.name}: ${error.message}`
      );
    }

    currentDate.setHours(currentDate.getHours() + 1);
  }

  console.log(
    `✅ Fetched ${hourlyData.length} hourly records for ${location.name}`
  );
  return hourlyData;
}

// --- Cross-Location Averaging ---
function averageHourlyDataAcrossLocations(allLocationData) {
  console.log("\n📊 Averaging hourly data across all locations...");

  const allRecords = [].concat(...Object.values(allLocationData));
  const groupedByHour = {};

  // Group by datetime (hour)
  allRecords.forEach((record) => {
    if (!groupedByHour[record.datetime]) {
      groupedByHour[record.datetime] = [];
    }
    groupedByHour[record.datetime].push(record);
  });

  const numericFeatures = [
    "rainfall_1h",
    "temperature_celsius",
    "humidity",
    "pressure",
    "wind_deg", 
    "wind_gust",
    "wind_speed",
    "clouds",
    "visibility",
    "dew_point",
    "uvi",
  ];

  const averagedHourlyData = Object.entries(groupedByHour).map(
    ([datetime, records]) => {
      const avgRecord = {
        datetime,
        date: records[0].date,
        hour_of_day: records[0].hour_of_day,
        is_monsoon_season: records[0].is_monsoon_season,
        unix_timestamp: records[0].unix_timestamp,
      };

      numericFeatures.forEach((feature) => {
        const values = records.map((r) => parseFloat(r[feature]) || 0);
        avgRecord[feature] = (
          values.reduce((sum, v) => sum + v, 0) / values.length
        ).toFixed(2);
      });

      return avgRecord;
    }
  );

  // Sort by timestamp
  averagedHourlyData.sort((a, b) => a.unix_timestamp - b.unix_timestamp);

  console.log(
    `✅ Created ${averagedHourlyData.length} averaged hourly records`
  );
  return averagedHourlyData;
}

// --- Rainfall Accumulation ---
function calculateRainfallAccumulation(hourlyData) {
  console.log("\n🌧️  Calculating rainfall accumulation (6h, 24h)...");

  const enhancedData = hourlyData.map((record, index) => {
    // Calculate rainfall_6h (sum of last 6 hours including current)
    let rainfall_6h = 0;
    for (let i = Math.max(0, index - 5); i <= index; i++) {
      rainfall_6h += parseFloat(hourlyData[i].rainfall_1h) || 0;
    }

    // Calculate rainfall_24h (sum of last 24 hours including current)
    let rainfall_24h = 0;
    for (let i = Math.max(0, index - 23); i <= index; i++) {
      rainfall_24h += parseFloat(hourlyData[i].rainfall_1h) || 0;
    }

    return {
      ...record,
      rainfall_6h: rainfall_6h.toFixed(2),
      rainfall_24h: rainfall_24h.toFixed(2),
    };
  });

  console.log("✅ Added rainfall_6h and rainfall_24h to all records");
  return enhancedData;
}

// --- Daily Aggregation ---
function aggregateToDaily(hourlyData) {
  console.log("\n📅 Aggregating hourly data to daily averages...");

  const groupedByDay = {};
  hourlyData.forEach((record) => {
    if (!groupedByDay[record.date]) {
      groupedByDay[record.date] = [];
    }
    groupedByDay[record.date].push(record);
  });

  const numericFeatures = [
    "rainfall_1h",
    "rainfall_6h",
    "rainfall_24h",
    "temperature_celsius",
    "humidity",
    "pressure",
    "wind_deg", 
    "wind_gust",
    "wind_speed",
    "clouds",
    "visibility",
    "dew_point",
    "uvi",
  ];

  const dailyData = Object.entries(groupedByDay).map(([date, records]) => {
    const dailyRecord = {
      date,
      is_monsoon_season: records[0].is_monsoon_season,
    };

    numericFeatures.forEach((feature) => {
      const values = records.map((r) => parseFloat(r[feature]) || 0);
      if (feature.includes("rainfall")) {
        // For rainfall, take the maximum value of the day (peak accumulation)
        dailyRecord[feature] = Math.max(...values).toFixed(2);
      } else {
        // For other features, take daily average
        dailyRecord[feature] = (
          values.reduce((sum, v) => sum + v, 0) / values.length
        ).toFixed(2);
      }
    });

    // Add placeholders for manual target columns
    dailyRecord.current_water_level_percent = ""; // To be filled manually
    dailyRecord.release_occurred = ""; // To be filled manually
    dailyRecord.discharge_volume = ""; // To be filled manually

    return dailyRecord;
  });

  // Sort by date
  dailyData.sort((a, b) => new Date(a.date) - new Date(b.date));

  console.log(
    `✅ Created ${dailyData.length} daily records with target placeholders`
  );
  return dailyData;
}

// --- Excel Export ---
function saveToExcel(hourlyData, dailyData, filename) {
  console.log("\n📁 Saving data to Excel...");

  const workbook = XLSX.utils.book_new();

  // Hourly data sheet
  const hourlyWorksheet = XLSX.utils.json_to_sheet(hourlyData);
  XLSX.utils.book_append_sheet(workbook, hourlyWorksheet, "Hourly_Data");

  // Daily data sheet (for model training)
  const dailyWorksheet = XLSX.utils.json_to_sheet(dailyData);
  XLSX.utils.book_append_sheet(workbook, dailyWorksheet, "Daily_Training_Data");

  XLSX.writeFile(workbook, filename);
  console.log(`✅ Excel file saved as: ${filename}`);
  console.log(`📈 Hourly records: ${hourlyData.length}`);
  console.log(`📈 Daily records: ${dailyData.length}`);
}

// --- Main Function ---
async function main() {
  console.log(
    "🚀 Starting weather data collection for dam discharge prediction..."
  );

  // Define date range
  const startDate = new Date("2025-06-23T00:00:00+05:30");
  const endDate = new Date("2025-06-25T23:00:00+05:30");

  console.log(
    `📅 Date range: ${startDate.toDateString()} to ${endDate.toDateString()}`
  );
  console.log(`📍 Locations: ${locations.map((loc) => loc.name).join(", ")}`);

  const allLocationData = {};

  // Step 1: Fetch hourly data for each location
  for (const location of locations) {
    try {
      const locationData = await getHourlyDataForLocation(
        location,
        startDate,
        endDate
      );
      allLocationData[location.name] = locationData;
      await delay(2000);
    } catch (error) {
      console.error(`❌ Error processing ${location.name}: ${error.message}`);
      allLocationData[location.name] = [];
    }
  }

  // Step 2: Average hourly data across all locations
  const averagedHourlyData = averageHourlyDataAcrossLocations(allLocationData);

  // Step 3: Calculate rainfall accumulation (6h, 24h)
  const hourlyWithRainfall = calculateRainfallAccumulation(averagedHourlyData);

  // Step 4: Aggregate to daily averages for model training
  const dailyData = aggregateToDaily(hourlyWithRainfall);

  // Step 5: Save to Excel
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .split("T")[0];
  const filename = `dam_prediction_data_${timestamp}.xlsx`;
  saveToExcel(hourlyWithRainfall, dailyData, filename);

  // Display summary
  console.log("\n📊 Final Summary:");
  console.log(
    `   🕐 Hourly records (with rainfall accumulation): ${hourlyWithRainfall.length}`
  );
  console.log(
    `   📅 Daily records (ready for model training): ${dailyData.length}`
  );
  console.log(
    `   📋 Target columns to fill manually: current_water_level_percent, release_occurred, discharge_volume`
  );
  console.log("\n✨ Data collection completed successfully!");

  return { hourlyData: hourlyWithRainfall, dailyData };
}

// Run the script
main().catch((error) => {
  console.error("❌ Script failed:", error);
});
