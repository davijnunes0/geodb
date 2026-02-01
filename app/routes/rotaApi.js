const express = require("express");
const controladorApiCidade = require("../controllers/controladorApiCidade");
const validadorParametrosConsulta = require("../middleware/validadorParametrosConsulta");

const roteador = express.Router();

roteador.get("/api/cities", validadorParametrosConsulta, controladorApiCidade.mostrar);

roteador.get("/api/health", (requisicao, resposta) => {
  resposta.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || "development",
  });
});

module.exports = roteador;
