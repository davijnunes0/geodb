/**
 * Cria estado inicial da aplicação
 * @param {number} page - Página atual (padrão: 0)
 * @param {number} limit - Limite de resultados por página (padrão: 10)
 * @param {string} sort - Campo para ordenação (padrão: "name")
 * @returns {Object} Estado inicial
 */
const createState = (page = 0, limit = 10, sort = "name") => ({
  page: page,
  limit: limit,
  sort: sort,
  selectedCities: [], // Array de cidades selecionadas
});

/**
 * Atualiza a página no estado (imutável)
 * @param {Object} state - Estado atual
 * @param {number} page - Nova página
 * @returns {Object} Novo estado com página atualizada
 */
const setPage = (state, page) => ({
  ...state,
  page: Math.max(0, page),
});

/**
 * Calcula o offset baseado na página atual
 * @param {Object} state - Estado atual
 * @returns {number} Offset calculado
 */
const getOffset = (state) => Math.max(0, state.page - 1) * state.limit;

/**
 * Adiciona uma cidade à lista de selecionadas (se não existir)
 * @param {Object} state - Estado atual
 * @param {Object} city - Cidade a ser adicionada
 * @returns {Object} Novo estado com cidade adicionada
 */
const addSelectedCity = (state, city) => {
  // Verifica se a cidade já está selecionada
  const isAlreadySelected = state.selectedCities.some(
    (selected) => selected.id === city.id
  );

  if (isAlreadySelected) {
    return state; // Retorna estado sem alterações
  }

  return {
    ...state,
    selectedCities: [...state.selectedCities, city],
  };
};

/**
 * Remove uma cidade da lista de selecionadas
 * @param {Object} state - Estado atual
 * @param {number|string} cityId - ID da cidade a ser removida
 * @returns {Object} Novo estado com cidade removida
 */
const removeSelectedCity = (state, cityId) => ({
  ...state,
  selectedCities: state.selectedCities.filter(
    (city) => city.id !== cityId
  ),
});

/**
 * Limpa todas as cidades selecionadas
 * @param {Object} state - Estado atual
 * @returns {Object} Novo estado sem cidades selecionadas
 */
const clearSelectedCities = (state) => ({
  ...state,
  selectedCities: [],
});

/**
 * Verifica se uma cidade está selecionada
 * @param {Object} state - Estado atual
 * @param {number|string} cityId - ID da cidade
 * @returns {boolean} True se a cidade está selecionada
 */
const isCitySelected = (state, cityId) => {
  return state.selectedCities.some((city) => city.id === cityId);
};

export {
  createState,
  getOffset,
  setPage,
  addSelectedCity,
  removeSelectedCity,
  clearSelectedCities,
  isCitySelected,
};
