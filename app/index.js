require("dotenv").config();
const express = require("express");
const path = require("node:path");
const webRouter = require("./routes/web");
const apiRouter = require("./routes/api");
const errorHandler = require("./middleware/errorHandler");
const { validateEnvironment } = require("./util/envValidator");

// Valida variáveis de ambiente antes de iniciar o servidor
try {
  validateEnvironment();
} catch (error) {
  console.error("Environment validation failed:", error.message);
  process.exit(1);
}

const app = express();

// Configuração do template engine EJS
// @see https://expressjs.com/en/5x/api.html#app.set
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Middleware para parsing de dados de formulários (URL-encoded)
// @see https://expressjs.com/en/5x/api.html#express.urlencoded
app.use(express.urlencoded({ extended: true }));

// Headers necessários para SharedArrayBuffer
// SharedArrayBuffer requer Cross-Origin-Opener-Policy e Cross-Origin-Embedder-Policy
// @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer#security_requirements
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  next();
});

// Middleware para servir arquivos estáticos da pasta 'public'
// @see https://expressjs.com/en/starter/static-files.html
// Usa path.join para garantir caminho correto no Docker
app.use(express.static(path.join(__dirname, "public"), {
  // Garante que arquivos .js sejam servidos com MIME type correto para módulos ES6
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      // Desabilita cache para arquivos JS durante desenvolvimento
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

// Registro das rotas
app.use(webRouter); // Rotas web (renderização de páginas)
app.use(apiRouter); // Rotas API (JSON)

// Middleware de tratamento de erros (deve ser o último)
// @see https://expressjs.com/en/guide/error-handling.html
app.use(errorHandler);

const port = process.env.PORT || 3000;

// Inicia o servidor
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`Access: http://localhost:${port}`);
});
