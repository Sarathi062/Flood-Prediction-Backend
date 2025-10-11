// Usage example
const DamPredictor = require('./DamReleaseLSTMPredictor');

async function main() {
    const predictor = new DamPredictor();
    
    // 1. Train model with historical data
    const trainingData = [
        // Your CSV data converted to this format
        {
            timestamp: '2025-08-19T11:00:00Z',
            rainfall_1h: 15.2,
            rainfall_6h: 45.6,
            rainfall_24h: 78.3,
            temperature: 28.5,
            humidity: 89,
            pressure: 1006,
            wind_speed: 12.3,
            current_water_level_percent: 85,
            hour_of_day: 11,
            is_monsoon_season: 1,
            release_occurred: 1,
            discharge_volume: 7561,
            hours_to_release: 0
        },
        // ... more samples
    ];
    
    await predictor.trainModel(trainingData);
    await predictor.saveModel();
    
    // 2. Make prediction with user input
    const currentWeatherSequence = [
        // Last 24 hours of weather data
        { rainfall_1h: 12, temperature: 27, humidity: 85, pressure: 1008, /* ... */ },
        // ... 23 more hours
    ];
    
    const currentWaterLevel = 78; // User input: "Dam is 78% full"
    
    const result = await predictor.predict(currentWeatherSequence, currentWaterLevel);
    
    console.log('🌊 Dam Release Prediction:');
    console.log(`Will Release: ${result.prediction.willRelease}`);
    console.log(`Probability: ${(result.prediction.releaseProbability * 100).toFixed(1)}%`);
    console.log(`Expected Discharge: ${result.prediction.estimatedDischarge.toFixed(0)} cusecs`);
    console.log(`Time Until Release: ${result.prediction.hoursUntilRelease} hours`);
    console.log(`Confidence: ${result.confidence}%`);
    
    if (result.alerts.length > 0) {
        console.log('\n🚨 Alerts:');
        result.alerts.forEach(alert => console.log(`- ${alert.level}: ${alert.message}`));
    }
}
module.exports = main;