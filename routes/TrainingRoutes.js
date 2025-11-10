const express = require('express');
const {
 trainFile,
 train
} = require('../controllers/TrainController');

const router = express.Router();

router.get('/train-file', trainFile);
router.post('/train', train);

module.exports = router;
