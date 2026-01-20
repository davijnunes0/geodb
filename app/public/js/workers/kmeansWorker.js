/**
 * Web Worker para cálculo de distâncias no algoritmo K-Means
 * Paraleliza o cálculo de distâncias entre pontos e centroides
 * 
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API
 */

/**
 * Calcula distância euclidiana entre dois pontos
 * Considera: latitude, longitude e população (normalizada)
 * 
 * @param {Object} point1 - Ponto 1 {latitude, longitude, population}
 * @param {Object} point2 - Ponto 2 {latitude, longitude, population}
 * @returns {number} Distância euclidiana
 */
const euclideanDistance = (point1, point2) => {
  // Normaliza população para escala similar (0-1)
  // Assumindo população máxima de 50 milhões
  const MAX_POPULATION = 50000000;
  const normPop1 = point1.population / MAX_POPULATION;
  const normPop2 = point2.population / MAX_POPULATION;

  // Calcula distância considerando as três dimensões
  const latDiff = point1.latitude - point2.latitude;
  const lonDiff = point1.longitude - point2.longitude;
  const popDiff = normPop1 - normPop2;

  return Math.sqrt(latDiff * latDiff + lonDiff * lonDiff + popDiff * popDiff);
};

/**
 * Processa mensagens do thread principal
 */
self.onmessage = (event) => {
  const { type, data } = event.data;

  switch (type) {
    case "assign_points": {
      const { points, centroids, startIndex, endIndex } = data;
      const assignments = [];

      // Calcula distâncias para cada ponto atribuído a este worker
      for (let i = startIndex; i < endIndex; i++) {
        const point = points[i];
        let minDistance = Infinity;
        let closestCentroid = 0;

        // Encontra o centroide mais próximo
        for (let j = 0; j < centroids.length; j++) {
          const distance = euclideanDistance(point, centroids[j]);
          if (distance < minDistance) {
            minDistance = distance;
            closestCentroid = j;
          }
        }

        assignments.push({
          pointIndex: i,
          centroidIndex: closestCentroid,
          distance: minDistance,
        });
      }

      // Envia resultados de volta
      self.postMessage({
        type: "assignments_complete",
        assignments,
        startIndex,
        endIndex,
      });
      break;
    }

    case "calculate_new_centroids": {
      const { clusters, points } = data;
      const newCentroids = [];

      // Calcula novos centroides para cada cluster
      for (let clusterId = 0; clusterId < clusters.length; clusterId++) {
        const clusterPoints = clusters[clusterId];

        if (clusterPoints.length === 0) {
          // Se cluster está vazio, mantém centroide anterior ou gera aleatório
          newCentroids.push(null);
          continue;
        }

        // Calcula média das coordenadas e população
        let sumLat = 0;
        let sumLon = 0;
        let sumPop = 0;

        for (const pointIndex of clusterPoints) {
          const point = points[pointIndex];
          sumLat += point.latitude;
          sumLon += point.longitude;
          sumPop += point.population;
        }

        const count = clusterPoints.length;
        newCentroids.push({
          latitude: sumLat / count,
          longitude: sumLon / count,
          population: sumPop / count,
        });
      }

      self.postMessage({
        type: "centroids_complete",
        centroids: newCentroids,
      });
      break;
    }

    default:
      self.postMessage({
        type: "error",
        error: `Unknown message type: ${type}`,
      });
  }
};
