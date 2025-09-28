const express = require('express');
const cors = require('cors');
const FloodPredictor = require('./mlService');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const predictor = new FloodPredictor();

// Middleware
app.use(cors());
app.use(express.json());

// Initialize model (try to load existing, or train new)
async function initializeModel() {
    try {
        // Try to load existing model
        await predictor.loadModel();
        console.log('✅ Loaded existing model');
    } catch (error) {
        console.log('📝 No existing model found, training new model...');
        predictor.trainModel();
        
        // Save the newly trained model
        await predictor.saveModel();
    }
}

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'Backend is running!', 
        timestamp: new Date(),
        model: predictor.getModelInfo()
    });
});

// Get model information
app.get('/api/model/info', (req, res) => {
    res.json(predictor.getModelInfo());
});

// Save current model
app.post('/api/model/save', async (req, res) => {
    try {
        await predictor.saveModel();
        res.json({
            status: 'success',
            message: 'Model saved successfully',
            timestamp: new Date()
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

// Load model from files
app.post('/api/model/load', async (req, res) => {
    try {
        await predictor.loadModel();
        res.json({
            status: 'success',
            message: 'Model loaded successfully',
            modelInfo: predictor.getModelInfo(),
            timestamp: new Date()
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

// Retrain model
app.post('/api/model/retrain', async (req, res) => {
    try {
        predictor.trainModel();
        await predictor.saveModel();
        res.json({
            status: 'success',
            message: 'Model retrained and saved successfully',
            modelInfo: predictor.getModelInfo(),
            timestamp: new Date()
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

// ML Prediction endpoint (same as before)
app.post('/api/predict', (req, res) => {
    try {
        const { rainfall_sequence } = req.body;
        
        if (!rainfall_sequence || rainfall_sequence.length !== 6) {
            return res.status(400).json({
                error: 'rainfall_sequence must be array of 6 values',
                status: 'error'
            });
        }
        
        const result = predictor.predict(rainfall_sequence);
        
        res.json({
            prediction: result.waterLevel,
            confidence: result.confidence,
            riskLevel: result.riskLevel,
            input: rainfall_sequence,
            inputAverage: result.inputAverage,
            status: 'success',
            timestamp: new Date(),
            modelInfo: predictor.getModelInfo()
        });
        
    } catch (error) {
        res.status(500).json({
            error: error.message,
            status: 'error'
        });
    }
});

// Test endpoint
app.get('/api/test', (req, res) => {
    try {
        const testResult = predictor.predict([5.2, 8.1, 12.4, 15.2, 18.3, 15.2]);
        res.json({
            message: 'Test successful',
            testInput: [5.2, 8.1, 12.4, 15.2, 18.3, 15.2],
            testOutput: testResult,
            modelInfo: predictor.getModelInfo()
        });
    } catch (error) {
        res.status(500).json({
            message: 'Test failed',
            error: error.message
        });
    }
});

// Start server and initialize model
app.listen(PORT, async () => {
    console.log(`Backend running on http://localhost:${PORT}`);
    console.log(`Test: http://localhost:${PORT}/api/test`);
    
    // Initialize model on startup
    await initializeModel();
    
    console.log('\n🎯 Available endpoints:');
    console.log(`   GET  /health - Server health check`);
    console.log(`   GET  /api/test - Test prediction`);
    console.log(`   GET  /api/model/info - Model information`);
    console.log(`   POST /api/predict - Make predictions`);
    console.log(`   POST /api/model/save - Save current model`);
    console.log(`   POST /api/model/load - Load saved model`);
    console.log(`   POST /api/model/retrain - Retrain model`);
});
