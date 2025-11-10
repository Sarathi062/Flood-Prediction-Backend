const express = require("express");
const { testPredict } = require("../controllers/TestController");

const router = express.Router();

router.get("/test-predict", testPredict);

module.exports = router;
