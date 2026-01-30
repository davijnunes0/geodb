/**
 * Web Worker para cálculo de distâncias no algoritmo K-Means
 * Paraleliza o cálculo de distâncias entre pontos e centroides
 * 
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API
 */

/**
 * Calcula distância euclidiana entre dois pontos normalizados
 * IMPORTANTE: Esta função assume que os pontos já foram normalizados (0-1)
 * usando Min-Max normalization. Todas as dimensões têm o mesmo peso.
 * 
 * @param {Object} point1 - Ponto 1 normalizado {latitude, longitude, population}
 * @param {Object} point2 - Ponto 2 normalizado {latitude, longitude, population}
 * @returns {number} Distância euclidiana
 */
const euclideanDistance = (point1, point2) => {
  // Como os dados já estão normalizados (0-1), cálculo direto
  // Todas as dimensões têm o mesmo peso no cálculo
  const latDiff = point1.latitude - point2.latitude;
  const lonDiff = point1.longitude - point2.longitude;
  const popDiff = point1.population - point2.population;

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
