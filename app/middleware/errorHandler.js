/**
 * Middleware de tratamento de erros global
 * Captura todos os erros não tratados e retorna resposta JSON padronizada
 * 
 * @see https://expressjs.com/en/guide/error-handling.html
 */
const errorHandler = (error, request, response, next) => {
  // Se a resposta já foi enviada, delega para o handler padrão do Express
  if (response.headersSent) {
    return next(error);
  }

  // Status code padrão é 500 (Internal Server Error)
  const status = error.status || error.statusCode || 500;
  
  // Mensagem de erro
  const message = error.message || "Internal Server Error";
  
  // Log do erro no servidor (em produção, usar logger apropriado)
  console.error(`[ERROR] ${status} - ${message}`, {
    path: request.path,
    method: request.method,
    query: request.query,
    error: process.env.NODE_ENV === "development" ? error.stack : undefined,
  });

  // Resposta JSON padronizada
  response.status(status).json({
    error: {
      message,
      status,
      ...(process.env.NODE_ENV === "development" && { stack: error.stack }),
    },
  });
};

module.exports = errorHandler;
