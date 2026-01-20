const express = require("express");
const cityApiController = require("../controllers/cityApiController");
const validateQueryParams = require("../middleware/validateQueryParams");

const router = express.Router();

/**
 * GET /api/cities
 * Retorna lista de cidades com paginação e filtros
 * 
 * Query Parameters:
 * - limit: número de resultados (1-100, padrão: 10)
 * - offset: deslocamento para paginação (padrão: 0)
 * - sort: campo para ordenação (name, population, etc.)
 * 
 * @see https://expressjs.com/en/guide/routing.html
 */
router.get("/api/cities", validateQueryParams, cityApiController.show);

/**
 * GET /api/health
 * Endpoint de health check para monitoramento
 */
router.get("/api/health", (request, response) => {
  response.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || "development",
  });
});

module.exports = router;
