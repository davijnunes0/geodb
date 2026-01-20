/**
 * View para renderização dos clusters resultantes do K-Means
 */

/**
 * Renderiza os clusters na interface
 * @param {HTMLElement} container - Container onde renderizar
 * @param {Array} clusters - Array de clusters (cada cluster é array de índices)
 * @param {Array} points - Array de pontos (cidades)
 * @param {Array} centroids - Array de centroides
 */
export const renderClusters = (container, clusters, points, centroids) => {
  container.innerHTML = "";

  // Cores para cada cluster
  const colors = [
    "#FF6B6B", "#4ECDC4", "#45B7D1", "#FFA07A", "#98D8C8",
    "#F7DC6F", "#BB8FCE", "#85C1E2", "#F8B739", "#52BE80",
    "#EC7063", "#5DADE2", "#58D68D", "#F4D03F", "#AF7AC5",
  ];

  clusters.forEach((cluster, clusterIndex) => {
    if (cluster.length === 0) return;

    const clusterCard = document.createElement("div");
    clusterCard.className = "card mb-3 border";
    clusterCard.style.borderColor = colors[clusterIndex % colors.length];
    clusterCard.style.borderWidth = "3px";

    const cardHeader = document.createElement("div");
    cardHeader.className = "card-header text-white d-flex justify-content-between align-items-center";
    cardHeader.style.backgroundColor = colors[clusterIndex % colors.length];

    const headerTitle = document.createElement("h5");
    headerTitle.className = "mb-0 fw-bold";
    headerTitle.innerHTML = `
      <i class="bi bi-circle-fill"></i> Cluster ${clusterIndex + 1}
      <span class="badge bg-light text-dark ms-2">${cluster.length} cidades</span>
    `;

    const centroidInfo = document.createElement("small");
    if (centroids[clusterIndex]) {
      centroidInfo.innerHTML = `
        <i class="bi bi-geo-alt"></i> 
        Lat: ${centroids[clusterIndex].latitude.toFixed(4)}, 
        Lon: ${centroids[clusterIndex].longitude.toFixed(4)}
        <br>
        <i class="bi bi-people"></i> 
        Pop. média: ${Math.round(centroids[clusterIndex].population).toLocaleString("pt-BR")}
      `;
    }

    cardHeader.appendChild(headerTitle);
    cardHeader.appendChild(centroidInfo);

    const cardBody = document.createElement("div");
    cardBody.className = "card-body";

    // Lista de cidades do cluster
    const citiesList = document.createElement("div");
    citiesList.className = "row g-2";
    citiesList.style.maxHeight = "300px";
    citiesList.style.overflowY = "auto";

    cluster.forEach((pointIndex) => {
      const point = points[pointIndex];
      if (!point) return;

      // Extrai dados da cidade (pode estar em point.city ou diretamente em point)
      const city = point.city || point;
      if (!city) return;

      const cityCol = document.createElement("div");
      cityCol.className = "col-md-6";

      const cityCard = document.createElement("div");
      cityCard.className = "card border-0 bg-light mb-2";

      const cityBody = document.createElement("div");
      cityBody.className = "card-body p-2";

      const cityName = document.createElement("strong");
      cityName.className = "d-block";
      // Tenta diferentes campos possíveis para o nome
      const name = city.name || city.cityName || city.title || `Cidade ${pointIndex + 1}`;
      cityName.textContent = name;

      const cityDetails = document.createElement("small");
      cityDetails.className = "text-muted d-block";
      
      // Usa população do ponto (já normalizada) ou da cidade original
      const population = point.population || city.population || 0;
      // Tenta diferentes campos possíveis para o país
      const country = city.country || city.countryCode || city.countryName || city.region || "N/A";
      
      cityDetails.innerHTML = `
        ${country} | 
        Pop: ${population > 0 ? population.toLocaleString("pt-BR") : "N/A"}
      `;

      cityBody.appendChild(cityName);
      cityBody.appendChild(cityDetails);
      cityCard.appendChild(cityBody);
      cityCol.appendChild(cityCard);
      citiesList.appendChild(cityCol);
    });

    cardBody.appendChild(citiesList);
    clusterCard.appendChild(cardHeader);
    clusterCard.appendChild(cardBody);
    container.appendChild(clusterCard);
  });

  // Scroll para o topo
  container.scrollTop = 0;
};

/**
 * Mostra mensagem de carregamento durante o clustering
 * @param {HTMLElement} container - Container
 * @param {number} iteration - Iteração atual
 * @param {number} maxIterations - Máximo de iterações
 */
export const showClusteringProgress = (container, iteration, maxIterations) => {
  container.innerHTML = `
    <div class="text-center py-5">
      <div class="spinner-border text-warning mb-3" role="status" style="width: 3rem; height: 3rem;">
        <span class="visually-hidden">Processando...</span>
      </div>
      <h5 class="fw-bold">Executando K-Means...</h5>
      <p class="text-muted">Iteração ${iteration} de ${maxIterations}</p>
      <div class="progress mt-3" style="height: 25px;">
        <div 
          class="progress-bar progress-bar-striped progress-bar-animated bg-warning" 
          role="progressbar" 
          style="width: ${(iteration / maxIterations) * 100}%"
        >
          ${Math.round((iteration / maxIterations) * 100)}%
        </div>
      </div>
    </div>
  `;
};
