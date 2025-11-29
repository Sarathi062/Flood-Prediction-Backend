const express = require("express");
const { runEvaluation } = require("../controllers/EvaluationController");

const router = express.Router();

router.get("/runEvaluation", runEvaluation);

module.exports = router;
