const express = require("express");
const controladorCidade = require("../controllers/controladorCidade");

const roteador = express.Router();

roteador.get("/geo/cities", controladorCidade.indice);

module.exports = roteador;
