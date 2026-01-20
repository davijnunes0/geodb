/**
 * Serviço para execução do algoritmo K-Means paralelizado
 * Usa Web Workers para calcular distâncias e atualizar centroides
 * 
 * @see https://en.wikipedia.org/wiki/K-means_clustering
 */

/**
 * Inicializa centroides aleatórios
 * @param {Array} points - Array de pontos
 * @param {number} k - Número de clusters
 * @returns {Array} Array de k centroides
 */
const initializeCentroids = (points, k) => {
  const centroids = [];
  const usedIndices = new Set();

  // Encontra ranges dos dados
  const latitudes = points.map((p) => p.latitude);
  const longitudes = points.map((p) => p.longitude);
  const populations = points.map((p) => p.population);

  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLon = Math.min(...longitudes);
  const maxLon = Math.max(...longitudes);
  const minPop = Math.min(...populations);
  const maxPop = Math.max(...populations);

  // Gera k centroides aleatórios dentro dos ranges
  for (let i = 0; i < k; i++) {
    centroids.push({
      latitude: minLat + Math.random() * (maxLat - minLat),
      longitude: minLon + Math.random() * (maxLon - minLon),
      population: minPop + Math.random() * (maxPop - minPop),
    });
  }

  return centroids;
};

/**
 * Calcula distância euclidiana entre dois pontos
 * @param {Object} point1 - Ponto 1
 * @param {Object} point2 - Ponto 2
 * @returns {number} Distância
 */
const euclideanDistance = (point1, point2) => {
  const MAX_POPULATION = 50000000;
  const normPop1 = point1.population / MAX_POPULATION;
  const normPop2 = point2.population / MAX_POPULATION;

  const latDiff = point1.latitude - point2.latitude;
  const lonDiff = point1.longitude - point2.longitude;
  const popDiff = normPop1 - normPop2;

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

  // Inicializa centroides
  let centroids = initializeCentroids(points, k);
  const numWorkers = Math.min(navigator.hardwareConcurrency || 4, 8);

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    // Atribui pontos aos clusters
    const assignments = await assignPointsToClusters(points, centroids, numWorkers);

    // Agrupa pontos por cluster
    const clusters = Array.from({ length: k }, () => []);
    for (const assignment of assignments) {
      clusters[assignment.centroidIndex].push(assignment.pointIndex);
    }

    // Calcula novos centroides
    const newCentroids = await calculateNewCentroids(clusters, points);

    // Trata centroides nulos (clusters vazios)
    for (let i = 0; i < newCentroids.length; i++) {
      if (!newCentroids[i]) {
        // Se cluster está vazio, mantém centroide anterior ou gera aleatório
        if (centroids[i]) {
          newCentroids[i] = { ...centroids[i] };
        } else {
          // Gera centroide aleatório baseado nos dados
          const latitudes = points.map((p) => p.latitude);
          const longitudes = points.map((p) => p.longitude);
          const populations = points.map((p) => p.population);
          const minLat = Math.min(...latitudes);
          const maxLat = Math.max(...latitudes);
          const minLon = Math.min(...longitudes);
          const maxLon = Math.max(...longitudes);
          const minPop = Math.min(...populations);
          const maxPop = Math.max(...populations);

          newCentroids[i] = {
            latitude: minLat + Math.random() * (maxLat - minLat),
            longitude: minLon + Math.random() * (maxLon - minLon),
            population: minPop + Math.random() * (maxPop - minPop),
          };
        }
      }
    }

    // Verifica convergência
    if (hasConverged(centroids, newCentroids)) {
      if (onIteration) {
        onIteration(iteration + 1, clusters, newCentroids, true);
      }
      return {
        clusters,
        centroids: newCentroids,
        iterations: iteration + 1,
        converged: true,
      };
    }

    centroids = newCentroids;

    if (onIteration) {
      onIteration(iteration + 1, clusters, centroids, false);
    }
  }

  // Última atribuição
  const assignments = await assignPointsToClusters(points, centroids, numWorkers);
  const clusters = Array.from({ length: k }, () => []);
  for (const assignment of assignments) {
    clusters[assignment.centroidIndex].push(assignment.pointIndex);
  }

  return {
    clusters,
    centroids,
    iterations: maxIterations,
    converged: false,
  };
};
