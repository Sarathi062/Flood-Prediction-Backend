const fetch = require("node-fetch");
const DamReleaseLSTMPredictor = require("../DamReleaseLSTMPredictor");
const FloodResult = require("../models/FloodResult");

const apiKey = process.env.OPENWEATHER_API_KEY || "";

const predictorDam = new DamReleaseLSTMPredictor();

const floodPredict = async (req, res) => {
  try {
    const locations = [
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
        lat: 18.566791,
        lng: 73.834555,
        waterLevel: 13.0,
      },
      {
        name: "Dattawadi / Parvati (low-lying riverside pockets)",
        lat: 18.512,
        lng: 73.858,
        waterLevel: 13.0,
      },
      {
        name: "Katraj",
        lat: 18.4536792,
        lng: 73.8563196,
        waterLevel: 13.0,
      },
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
