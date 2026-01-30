/**
 * Serviço para execução do algoritmo K-Means paralelizado
 * Usa Web Workers para calcular distâncias e atualizar centroides
 * 
 * @see https://en.wikipedia.org/wiki/K-means_clustering
 */

/**
 * Normaliza dados usando Min-Max Normalization (Feature Scaling)
 * Garante que todas as dimensões tenham o mesmo peso no cálculo de distância
 * 
 * Fórmula: x_norm = (x - min) / (max - min)
 * Resultado: valores entre 0 e 1
 * 
 * @param {Array} points - Array de pontos {latitude, longitude, population}
 * @returns {Object} Objeto com pontos normalizados e ranges originais
 */
const normalizeData = (points) => {
  if (points.length === 0) {
    return { normalizedPoints: [], ranges: null };
  }

  // Encontra ranges dos dados
  const latitudes = points.map((p) => p.latitude);
  const longitudes = points.map((p) => p.longitude);
  const populations = points.map((p) => p.population || 0);

  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLon = Math.min(...longitudes);
  const maxLon = Math.max(...longitudes);
  const minPop = Math.min(...populations);
  const maxPop = Math.max(...populations);

  // Calcula ranges (evita divisão por zero)
  const rangeLat = maxLat - minLat || 1;
  const rangeLon = maxLon - minLon || 1;
  const rangePop = maxPop - minPop || 1;

  // Normaliza cada ponto usando Min-Max
  const normalizedPoints = points.map((point) => ({
    ...point,
    latitude: (point.latitude - minLat) / rangeLat,
    longitude: (point.longitude - minLon) / rangeLon,
    population: ((point.population || 0) - minPop) / rangePop,
  }));

  return {
    normalizedPoints,
    ranges: {
      lat: { min: minLat, max: maxLat, range: rangeLat },
      lon: { min: minLon, max: maxLon, range: rangeLon },
      pop: { min: minPop, max: maxPop, range: rangePop },
    },
  };
};

/**
 * Desnormaliza centroides para valores originais
 * @param {Array} normalizedCentroids - Centroides normalizados
 * @param {Object} ranges - Ranges originais dos dados
 * @returns {Array} Centroides desnormalizados
 */
const denormalizeCentroids = (normalizedCentroids, ranges) => {
  if (!ranges) return normalizedCentroids;

  return normalizedCentroids.map((centroid) => ({
    ...centroid,
    latitude: centroid.latitude * ranges.lat.range + ranges.lat.min,
    longitude: centroid.longitude * ranges.lon.range + ranges.lon.min,
    population: centroid.population * ranges.pop.range + ranges.pop.min,
  }));
};

/**
 * Inicializa centroides aleatórios (já normalizados)
 * @param {Array} normalizedPoints - Array de pontos normalizados
 * @param {number} k - Número de clusters
 * @returns {Array} Array de k centroides normalizados
 */
const initializeCentroids = (normalizedPoints, k) => {
  const centroids = [];

  // Como os dados já estão normalizados (0-1), podemos gerar valores aleatórios nesse range
  for (let i = 0; i < k; i++) {
    centroids.push({
      latitude: Math.random(), // 0 a 1
      longitude: Math.random(), // 0 a 1
      population: Math.random(), // 0 a 1
    });
  }

  return centroids;
};

/**
 * Calcula distância euclidiana entre dois pontos normalizados
 * Como todos os valores estão entre 0 e 1, todas as dimensões têm o mesmo peso
 * 
 * @param {Object} point1 - Ponto 1 normalizado
 * @param {Object} point2 - Ponto 2 normalizado
 * @returns {number} Distância euclidiana
 */
const euclideanDistance = (point1, point2) => {
  // Todos os valores já estão normalizados (0-1), então cálculo direto
  const latDiff = point1.latitude - point2.latitude;
  const lonDiff = point1.longitude - point2.longitude;
  const popDiff = point1.population - point2.population;

  return Math.sqrt(latDiff * latDiff + lonDiff * lonDiff + popDiff * popDiff);
};

/**
 * Atribui pontos aos clusters usando Web Workers
 * @param {Array} points - Array de pontos
 * @param {Array} centroids - Array de centroides
 * @param {number} numWorkers - Número de workers a usar
 * @returns {Promise<Array>} Array de assignments [pointIndex, centroidIndex]
 */
const assignPointsToClusters = async (points, centroids, numWorkers = 4) => {
  const pointsPerWorker = Math.ceil(points.length / numWorkers);
  const workers = [];
  const promises = [];

  // Cria workers e distribui pontos
  for (let i = 0; i < numWorkers; i++) {
    const startIndex = i * pointsPerWorker;
    const endIndex = Math.min((i + 1) * pointsPerWorker, points.length);

    if (startIndex >= points.length) break;

    const worker = new Worker("/js/workers/kmeansWorker.js", { type: "module" });

    const promise = new Promise((resolve, reject) => {
      worker.onmessage = (event) => {
        if (event.data.type === "assignments_complete") {
          worker.terminate();
          resolve(event.data.assignments);
        } else if (event.data.type === "error") {
          worker.terminate();
          reject(new Error(event.data.error));
        }
      };

      worker.onerror = (error) => {
        worker.terminate();
        reject(error);
      };
    });

    worker.postMessage({
      type: "assign_points",
      data: {
        points,
        centroids,
        startIndex,
        endIndex,
      },
    });

    workers.push(worker);
    promises.push(promise);
  }

  // Aguarda todos os workers terminarem
  const allAssignments = await Promise.all(promises);
  return allAssignments.flat();
};

