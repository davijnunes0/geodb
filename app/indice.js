const caminho = require("node:path");
require("dotenv").config({ path: caminho.join(__dirname, "..", ".env") });
require("dotenv").config();
const express = require("express");
const rotaWeb = require("./routes/rotaWeb");
const rotaApi = require("./routes/rotaApi");
const tratadorErros = require("./middleware/tratadorErros");
const { validarAmbiente } = require("./util/validadorAmbiente");

try {
  validarAmbiente();
} catch (erro) {
  console.error("Environment validation failed:", erro.message);
  process.exit(1);
}

const aplicacao = express();

aplicacao.set("view engine", "ejs");
aplicacao.set("views", caminho.join(__dirname, "views"));

aplicacao.use(express.urlencoded({ extended: true }));

aplicacao.use((requisicao, resposta, proximo) => {
  resposta.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  resposta.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  proximo();
});

aplicacao.use(express.static(caminho.join(__dirname, "public"), {
  setHeaders: (resposta, caminhoArquivo) => {
    if (caminhoArquivo.endsWith('.js')) {
      resposta.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      resposta.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      resposta.setHeader('Pragma', 'no-cache');
      resposta.setHeader('Expires', '0');
    }
  }
}));

aplicacao.use(rotaWeb);
aplicacao.use(rotaApi);
aplicacao.use(tratadorErros);

const porta = process.env.PORT || 3000;

aplicacao.listen(porta, () => {
  console.log(`Server is running on port ${porta}`);
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`Access: http://localhost:${porta}`);
});
