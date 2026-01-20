/**
 * Validador de variáveis de ambiente
 * Verifica se todas as variáveis necessárias estão configuradas
 * 
 * @see https://nodejs.org/api/process.html#process_process_env
 */
const validateEnvironment = () => {
  const requiredEnvVars = ["PORT", "RAPIDAPI_KEY"];

  const missingVars = requiredEnvVars.filter(
    (varName) => !process.env[varName]
  );

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVars.join(", ")}\n` +
        "Please check your .env file or environment configuration."
    );
  }

  // Validação específica do PORT
  const port = parseInt(process.env.PORT, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error(
      `Invalid PORT value: ${process.env.PORT}. Must be a number between 1 and 65535.`
    );
  }

  // Validação básica da API key (deve ter pelo menos alguns caracteres)
  if (process.env.RAPIDAPI_KEY.length < 10) {
    throw new Error("RAPIDAPI_KEY appears to be invalid (too short).");
  }

  console.log("Environment variables validated successfully");
};

module.exports = { validateEnvironment };
