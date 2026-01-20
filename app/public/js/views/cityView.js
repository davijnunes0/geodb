/**
 * Exibe mensagem de erro na lista de cidades
 * @param {HTMLElement} element - Elemento onde exibir o erro
 * @param {string} message - Mensagem de erro
 */
const showErrorCityList = (element, message) => {
  element.style.display = "block";
  element.className = "alert alert-danger mt-4";
  element.setAttribute("role", "alert");
  element.innerHTML = `<strong>Error:</strong> ${message}`;
};

/**
 * Limpa mensagem de erro
 * @param {HTMLElement} element - Elemento do erro
 */
const clearErrorCityList = (element) => {
  element.innerHTML = "";
  element.style.display = "none";
  element.removeAttribute("role");
};

/**
 * Exibe indicador de carregamento
 * @param {HTMLElement} element - Elemento onde exibir o loading
 */
const showLoading = (element) => {
  element.innerHTML = `
    <div class="text-center py-4">
      <div class="spinner-border text-primary" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
      <p class="mt-2 text-muted">Loading cities...</p>
    </div>
  `;
};

/**
 * Renderiza lista de cidades no DOM
 * @param {HTMLElement} element - Elemento container
 * @param {Array<Object>} cities - Array de objetos cidade
 * @param {Function} onSelectCity - Callback quando cidade é selecionada
 * @param {Function} isSelected - Função para verificar se cidade está selecionada
 * 
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Document/createElement
 */
const renderCitiesList = (element, cities, onSelectCity, isSelected) => {
  // Limpa conteúdo anterior
  element.innerHTML = "";

  // Se não houver cidades, exibe mensagem
  if (!cities || cities.length === 0) {
    element.innerHTML = `
      <div class="alert alert-info mt-4" role="alert">
        <i class="bi bi-info-circle"></i> No cities found.
      </div>
    `;
    return;
  }

  // Cria elementos para cada cidade
  cities.forEach((city) => {
    const cityItem = document.createElement("div");
    cityItem.className = "card mb-3 border";
    cityItem.setAttribute("data-city-id", city.id || "");
    
    // Destaca se já está selecionada
    if (isSelected && isSelected(city.id)) {
      cityItem.classList.add("border-success", "bg-light");
    }

    const cardBody = document.createElement("div");
    cardBody.className = "card-body";

    const cityName = document.createElement("h5");
    cityName.className = "card-title d-flex justify-content-between align-items-center";
    cityName.innerHTML = `
      <span>${city.name || "Unknown"}</span>
      ${isSelected && isSelected(city.id) 
        ? '<span class="badge bg-success"><i class="bi bi-check-circle"></i> Selected</span>' 
        : ''}
    `;

    const cityCountry = document.createElement("p");
    cityCountry.className = "card-text mb-1";
    cityCountry.innerHTML = `<i class="bi bi-flag text-primary"></i> <strong>Country:</strong> ${city.country || "N/A"}`;

    const cityRegion = document.createElement("p");
    cityRegion.className = "card-text mb-1 text-muted small";
    cityRegion.innerHTML = `<i class="bi bi-geo-alt text-secondary"></i> Region: ${city.region || "N/A"} ${city.regionCode ? `(${city.regionCode})` : ""}`;

    const cityPopulation = document.createElement("p");
    cityPopulation.className = "card-text mb-2";
    const population = city.population
      ? city.population.toLocaleString("en-US")
      : "N/A";
    cityPopulation.innerHTML = `<i class="bi bi-people text-info"></i> <strong>Population:</strong> ${population}`;

    const selectCityButton = document.createElement("button");
    selectCityButton.className = isSelected && isSelected(city.id)
      ? "btn btn-success btn-sm"
      : "btn btn-primary btn-sm";
    selectCityButton.type = "button";
    selectCityButton.innerHTML = isSelected && isSelected(city.id)
      ? '<i class="bi bi-check-circle"></i> Selected'
      : '<i class="bi bi-plus-circle"></i> Select City';
    selectCityButton.setAttribute("aria-label", `Select ${city.name}`);
    selectCityButton.disabled = isSelected && isSelected(city.id);
    
    // Adiciona evento de clique
    if (onSelectCity) {
      selectCityButton.addEventListener("click", () => {
        onSelectCity(city);
      });
    }

    // Monta estrutura DOM
    cardBody.appendChild(cityName);
    cardBody.appendChild(cityCountry);
    cardBody.appendChild(cityRegion);
    cardBody.appendChild(cityPopulation);
    cardBody.appendChild(selectCityButton);
    cityItem.appendChild(cardBody);
    element.appendChild(cityItem);
  });
};

