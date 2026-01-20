const { axiosRequestCityData } = require("../services/cityService");

const show = async (request, response) => {
  try {
    const options = request.query;
    const data = await axiosRequestCityData(options);
    response.json(data);
  } catch (error) {
    // Preserva status code do erro da API se disponível
    const status = error.status || error.statusCode || 500;
    
    // Log detalhado do erro
    console.error(`[City API Controller Error] ${status}`, {
      path: request.path,
      query: request.query,
      errorMessage: error.message,
      errorStatus: error.status,
      apiError: error.apiError,
    });

    // Retorna erro com informações apropriadas
    response.status(status).json({ 
      error: error.message || "Internal Server Error",
      ...(error.apiError && { details: error.apiError }),
    });
  }
};

module.exports = {
  show,
};
