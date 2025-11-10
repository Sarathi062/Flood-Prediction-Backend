const express = require('express');
const {
 floodPredict,
 damPredict
} = require('../controllers/PredictionController');

const router = express.Router();

router.get('/predict-flood', floodPredict);
router.post('/predict-dam', damPredict);

module.exports = router;
