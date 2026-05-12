const fetch = require("node-fetch");
const DamReleaseLSTMPredictor = require("../DamReleaseLSTMPredictor");
const FloodResult = require("../models/FloodResult");

const apiKey = process.env.OPENWEATHER_API_KEY || "";

const predictorDam = new DamReleaseLSTMPredictor();

const floodPredict = async (req, res) => {
  try {
    const locations = [
      {
        name: "Rajaram Barrage (Panchganga River)",
        lat: 16.703,
        lng: 74.243,
        waterLevel: 13.0,
      },
      {
        name: "Kasba Bawda (Low lying Panchganga basin)",
        lat: 16.718,
        lng: 74.23,
        waterLevel: 13.0,
      },
      {
        name: "Shiye Village (Near NH48 floodplain)",
        lat: 16.688,
        lng: 74.27,
        waterLevel: 13.0,
      },
      {
        name: "Pattan Kodoli (Flood affected agricultural belt)",
        lat: 16.735,
        lng: 74.36,
        waterLevel: 13.0,
      },

      {
        name: "Shirol Taluka (Krishna–Panchganga confluence area)",
        lat: 16.736,
        lng: 74.6,
        waterLevel: 13.0,
      },
      {
        name: "Sinhagad Road (near Ekta/Ektanagari)",
        lat: 18.4662501,
        lng: 73.8172121,
        waterLevel: 13.0,
      },
      {
        name: "Kasba Peth",
        lat: 18.5196,
        lng: 73.8553,
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
        lat: 18.566791,
        lng: 73.834555,
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
          location.waterLevel, //current water level in the dam should be passed
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

    const responseData = {
      success: true,
      message: "7-day flood risk forecast generated successfully.",
      data: results,
      timestamp: new Date().toISOString(),
      status: "success",
    };

    await FloodResult.create(responseData);

    // --- 4️⃣ Return combined flood prediction result ---
    // res.json(responseData);
  } catch (error) {
    console.error("Flood prediction error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      status: "error",
    });
  }
};

module.exports = floodPredict;


























// ////////////////////////////////
// const fetch = require("node-fetch");
// const DamReleaseLSTMPredictor = require("../DamReleaseLSTMPredictor");
// const FloodResult = require("../models/FloodResult");

// const predictorDam = new DamReleaseLSTMPredictor();

// // 🔴 CHANGE THIS DATE WHEN TESTING
// const startDate = "2019-08-05"; // Example: Kolhapur flood date

// const floodPredict = async (req = null, res = null) => {
//   try {
//     const baseDate = new Date(startDate);

//     const locations = [
//       {
//         name: "Rajaram Barrage (Panchganga River)",
//         lat: 16.703,
//         lng: 74.243,
//         waterLevel: 13.0,
//       },
//       {
//         name: "Kasba Bawda",
//         lat: 16.718,
//         lng: 74.23,
//         waterLevel: 13.0,
//       },
//       {
//         name: "Shiye Village",
//         lat: 16.688,
//         lng: 74.27,
//         waterLevel: 13.0,
//       },
//       {
//         name: "Pattan Kodoli",
//         lat: 16.735,
//         lng: 74.36,
//         waterLevel: 13.0,
//       },
//       {
//         name: "Shirol Taluka",
//         lat: 16.736,
//         lng: 74.6,
//         waterLevel: 13.0,
//       },
//       {
//         name: "Sinhagad Road",
//         lat: 18.4662501,
//         lng: 73.8172121,
//         waterLevel: 13.0,
//       },
//       {
//         name: "Kasba Peth",
//         lat: 18.5196,
//         lng: 73.8553,
//         waterLevel: 13.0,
//       },
//       {
//         name: "Patil Estate",
//         lat: 18.531754,
//         lng: 73.854022,
//         waterLevel: 13.0,
//       },
//       {
//         name: "Bopodi",
//         lat: 18.566791,
//         lng: 73.834555,
//         waterLevel: 13.0,
//       },
//       {
//         name: "Khadki",
//         lat: 18.569937,
//         lng: 73.850639,
//         waterLevel: 13.0,
//       },
//       {
//         name: "Dapodi",
//         lat: 18.585367,
//         lng: 73.8299257,
//         waterLevel: 13.0,
//       },
//       {
//         name: "Aundh",
//         lat: 18.562622,
//         lng: 73.808723,
//         waterLevel: 13.0,
//       },
//       {
//         name: "Pulachiwadi",
//         lat: 18.4625,
//         lng: 73.823,
//         waterLevel: 13.0,
//       },
//     ];

//     const forecastDays = 5;
//     const results = [];

//     for (const location of locations) {

//       const endDate = new Date(baseDate);
//       endDate.setDate(baseDate.getDate() + forecastDays - 1);

//       const endDateStr = endDate.toISOString().split("T")[0];

//       const weatherUrl =
//         `https://archive-api.open-meteo.com/v1/archive?latitude=${location.lat}&longitude=${location.lng}&start_date=${startDate}&end_date=${endDateStr}&daily=precipitation_sum&timezone=auto`;

//       console.log("Fetching rainfall:", weatherUrl);

//       const weatherRes = await fetch(weatherUrl);
//       const weatherData = await weatherRes.json();

//       const dates = weatherData.daily.time;
//       const rainfalls = weatherData.daily.precipitation_sum;

//       const damPredictions = [];

//       for (let i = 0; i < dates.length; i++) {

//         const rainfall = rainfalls[i] || 0;

//         const weatherSequence = Array(predictorDam.sequenceLength).fill({
//           rainfall: rainfall,
//         });

//         const damPrediction = await predictorDam.predict(
//           weatherSequence,
//           location.waterLevel
//         );

//         damPredictions.push({
//           date: dates[i],
//           rainfall: rainfall.toFixed(2),
//           releaseProbability: damPrediction.releaseProbability,
//           willRelease: damPrediction.willRelease,
//           estimatedDischarge: damPrediction.estimatedDischarge,
//         });

//       }

//       const floodForecast = damPredictions.map((d) => {

//         let risk = "Safe";

//         if (d.willRelease && d.rainfall > 20) risk = "Red Alert";
//         else if (d.willRelease && d.rainfall > 10) risk = "Warning";
//         else if (d.rainfall > 40) risk = "Red Alert";
//         else if (d.rainfall > 25) risk = "Warning";

//         return {
//           date: d.date,
//           rainfall: d.rainfall,
//           releaseProbability: d.releaseProbability,
//           estimatedDischarge: d.estimatedDischarge,
//           riskLevel: risk,
//         };

//       });

//       results.push({
//         location: location.name,
//         coordinates: {
//           lat: location.lat,
//           lng: location.lng,
//         },
//         floodForecast,
//       });

//     }

//     const responseData = {
//       success: true,
//       message: "old flood",
//       data: results,
//       timestamp: new Date().toISOString(),
//       status: "success",
//     };

//     await FloodResult.create(responseData);

//     console.log("✅ Flood prediction stored in DB");

//     if (res) return res.json(responseData);

//     return responseData;

//   } catch (error) {

//     console.error("Flood prediction error:", error);

//     if (res) {
//       return res.status(500).json({
//         success: false,
//         error: error.message,
//         status: "error",
//       });
//     }
//   }
// };

// module.exports = floodPredict;