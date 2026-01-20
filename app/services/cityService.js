const axios = require("axios");
const { buildQueryString } = require("../util/queryString");

/**
 * Busca cidades da GeoDB API via RapidAPI
 * 
 * @param {Object} options - Opções de filtro e paginação
 * @param {number} options.limit - Número de resultados (padrão: 10)
 * @param {number} options.offset - Deslocamento para paginação (padrão: 0)
 * @param {string} options.sort - Campo para ordenação (padrão: "name")
 * @returns {Promise<Object>} Dados das cidades retornados pela API
 * 
 * @throws {Error} Se a requisição falhar ou a API retornar erro
 * 
 * @see https://rapidapi.com/wirefreethought/api/geodb-cities/details
 * @see https://axios-http.com/docs/intro
 */
const axiosRequestCityData = async (options = {}) => {
  // Destructuring com valores padrão
  // Limite padrão de 10 para compatibilidade com planos básicos da RapidAPI
  const {
    limit = 10,
    offset = 0,
    sort = "name",
    location,
    radius,
    distanceUnit = "MI",
    countryIds,
    excludedCountryIds,
    minPopulation,
    maxPopulation,
    namePrefix,
    timeZoneIds,
    types = "CITY",
    asciiMode = false,
    hateoasMode = true,
    languageCode,
    includeDeleted = "NONE",
  } = options;

  // Constrói query string removendo valores nulos/undefined
  const queryString = buildQueryString({
    offset,
    limit,
    sort,
    location,
    radius,
    distanceUnit,
    countryIds,
    excludedCountryIds,
    minPopulation,
    maxPopulation,
    namePrefix,
    timeZoneIds,
    types,
    asciiMode,
    hateoasMode,
    languageCode,
    includeDeleted,
  });

  const url = `https://wft-geo-db.p.rapidapi.com/v1/geo/cities?${queryString}`;

  // Verifica se a chave da API está configurada
  if (!process.env.RAPIDAPI_KEY) {
    const error = new Error("RAPIDAPI_KEY não configurada. Verifique as variáveis de ambiente.");
    error.status = 500;
    throw error;
  }

  // Headers necessários para autenticação RapidAPI
  // @see https://docs.rapidapi.com/docs/headers
  const headers = {
    "x-rapidapi-host": "wft-geo-db.p.rapidapi.com",
    "x-rapidapi-key": process.env.RAPIDAPI_KEY,
  };

  try {
    const response = await axios.get(url, { headers });
    return response.data;
  } catch (error) {
    if (error.response) {
      // A requisição foi feita e o servidor respondeu com um status de erro
      const status = error.response.status;
      const statusText = error.response.statusText;
      const errorData = error.response.data;
      
      // Log detalhado para debugging
      console.error(`[GeoDB API Error] Status: ${status}`, {
        url,
        statusText,
        errorData: errorData || 'No error data',
        headers: error.response.headers,
      });

      // Tratamento especial para erro de acesso negado (limite excedido)
      if (errorData?.code === "ACCESS_DENIED" || errorData?.type === "WftSecurityError.AccessDenied") {
        const limitError = new Error(
          `Limite de consulta excedido: ${errorData.message || 'O limite solicitado excede o permitido no seu plano'}`
        );
        limitError.status = 403;
        limitError.statusCode = 403;
        limitError.apiError = errorData;
        limitError.isLimitError = true;
        throw limitError;
      }

      // Cria erro com mais informações
      const apiError = new Error(
        `API error: ${status} ${statusText}${errorData?.message ? ` - ${errorData.message}` : ''}`
      );
      apiError.status = status;
      apiError.statusCode = status;
      apiError.apiError = errorData;
      
      throw apiError;
    } else if (error.request) {
      // A requisição foi feita mas não houve resposta
      console.error('[GeoDB API Error] No response received', {
        url,
        message: error.message,
      });
      throw new Error("Network error: Não foi possível conectar à API");
    } else {
      // Algo aconteceu na configuração da requisição
      console.error('[GeoDB API Error] Request setup error', {
        url,
        message: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }
};


module.exports = { axiosRequestCityData };
