const express = require("express");
const cityController = require("../controllers/cityController");

const router = express.Router();

router.get("/geo/cities", cityController.index);

module.exports = router;
