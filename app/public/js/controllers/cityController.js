import {
  createState,
  getOffset,
  setPage,
  addSelectedCity,
  removeSelectedCity,
  clearSelectedCities,
  isCitySelected,
} from "../models/cityModel.js";
import {
  clearErrorCityList,
  renderCitiesList,
  renderCurrentPage,
  showErrorCityList,
  showLoading,
  renderSelectedCitiesList,
  updateSelectedCount,
} from "../views/cityView.js";
import { collectCitiesParallel } from "../services/dataCollectionService.js";
import { kmeans } from "../services/kmeansService.js";
import { renderClusters, showClusteringProgress } from "../views/clusterView.js";

// Seleção de elementos DOM
// @see https://developer.mozilla.org/en-US/docs/Web/API/Document/getElementById
const citiesList = document.getElementById("cities-list");
const selectedCitiesList = document.getElementById("selected-cities-list");
const selectedCount = document.getElementById("selected-count");
const selectedActions = document.getElementById("selected-actions");
const clearAllButton = document.getElementById("clear-all-button");
const buttonNext = document.getElementById("button-next");
const buttonPrevious = document.getElementById("button-previous");
const errorBox = document.getElementById("error-box");
const currentPage = document.getElementById("current-page");

// Verificação de segurança: garante que elementos críticos existam
if (!citiesList || !selectedCitiesList || !selectedCount || !selectedActions || !clearAllButton) {
  console.error("Elementos DOM críticos não encontrados. Verifique se o HTML está correto.");
}

// Estado inicial da aplicação
let state = createState();

// Flag para prevenir requisições simultâneas
let isLoading = false;

// Armazena última lista de cidades renderizada para atualizar após seleção
let lastRenderedCities = [];

// Estado para processamento paralelo
let collectedCities = [];
let isCollecting = false;
let isClustering = false;

// Elementos DOM para processamento
const startCollectionButton = document.getElementById("start-collection-button");
const startClusteringButton = document.getElementById("start-clustering-button");
const kInput = document.getElementById("k-input");
const citiesInput = document.getElementById("cities-input");
const timeEstimate = document.getElementById("time-estimate");
const timeInfo = document.getElementById("time-info");
const progressSection = document.getElementById("progress-section");
const progressBar = document.getElementById("progress-bar");
const progressText = document.getElementById("progress-text");
const progressDetails = document.getElementById("progress-details");
const progressStats = document.getElementById("progress-stats");
const memoryInfo = document.getElementById("memory-info");
const memoryInfoText = document.getElementById("memory-info-text");
const clustersSection = document.getElementById("clusters-section");
const clustersContainer = document.getElementById("clusters-container");

/**
 * Calcula e atualiza estimativa de tempo de coleta
 * Baseado em: páginas × 2s por página (delay total)
 */
const updateTimeEstimate = () => {
  if (!citiesInput || !timeEstimate || !timeInfo) return;
  
  const targetCities = parseInt(citiesInput.value, 10) || 5000;
  const limitPerPage = 10;
  const delayPerPage = 2.5; // segundos (2s base + 0.5s margem) - plano BASIC: 1 req/s
  
  const totalPages = Math.ceil(targetCities / limitPerPage);
  const totalSeconds = totalPages * delayPerPage;
  const totalMinutes = Math.ceil(totalSeconds / 60);
  
  // Formata tempo de forma amigável
  let timeString = "";
  if (totalMinutes < 60) {
    timeString = `~${totalMinutes} min`;
  } else {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    timeString = minutes > 0 
      ? `~${hours}h ${minutes}min` 
      : `~${hours}h`;
  }
  
  timeEstimate.textContent = timeString;
  timeInfo.textContent = `Coleta de ${targetCities.toLocaleString("pt-BR")} cidades levará aproximadamente ${timeString}`;
};

// Atualiza estimativa quando valor muda
if (citiesInput) {
  citiesInput.addEventListener("input", updateTimeEstimate);
  citiesInput.addEventListener("change", updateTimeEstimate);
  // Atualiza inicialmente
  updateTimeEstimate();
}

