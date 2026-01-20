/**
 * Serviço para coleta paralela de dados usando Web Workers
 * Gerencia múltiplos workers que buscam páginas diferentes da API
 * 
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API
 */

/**
 * Coleta dados de forma paralela usando Web Workers
 * @param {number} targetCities - Número aproximado de cidades a coletar (~10000)
 * @param {number} limitPerPage - Limite de resultados por página
 * @param {Function} onProgress - Callback de progresso (progress, stats)
 * @returns {Promise<Array>} Array de cidades coletadas
 */
export const collectCitiesParallel = async (targetCities = 10000, limitPerPage = 10, onProgress) => {
  // Calcula número de páginas necessárias
  const totalPages = Math.ceil(targetCities / limitPerPage);
  
  // Número de workers drasticamente reduzido para plano BASIC
  // Plano BASIC geralmente permite apenas 1-2 req/s
  // Usar apenas 1 worker garante que não excedemos o limite
  const numWorkers = 1; // Apenas 1 worker para respeitar limite do plano BASIC
  
  // Distribui páginas entre workers
  const pagesPerWorker = Math.ceil(totalPages / numWorkers);
  
  const workers = [];
  const allCities = [];
  let completedWorkers = 0;
  let totalCollected = 0;
  let totalProcessed = 0;

  // Cria e inicializa workers com delay escalonado
  for (let i = 0; i < numWorkers; i++) {
    const startPage = i * pagesPerWorker + 1;
    const endPage = Math.min((i + 1) * pagesPerWorker, totalPages);

    // Se não há páginas para este worker, pula
    if (startPage > totalPages) {
      break;
    }

    // Delay escalonado não necessário com apenas 1 worker
    // Mas mantido caso aumentemos workers no futuro
    if (numWorkers > 1) {
      await new Promise((resolve) => setTimeout(resolve, i * 2000));
    }

    const worker = new Worker("/js/workers/dataCollectionWorker.js", { type: "module" });

    worker.postMessage({
      startPage,
      endPage,
      limit: limitPerPage,
      workerId: i,
    });

    // Escuta mensagens do worker
    worker.onmessage = (event) => {
      const { type, cities, totalCities, workerId, page, totalPages: workerTotalPages, citiesCollected, totalCitiesInPage } = event.data;

      switch (type) {
        case "progress":
          totalProcessed++;
          if (onProgress) {
            const progress = Math.round((totalProcessed / totalPages) * 100);
            onProgress(progress, {
              workers: numWorkers,
              currentPage: page,
              totalPages,
              citiesCollected: totalCollected + citiesCollected,
              workerId,
            });
          }
          break;

        case "progress_log":
          // Log de progresso do worker
          console.log(`[Worker ${event.data.workerId}] ${event.data.message}`);
          break;

        case "complete":
          completedWorkers++;
          allCities.push(...cities);
          totalCollected += cities.length;

          // Termina worker
          worker.terminate();

          // Se todos os workers terminaram
          if (completedWorkers === workers.length) {
            if (onProgress) {
              onProgress(100, {
                workers: numWorkers,
                totalPages,
                citiesCollected: totalCollected,
                completed: true,
              });
            }
          }
          break;

        case "rate_limit":
          // Rate limit atingido - informa usuário
          const waitTime = event.data.waitTime;
          if (onProgress) {
            onProgress(progress, {
              workers: numWorkers,
              currentPage: page,
              totalPages,
              citiesCollected: totalCollected,
              workerId,
              rateLimit: true,
              waitTime,
            });
          }
          console.warn(`Worker ${workerId} rate limit na página ${page}. Aguardando ${waitTime}s...`);
          break;

        case "error":
          console.warn(`Worker ${workerId} erro na página ${page}:`, event.data.error);
          // Não incrementa completedWorkers aqui - worker continua tentando outras páginas
          break;

        case "critical_error":
          console.error(`Worker ${workerId} erro crítico:`, event.data.error);
          worker.terminate();
          completedWorkers++;
          // Continua processamento mesmo se um worker falhar completamente
          break;
      }
    };

    worker.onerror = (error) => {
      console.error(`Worker ${i} erro:`, error);
      worker.terminate();
      completedWorkers++;
    };

    workers.push(worker);
  }

  // Aguarda todos os workers terminarem
  return new Promise((resolve, reject) => {
    const checkComplete = setInterval(() => {
      if (completedWorkers === workers.length) {
        clearInterval(checkComplete);
        
        // Remove duplicatas baseado no ID da cidade
        const uniqueCities = Array.from(
          new Map(allCities.map((city) => [city.id, city])).values()
        );

        resolve(uniqueCities);
      }
    }, 100);

    // Timeout de segurança (10 minutos)
    setTimeout(() => {
      clearInterval(checkComplete);
      workers.forEach((worker) => worker.terminate());
      reject(new Error("Timeout na coleta de dados"));
    }, 600000);
  });
};