/**
 * Calcula novos centroides usando Web Workers
 * @param {Array} clusters - Array de clusters (cada cluster é array de índices de pontos)
 * @param {Array} points - Array de pontos
 * @returns {Promise<Array>} Novos centroides
 */
const calculateNewCentroids = async (clusters, points) => {
  return new Promise((resolve, reject) => {
    const worker = new Worker("/js/workers/kmeansWorker.js", { type: "module" });

    worker.onmessage = (event) => {
      if (event.data.type === "centroids_complete") {
        worker.terminate();
        resolve(event.data.centroids);
      } else if (event.data.type === "error") {
        worker.terminate();
        reject(new Error(event.data.error));
      }
    };

    worker.onerror = (error) => {
      worker.terminate();
      reject(error);
    };

    worker.postMessage({
      type: "calculate_new_centroids",
      data: {
        clusters,
        points,
      },
    });
  });
};

/**
 * Verifica se centroides convergiram
 * @param {Array} oldCentroids - Centroides anteriores
 * @param {Array} newCentroids - Novos centroides
 * @param {number} threshold - Limiar de convergência
 * @returns {boolean} True se convergiu
 */
const hasConverged = (oldCentroids, newCentroids, threshold = 0.01) => {
  for (let i = 0; i < oldCentroids.length; i++) {
    if (!oldCentroids[i] || !newCentroids[i]) continue;
    const distance = euclideanDistance(oldCentroids[i], newCentroids[i]);
    if (distance > threshold) {
      return false;
    }
  }
  return true;
};

/**
 * Executa algoritmo K-Means
 * @param {Array} points - Array de pontos {latitude, longitude, population}
 * @param {number} k - Número de clusters
 * @param {number} maxIterations - Número máximo de iterações
 * @param {Function} onIteration - Callback chamado a cada iteração
 * @returns {Promise<Object>} Resultado do clustering {clusters, centroids, iterations}
 */
export const kmeans = async (points, k, maxIterations = 100, onIteration) => {
  if (points.length < k) {
    throw new Error(`Número de pontos (${points.length}) deve ser maior ou igual a k (${k})`);
  }

  // PASSO CRÍTICO: Normaliza dados antes do clustering
  // Isso garante que latitude, longitude e população tenham o mesmo peso
  const { normalizedPoints, ranges } = normalizeData(points);
  
  console.log("📊 Normalização aplicada:", {
    pontosOriginais: points.length,
    ranges: ranges,
    exemploNormalizado: normalizedPoints[0],
  });

  // Inicializa centroides (já normalizados)
  let centroids = initializeCentroids(normalizedPoints, k);
  const numWorkers = Math.min(navigator.hardwareConcurrency || 4, 8);

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    // Atribui pontos aos clusters (usando pontos normalizados)
    const assignments = await assignPointsToClusters(normalizedPoints, centroids, numWorkers);

    // Agrupa pontos por cluster
    const clusters = Array.from({ length: k }, () => []);
    for (const assignment of assignments) {
      clusters[assignment.centroidIndex].push(assignment.pointIndex);
    }

    // Calcula novos centroides (usando pontos normalizados)
    const newCentroids = await calculateNewCentroids(clusters, normalizedPoints);

    // Trata centroides nulos (clusters vazios)
    for (let i = 0; i < newCentroids.length; i++) {
      if (!newCentroids[i]) {
        // Se cluster está vazio, mantém centroide anterior ou gera aleatório
        if (centroids[i]) {
          newCentroids[i] = { ...centroids[i] };
        } else {
          // Gera centroide aleatório normalizado (0-1)
          newCentroids[i] = {
            latitude: Math.random(),
            longitude: Math.random(),
            population: Math.random(),
          };
        }
      }
    }

    // Verifica convergência
    if (hasConverged(centroids, newCentroids)) {
      // Desnormaliza centroides finais para retornar valores originais
      const denormalizedCentroids = denormalizeCentroids(newCentroids, ranges);
      
      if (onIteration) {
        onIteration(iteration + 1, clusters, denormalizedCentroids, true);
      }
      return {
        clusters,
        centroids: denormalizedCentroids,
        iterations: iteration + 1,
        converged: true,
      };
    }

    centroids = newCentroids;

    if (onIteration) {
      // Desnormaliza para callback (valores originais)
      const denormalizedCentroids = denormalizeCentroids(centroids, ranges);
      onIteration(iteration + 1, clusters, denormalizedCentroids, false);
    }
  }

  // Última atribuição
  const assignments = await assignPointsToClusters(normalizedPoints, centroids, numWorkers);
  const clusters = Array.from({ length: k }, () => []);
  for (const assignment of assignments) {
    clusters[assignment.centroidIndex].push(assignment.pointIndex);
  }

  // Desnormaliza centroides finais
  const denormalizedCentroids = denormalizeCentroids(centroids, ranges);

  return {
    clusters,
    centroids: denormalizedCentroids,
    iterations: maxIterations,
    converged: false,
  };
};
