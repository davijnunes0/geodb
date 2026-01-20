/**
 * Middleware de validação de query parameters
 * Valida e sanitiza os parâmetros de query antes de processar a requisição
 * 
 * @see https://expressjs.com/en/guide/using-middleware.html
 */
const validateQueryParams = (request, response, next) => {
  const { limit, offset, sort } = request.query;

  // Validação e conversão de limit
  if (limit !== undefined) {
    const limitNum = parseInt(limit, 10);
    // Limite máximo reduzido para compatibilidade com planos básicos da RapidAPI
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 10) {
      return response.status(400).json({
        error: {
          message: "Parameter 'limit' must be a number between 1 and 10 (plan limit)",
          status: 400,
        },
      });
    }
    request.query.limit = limitNum;
  }

  // Validação e conversão de offset
  if (offset !== undefined) {
    const offsetNum = parseInt(offset, 10);
    if (isNaN(offsetNum) || offsetNum < 0) {
      return response.status(400).json({
        error: {
          message: "Parameter 'offset' must be a non-negative number",
          status: 400,
        },
      });
    }
    request.query.offset = offsetNum;
  }

  // Validação de sort (campos permitidos)
  const allowedSortFields = [
    "name",
    "population",
    "elevationMeters",
    "timezone",
  ];
  if (sort !== undefined && !allowedSortFields.includes(sort)) {
    return response.status(400).json({
      error: {
        message: `Parameter 'sort' must be one of: ${allowedSortFields.join(", ")}`,
        status: 400,
      },
    });
  }

  next();
};

module.exports = validateQueryParams;