// Sugestões rápidas de quantidade de cidades
document.querySelectorAll('[data-cities]').forEach(item => {
  item.addEventListener("click", (e) => {
    e.preventDefault();
    const cities = parseInt(item.getAttribute("data-cities"), 10);
    if (citiesInput && !isNaN(cities)) {
      citiesInput.value = cities;
      updateTimeEstimate();
      // Foca no input para mostrar que foi atualizado
      citiesInput.focus();
      setTimeout(() => citiesInput.blur(), 500);
    }
  });
});

/**
 * Habilita ou desabilita botões de paginação
 * @param {boolean} disabled - Se os botões devem ser desabilitados
 */
const setButtonsDisabled = (disabled) => {
  buttonNext.disabled = disabled;
  buttonPrevious.disabled = disabled;
  if (disabled) {
    buttonNext.classList.add("disabled");
    buttonPrevious.classList.add("disabled");
  } else {
    buttonNext.classList.remove("disabled");
    buttonPrevious.classList.remove("disabled");
  }
};

/**
 * Manipula a paginação (próxima/anterior)
 * @param {string} direction - Direção da paginação ("next" ou "previous")
 * @param {Object} elements - Objeto com elementos DOM necessários
 * 
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function
 */
const handlePagination = async (direction, elements) => {
  // Previne requisições simultâneas
  // Também previne paginação durante coleta paralela
  if (isLoading || isCollecting) {
    return;
  }

  try {
    isLoading = true;
    setButtonsDisabled(true);
    clearErrorCityList(elements.errorBox);
    showLoading(elements.citiesList);

    // Calcula próxima página baseado na direção
    const nextPage =
      direction === "next"
        ? state.page + 1
        : direction === "previous"
        ? state.page - 1
        : null;

    // Valida direção
    if (nextPage === null) {
      const error = new Error("Invalid pagination direction");
      error.status = 400;
      throw error;
    }

    // Garante que página não seja menor que 1
    const newPage = nextPage <= 0 ? 1 : nextPage;

    // Atualiza estado (imutável)
    state = setPage(state, newPage);

    // Prepara opções para requisição
    const options = {
      limit: state.limit,
      offset: getOffset(state),
      sort: state.sort,
    };

    // Constrói query string
    // @see https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams
    const queryString = new URLSearchParams(options).toString();

    // Faz requisição à API
    // @see https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch
    const response = await fetch(`/api/cities?${queryString}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    // Verifica se a resposta foi bem-sucedida
    if (!response.ok) {
      // Tenta obter mensagem de erro da API
      let errorMessage = response.statusText;
      try {
        const errorData = await response.json();
        errorMessage =
          errorData.error?.message || errorData.message || errorMessage;
      } catch {
        // Se não conseguir parsear JSON, usa statusText
      }

      // Reverte página em caso de erro
      const revertPage =
        direction === "next"
          ? state.page - 1
          : direction === "previous"
          ? state.page + 1
          : state.page;

      state = setPage(state, revertPage);

      const error = new Error(errorMessage);
      error.status = response.status;
      throw error;
    }

    // Processa resposta JSON
    const result = await response.json();
    
    // Extrai array de cidades do objeto de dados
    // A API retorna { data: { id1: city1, id2: city2, ... } }
    const cities = result.data ? Object.values(result.data) : [];
    lastRenderedCities = cities; // Armazena para atualização após seleção

    // Atualiza UI
    clearErrorCityList(elements.errorBox);
    renderCitiesList(
      elements.citiesList,
      cities,
      handleSelectCity,
      (cityId) => isCitySelected(state, cityId)
    );
    renderCurrentPage(elements.currentPage, state.page);
  } catch (error) {
    // Trata diferentes tipos de erro
    let errorMessage = "Failed to fetch cities";

    // Melhor tratamento de erros usando um mapeamento de status, lidando também com outros casos
    if (error instanceof TypeError && /fetch|network/i.test(error.message)) {
      errorMessage = "Network error: Unable to reach the server";
    } else if (typeof error.status === "number") {
      const statusMessages = {
        400: `Invalid request: ${error.message}`,
        401: "Unauthorized: Invalid or missing credentials",
        403: "Forbidden: You do not have permission to access this resource",
        404: "API endpoint not found",
        408: "Request timeout: The server took too long to respond",
        429: "Too many requests: Rate limit exceeded",
        500: "Server error: Please try again later",
        502: "Bad gateway: Invalid response from upstream server",
        503: "Service unavailable: The API is temporarily down",
        504: "Gateway timeout: The server took too long to respond"
      };
      errorMessage = statusMessages[error.status] || `${errorMessage}: ${error.message || "Unknown error"}`;
    } else if (error.message) {
      errorMessage = `${errorMessage}: ${error.message}`;
    } else {
      errorMessage = "An unknown error occurred while fetching cities";
    }

    showErrorCityList(elements.errorBox, errorMessage);
  } finally {
    // Sempre reabilita botões e remove flag de loading
    isLoading = false;
    setButtonsDisabled(false);
  }
};

/**
 * Manipula a seleção de uma cidade
 * @param {Object} city - Cidade a ser selecionada
 */
const handleSelectCity = (city) => {
  if (!city || !selectedCitiesList || !selectedCount || !selectedActions || !citiesList) {
    console.error("Elementos necessários não encontrados para seleção de cidade");
    return;
  }

  // Adiciona cidade ao estado
  state = addSelectedCity(state, city);

  // Atualiza lista de cidades selecionadas
  renderSelectedCitiesList(selectedCitiesList, state.selectedCities, handleRemoveCity);

  // Atualiza contador
  updateSelectedCount(selectedCount, state.selectedCities.length);

  // Mostra/esconde botão de limpar tudo
  if (state.selectedCities.length > 0) {
    selectedActions.classList.remove("d-none");
  }

  // Atualiza lista de cidades para mostrar que foi selecionada
  renderCitiesList(
    citiesList,
    lastRenderedCities,
    handleSelectCity,
    (cityId) => isCitySelected(state, cityId)
  );
};

/**
 * Manipula a remoção de uma cidade selecionada
 * @param {number|string} cityId - ID da cidade a ser removida
 */
const handleRemoveCity = (cityId) => {
  if (!selectedCitiesList || !selectedCount || !selectedActions || !citiesList) {
    console.error("Elementos necessários não encontrados para remoção de cidade");
    return;
  }

  // Remove cidade do estado
  state = removeSelectedCity(state, cityId);

  // Atualiza lista de cidades selecionadas
  renderSelectedCitiesList(selectedCitiesList, state.selectedCities, handleRemoveCity);

  // Atualiza contador
  updateSelectedCount(selectedCount, state.selectedCities.length);

  // Esconde botão de limpar tudo se não houver cidades
  if (state.selectedCities.length === 0) {
    selectedActions.classList.add("d-none");
  }

  // Atualiza lista de cidades para remover destaque
  renderCitiesList(
    citiesList,
    lastRenderedCities,
    handleSelectCity,
    (cityId) => isCitySelected(state, cityId)
  );
};

/**
 * Limpa todas as cidades selecionadas
 */
const handleClearAll = () => {
  if (confirm("Are you sure you want to clear all selected cities?")) {
    state = clearSelectedCities(state);

    // Atualiza lista de cidades selecionadas
    renderSelectedCitiesList(selectedCitiesList, state.selectedCities, handleRemoveCity);

    // Atualiza contador
    updateSelectedCount(selectedCount, state.selectedCities.length);

    // Esconde botão de limpar tudo
    selectedActions.classList.add("d-none");

    // Atualiza lista de cidades para remover destaques
    renderCitiesList(
      citiesList,
      lastRenderedCities,
      handleSelectCity,
      (cityId) => isCitySelected(state, cityId)
    );
  }
};

// Event Listeners para botões de paginação
// @see https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener
buttonNext.addEventListener("click", async () => {
  await handlePagination("next", { citiesList, errorBox, currentPage });
});

buttonPrevious.addEventListener("click", async () => {
  await handlePagination("previous", { citiesList, errorBox, currentPage });
});

// Event Listener para botão de limpar tudo
if (clearAllButton) {
  clearAllButton.addEventListener("click", handleClearAll);
}

/**
 * Manipula início da coleta paralela de dados
 */
const handleStartCollection = async () => {
  if (isCollecting) return;

  try {
    // Marca tempo de início
    const startTime = Date.now();
    
    isCollecting = true;
    startCollectionButton.disabled = true;
    startCollectionButton.innerHTML = '<i class="bi bi-hourglass-split"></i> Coletando...';
    
    // Desabilita paginação durante coleta para evitar rate limiting
    setButtonsDisabled(true);
    buttonNext.disabled = true;
    buttonPrevious.disabled = true;
    
    progressSection.classList.remove("d-none");
    clustersSection.classList.add("d-none");

    // Verifica e mostra status de memória compartilhada
    const useSharedMemory = typeof SharedArrayBuffer !== 'undefined';
    if (useSharedMemory) {
      memoryInfo.classList.remove("d-none");
      memoryInfoText.textContent = "Usando memória compartilhada (SharedArrayBuffer) com sincronização Atomics";
    } else {
      memoryInfo.classList.add("d-none");
    }

    // Atualiza progresso inicial
    progressBar.style.width = "0%";
    progressText.textContent = "0%";
    progressDetails.textContent = useSharedMemory 
      ? "Iniciando coleta paralela com memória compartilhada..." 
      : "Iniciando coleta paralela (modo fallback)...";
    progressStats.textContent = "";

    // Obtém número de cidades do input (padrão: 5000)
    const targetCities = parseInt(citiesInput?.value || 5000, 10);
    
    // Valida entrada
    if (isNaN(targetCities) || targetCities < 100) {
      alert("Por favor, insira um número válido de cidades (mínimo 100)");
      return;
    }
    
    if (targetCities > 50000) {
      alert("Número muito alto. Máximo recomendado: 50.000 cidades");
      return;
    }
    
    // Inicia coleta paralela (limite de 10 por página para compatibilidade com planos básicos)
    collectedCities = await collectCitiesParallel(targetCities, 10, (progress, stats) => {
      progressBar.style.width = `${progress}%`;
      progressText.textContent = `${progress}%`;
      
      if (stats.rateLimit) {
        progressDetails.textContent = `Rate limit atingido. Aguardando ${stats.waitTime}s antes de continuar...`;
        progressBar.classList.remove("bg-warning");
        progressBar.classList.add("bg-danger");
      } else {
        progressDetails.textContent = `Coletando dados... ${stats.citiesCollected || 0} cidades`;
        progressBar.classList.remove("bg-danger");
        progressBar.classList.add("bg-warning");
      }
      
      const memoryStatus = typeof SharedArrayBuffer !== 'undefined' ? ' | Memória Compartilhada: Ativa' : ' | Modo: Fallback';
      progressStats.textContent = `Workers: ${stats.workers} | Página atual: ${stats.currentPage || 0}/${stats.totalPages || 0}${memoryStatus}`;
    });

    // Calcula tempo decorrido
    const endTime = Date.now();
    const elapsedSeconds = Math.round((endTime - startTime) / 1000);
    const elapsedMinutes = Math.floor(elapsedSeconds / 60);
    const remainingSeconds = elapsedSeconds % 60;
    const timeString = elapsedMinutes > 0 
      ? `${elapsedMinutes}min ${remainingSeconds}s`
      : `${elapsedSeconds}s`;

    // Finaliza progresso
    progressBar.style.width = "100%";
    progressText.textContent = "100%";
    progressDetails.textContent = "Coleta concluída! Iniciando agrupamento K-Means...";
    progressStats.textContent = `Total coletado: ${collectedCities.length} cidades válidas | Tempo: ${timeString}`;

    // REQUISITO: Após finalizar o processo de preenchimento da memória compartilhada,
    // inicia-se o processo de agrupamento automaticamente
    // Não espera clique do usuário, inicia imediatamente após coleta
    console.log(`Coleta concluída! ${collectedCities.length} cidades coletadas em ${timeString}. Iniciando K-Means automaticamente...`);
    
    // Inicia K-Means automaticamente após coleta
    // Usa um pequeno delay para garantir que a UI seja atualizada
    setTimeout(() => {
      handleStartClustering();
    }, 500);
  } catch (error) {
    console.error("Erro na coleta:", error);
    
    // Mensagem de erro mais informativa
    let errorMessage = error.message;
    if (error.message.includes("limite") || error.message.includes("limit") || error.message.includes("ACCESS_DENIED")) {
      errorMessage = "Limite de consulta excedido. O plano da API permite no máximo 10 resultados por página. A coleta continuará com esse limite.";
    } else if (error.message.includes("429") || error.message.includes("rate limit") || error.message.includes("Too Many Requests")) {
      errorMessage = "Rate limit excedido. O plano BASIC da RapidAPI tem limite muito baixo de requisições por segundo. A coleta está configurada para usar apenas 1 worker com 1 requisição por segundo. Aguarde alguns minutos e tente novamente.";
    }
    
    alert(`Erro na coleta de dados: ${errorMessage}`);
    progressDetails.textContent = `Erro: ${errorMessage}`;
    progressBar.classList.remove("progress-bar-animated");
    progressBar.classList.add("bg-danger");
  } finally {
    isCollecting = false;
    startCollectionButton.disabled = false;
    startCollectionButton.innerHTML = '<i class="bi bi-download"></i> Iniciar Coleta (~10k cidades)';
    
    // Reabilita paginação após coleta
    setButtonsDisabled(false);
    buttonNext.disabled = false;
    buttonPrevious.disabled = false;
  }
};

/**
 * Manipula execução do K-Means
 */
const handleStartClustering = async () => {
  if (isClustering || collectedCities.length === 0) return;

  const k = parseInt(kInput.value, 10);
  if (isNaN(k) || k < 2 || k > 50) {
    alert("Por favor, insira um valor válido para k (entre 2 e 50)");
    return;
  }

  if (collectedCities.length < k) {
    alert(`Número de cidades (${collectedCities.length}) deve ser maior ou igual a k (${k})`);
    return;
  }

  try {
    isClustering = true;
    startClusteringButton.disabled = true;
    startClusteringButton.innerHTML = '<i class="bi bi-hourglass-split"></i> Processando...';
    clustersSection.classList.remove("d-none");
    showClusteringProgress(clustersContainer, 0, 100);

    // Prepara pontos para o k-means (latitude, longitude, população)
    const points = collectedCities.map((city) => ({
      latitude: city.latitude,
      longitude: city.longitude,
      population: city.population || 0,
      // Mantém referência à cidade original (com todos os dados)
      city: {
        ...city,
        // Garante que campos essenciais existam
        name: city.name || city.cityName || `Cidade ${city.id || 'Unknown'}`,
        country: city.country || city.countryCode || city.countryName || 'N/A',
      },
    }));
    
    // Debug: verifica formato dos dados (apenas primeira cidade)
    if (points.length > 0) {
      console.log("Exemplo de ponto preparado:", {
        latitude: points[0].latitude,
        longitude: points[0].longitude,
        population: points[0].population,
        cityName: points[0].city?.name,
        cityCountry: points[0].city?.country,
        fullCity: points[0].city,
      });
    }

    // Executa K-Means
    const result = await kmeans(points, k, 100, (iteration, clusters, centroids, converged) => {
      showClusteringProgress(clustersContainer, iteration, 100);
    });

    // Renderiza resultados
    renderClusters(clustersContainer, result.clusters, points, result.centroids);

    // Mostra informações finais
    const infoDiv = document.createElement("div");
    infoDiv.className = "alert alert-success mt-3";
    infoDiv.innerHTML = `
      <strong><i class="bi bi-check-circle"></i> Clustering concluído!</strong><br>
      Iterações: ${result.iterations} | 
      Convergência: ${result.converged ? "Sim" : "Não (máximo atingido)"} |
      Total de pontos: ${points.length}
    `;
    clustersContainer.insertBefore(infoDiv, clustersContainer.firstChild);
  } catch (error) {
    console.error("Erro no clustering:", error);
    clustersContainer.innerHTML = `
      <div class="alert alert-danger">
        <strong>Erro no clustering:</strong> ${error.message}
      </div>
    `;
  } finally {
    isClustering = false;
    startClusteringButton.disabled = false;
    startClusteringButton.innerHTML = '<i class="bi bi-diagram-3"></i> Executar K-Means';
  }
};

// Event Listeners para processamento
if (startCollectionButton) {
  startCollectionButton.addEventListener("click", handleStartCollection);
}

if (startClusteringButton) {
  startClusteringButton.addEventListener("click", handleStartClustering);
}

// Carrega primeira página ao inicializar
// Aguarda DOM estar completamente carregado
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    handlePagination("next", { citiesList, errorBox, currentPage });
  });
} else {
  handlePagination("next", { citiesList, errorBox, currentPage });
}