/**
 * Renderiza lista de cidades selecionadas
 * @param {HTMLElement} element - Elemento container
 * @param {Array<Object>} selectedCities - Array de cidades selecionadas
 * @param {Function} onRemoveCity - Callback quando cidade é removida
 */
const renderSelectedCitiesList = (element, selectedCities, onRemoveCity) => {
  // Limpa conteúdo anterior
  element.innerHTML = "";

  // Se não houver cidades selecionadas, exibe mensagem
  if (!selectedCities || selectedCities.length === 0) {
    element.innerHTML = `
      <div class="text-center text-muted py-5">
        <i class="bi bi-inbox display-4 d-block mb-3"></i>
        <p class="mb-0">No cities selected yet</p>
        <small>Click "Select City" to add cities here</small>
      </div>
    `;
    return;
  }

  // Cria elementos para cada cidade selecionada
  selectedCities.forEach((city) => {
    const cityItem = document.createElement("div");
    cityItem.className = "card mb-2 border-success";
    cityItem.setAttribute("data-selected-city-id", city.id || "");

    const cardBody = document.createElement("div");
    cardBody.className = "card-body p-3";

    const headerRow = document.createElement("div");
    headerRow.className = "d-flex justify-content-between align-items-start mb-2";

    const cityName = document.createElement("h6");
    cityName.className = "card-title mb-0 fw-bold";
    cityName.textContent = city.name || "Unknown";

    const removeButton = document.createElement("button");
    removeButton.className = "btn btn-outline-danger btn-sm";
    removeButton.type = "button";
    removeButton.innerHTML = '<i class="bi bi-x-circle"></i>';
    removeButton.setAttribute("aria-label", `Remove ${city.name}`);
    removeButton.title = "Remove city";
    
    if (onRemoveCity) {
      removeButton.addEventListener("click", () => {
        onRemoveCity(city.id);
      });
    }

    headerRow.appendChild(cityName);
    headerRow.appendChild(removeButton);

    const cityInfo = document.createElement("div");
    cityInfo.className = "small text-muted";
    cityInfo.innerHTML = `
      <div><i class="bi bi-flag"></i> ${city.country || "N/A"}</div>
      <div><i class="bi bi-people"></i> ${city.population ? city.population.toLocaleString("en-US") : "N/A"}</div>
    `;

    cardBody.appendChild(headerRow);
    cardBody.appendChild(cityInfo);
    cityItem.appendChild(cardBody);
    element.appendChild(cityItem);
  });
};

/**
 * Atualiza o contador de cidades selecionadas
 * @param {HTMLElement} element - Elemento onde exibir o contador
 * @param {number} count - Número de cidades selecionadas
 */
const updateSelectedCount = (element, count) => {
  if (element) {
    element.textContent = count;
  }
};

/**
 * Atualiza número da página atual
 * @param {HTMLElement} element - Elemento onde exibir a página
 * @param {number} page - Número da página
 */
const renderCurrentPage = (element, page) => {
  element.textContent = `Page ${page}`;
  element.setAttribute("aria-label", `Current page: ${page}`);
};

export {
  clearErrorCityList,
  renderCitiesList,
  renderCurrentPage,
  showErrorCityList,
  showLoading,
  renderSelectedCitiesList,
  updateSelectedCount,
};
