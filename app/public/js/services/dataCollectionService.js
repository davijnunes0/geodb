/**
 * Serviço para coleta paralela de dados usando Web Workers
 * Gerencia múltiplos workers que buscam páginas diferentes da API
 * Usa SharedArrayBuffer para memória compartilhada com sincronização Atomics
 * 
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Atomics
 * 
 * Versão: 1.1.0 - Corrigido erro totalCollected não definido
 */

import { estimateBufferSize, serializeCity, deserializeCities } from "../util/sharedMemorySerializer.js";

/**
 * Verifica se SharedArrayBuffer está disponível
 * Requer headers de segurança específicos (Cross-Origin-Opener-Policy e Cross-Origin-Embedder-Policy)
 * @returns {boolean} True se disponível
 */
const isSharedArrayBufferAvailable = () => {
  return typeof SharedArrayBuffer !== "undefined";
};

/**
 * Coleta dados de forma paralela usando Web Workers e memória compartilhada
 * Implementa algoritmo de divisão e conquista com escrita controlada via Atomics
 * @param {number} targetCities - Número aproximado de cidades a coletar (~10000)
 * @param {number} limitPerPage - Limite de resultados por página
 * @param {Function} onProgress - Callback de progresso (progress, stats)
 * @returns {Promise<Array>} Array de cidades coletadas
 */
export const collectCitiesParallel = async (targetCities = 10000, limitPerPage = 10, onProgress) => {
  // Verifica disponibilidade de SharedArrayBuffer
  const useSharedMemory = isSharedArrayBufferAvailable();
  
  if (!useSharedMemory) {
    console.warn("SharedArrayBuffer não disponível. Usando fallback com postMessage.");
    return collectCitiesParallelFallback(targetCities, limitPerPage, onProgress);
  }

  // Calcula número de páginas necessárias
  const totalPages = Math.ceil(targetCities / limitPerPage);
  
  // Número de workers: ajustado para plano BASIC da RapidAPI
  // Plano BASIC tem limite muito restritivo (1 req/s)
  // Para garantir que não excedemos o limite, usamos apenas 1 worker
  // Em planos superiores, pode-se aumentar este número
  const numWorkers = 1; // Apenas 1 worker para respeitar limite do plano BASIC (1 req/s)
  
  // NOTA: Para demonstrar paralelismo real, em produção com plano superior,
  // pode-se usar: Math.min(Math.max(1, Math.floor(navigator.hardwareConcurrency || 4) / 2), 4)
  
  // Distribui páginas entre workers (divisão e conquista)
  const pagesPerWorker = Math.ceil(totalPages / numWorkers);
  
  // Cria SharedArrayBuffer para memória compartilhada
  // Estrutura: 
  // - 4 bytes: índice atômico de escrita (Uint32)
  // - 4 bytes: contador de workers completos (Uint32)
  // - Resto: dados das cidades serializadas
  const headerSize = 8; // 2 Uint32 (writeIndex + completedWorkers)
  const estimatedDataSize = estimateBufferSize(targetCities * 1.5); // 50% de margem
  const totalBufferSize = headerSize + estimatedDataSize;
  
  let sharedBuffer;
  try {
    sharedBuffer = new SharedArrayBuffer(totalBufferSize);
  } catch (error) {
    console.warn("Erro ao criar SharedArrayBuffer:", error);
    return collectCitiesParallelFallback(targetCities, limitPerPage, onProgress);
  }

  // Inicializa índices atômicos no buffer compartilhado
  const atomicView = new Int32Array(sharedBuffer, 0, 2);
  Atomics.store(atomicView, 0, headerSize); // writeIndex começa após header
  Atomics.store(atomicView, 1, 0); // completedWorkers começa em 0

  const workers = [];
  let totalProcessed = 0;
  
  // Variáveis para controle da Promise
  let resolvePromise = null;
  let rejectPromise = null;

  // Cria e inicializa workers com delay escalonado para rate limiting
  // Cada worker inicia com delay progressivo para distribuir requisições
  for (let i = 0; i < numWorkers; i++) {
    const startPage = i * pagesPerWorker + 1;
    const endPage = Math.min((i + 1) * pagesPerWorker, totalPages);

    // Se não há páginas para este worker, pula
    if (startPage > totalPages) {
      break;
    }

    // Delay escalonado não necessário com apenas 1 worker
    // Com múltiplos workers, cada um esperaria antes de iniciar para distribuir requisições
    // Worker 0: inicia imediatamente
    // Worker 1: esperaria 2.5s (se houvesse múltiplos workers)
    // Worker 2: esperaria 5s (se houvesse múltiplos workers)
    // etc.
    // Com apenas 1 worker (plano BASIC), não há necessidade de delay escalonado

    const worker = new Worker("/js/workers/dataCollectionWorker.js", { type: "module" });

    // Passa SharedArrayBuffer e informações de sincronização
    worker.postMessage({
      type: "start_collection",
      startPage,
      endPage,
      limit: limitPerPage,
      workerId: i,
      sharedBuffer: sharedBuffer, // SharedArrayBuffer é transferível
      headerSize: headerSize,
      totalBufferSize: totalBufferSize,
    });

    // Escuta mensagens do worker
    worker.onmessage = (event) => {
      const { type, workerId, page, citiesCollected, totalCitiesInPage, error, waitTime } = event.data;

      switch (type) {
        case "progress":
          totalProcessed++;
          // Lê contador atual de cidades do buffer compartilhado
          let estimatedCollectedProgress = 0;
          try {
            if (atomicView && typeof Atomics !== 'undefined') {
              const currentWriteIndex = Atomics.load(atomicView, 0);
              estimatedCollectedProgress = Math.floor((currentWriteIndex - headerSize) / 200); // Estimativa baseada em tamanho médio
            }
          } catch (e) {
            // Se não conseguir ler do buffer compartilhado, usa 0
            console.warn("Erro ao estimar cidades coletadas no progress:", e);
          }
          
          if (onProgress) {
            const progress = Math.round((totalProcessed / totalPages) * 100);
            onProgress(progress, {
              workers: numWorkers,
              currentPage: page,
              totalPages,
              citiesCollected: estimatedCollectedProgress,
              workerId,
            });
          }
          break;

        case "progress_log":
          // Log de progresso do worker
          console.log(`[Worker ${event.data.workerId}] ${event.data.message}`);
          break;

        case "complete":
          // Incrementa contador atômico de workers completos
          Atomics.add(atomicView, 1, 1);

          // Termina worker
          worker.terminate();
          break;

        case "rate_limit":
          // Rate limit atingido - informa usuário
          if (onProgress) {
            const progress = Math.round((totalProcessed / totalPages) * 100);
            // Estima cidades coletadas baseado no índice de escrita atual
            let estimatedCollectedRateLimit = 0;
            try {
              if (atomicView && typeof Atomics !== 'undefined') {
                const currentWriteIndex = Atomics.load(atomicView, 0);
                estimatedCollectedRateLimit = Math.floor((currentWriteIndex - headerSize) / 200); // Estimativa baseada em tamanho médio
              }
            } catch (e) {
              // Se não conseguir ler do buffer compartilhado, usa 0
              console.warn("Erro ao estimar cidades coletadas:", e);
            }
            onProgress(progress, {
              workers: numWorkers,
              currentPage: page,
              totalPages,
              citiesCollected: estimatedCollectedRateLimit,
              workerId,
              rateLimit: true,
              waitTime,
            });
          }
          console.warn(`Worker ${workerId} rate limit na página ${page}. Aguardando ${waitTime}s...`);
          break;

        case "error":
          console.warn(`Worker ${workerId} erro na página ${page}:`, error);
          // Não incrementa completedWorkers aqui - worker continua tentando outras páginas
          break;

        case "critical_error":
          console.error(`Worker ${workerId} erro crítico:`, error);
          worker.terminate();
          // Incrementa contador atômico de workers completos mesmo em caso de erro crítico
          Atomics.add(atomicView, 1, 1);
          // Continua processamento mesmo se um worker falhar completamente
          break;

        default:
          console.warn(`Worker ${workerId} mensagem desconhecida:`, type);
      }
    };

    worker.onerror = (error) => {
      console.error(`Worker ${i} erro:`, error);
      worker.terminate();
      // Incrementa contador de workers completos mesmo em caso de erro
      Atomics.add(atomicView, 1, 1);
    };

    workers.push(worker);
  }

  // Aguarda todos os workers terminarem e lê dados do buffer compartilhado
  return new Promise((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
    
    const checkComplete = setInterval(() => {
      const currentCompleted = Atomics.load(atomicView, 1);
      if (currentCompleted === numWorkers) {
        clearInterval(checkComplete);
        
        // Lê dados do buffer compartilhado
        const finalWriteIndex = Atomics.load(atomicView, 0);
        const dataBuffer = sharedBuffer.slice(headerSize, finalWriteIndex);
        const allCities = deserializeCities(dataBuffer);
        
        // Remove duplicatas usando estratégia multi-critério:
        // 1. Primeiro por ID (mais confiável)
        // 2. Depois por nome + coordenadas próximas (tolerância de 0.01 graus ≈ 1km)
        const uniqueCitiesById = Array.from(
          new Map(allCities.map((city) => [city.id, city])).values()
        );
        
        // Remove duplicatas por nome + coordenadas próximas
        const uniqueCities = [];
        const seen = new Map(); // key: "nome|lat|lon" (arredondado)
        
        for (const city of uniqueCitiesById) {
          const name = (city.name || city.cityName || "").toLowerCase().trim();
          // Arredonda coordenadas para detectar cidades muito próximas
          const latRounded = Math.round(city.latitude * 100) / 100; // ~1km precisão
          const lonRounded = Math.round(city.longitude * 100) / 100;
          const key = `${name}|${latRounded}|${lonRounded}`;
          
          if (!seen.has(key)) {
            seen.set(key, city);
            uniqueCities.push(city);
          } else {
            // Se já existe, mantém a que tem maior população (mais atualizada)
            const existing = seen.get(key);
            if (city.population > (existing.population || 0)) {
              const index = uniqueCities.indexOf(existing);
              if (index !== -1) {
                uniqueCities[index] = city;
                seen.set(key, city);
              }
            }
          }
        }
        
        console.log(`🔍 Duplicatas removidas: ${allCities.length} → ${uniqueCitiesById.length} (por ID) → ${uniqueCities.length} (por nome+coord)`);

        // Atualiza progresso final
        if (onProgress) {
          onProgress(100, {
            workers: numWorkers,
            totalPages,
            citiesCollected: uniqueCities.length,
            completed: true,
          });
        }

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

/**
 * Fallback: coleta sem SharedArrayBuffer (usa postMessage)
 * Mantido para compatibilidade com navegadores que não suportam SharedArrayBuffer
 */
const collectCitiesParallelFallback = async (targetCities = 10000, limitPerPage = 10, onProgress) => {
  const totalPages = Math.ceil(targetCities / limitPerPage);
  const numWorkers = 1; // Fallback usa apenas 1 worker
  const pagesPerWorker = Math.ceil(totalPages / numWorkers);
  
  const workers = [];
  const allCities = [];
  let completedWorkers = 0;
  let totalCollected = 0;
  let totalProcessed = 0;

  for (let i = 0; i < numWorkers; i++) {
    const startPage = i * pagesPerWorker + 1;
    const endPage = Math.min((i + 1) * pagesPerWorker, totalPages);

    if (startPage > totalPages) break;

    const worker = new Worker("/js/workers/dataCollectionWorker.js", { type: "module" });

    worker.postMessage({
      type: "start_collection",
      startPage,
      endPage,
      limit: limitPerPage,
      workerId: i,
      useSharedMemory: false,
    });

    worker.onmessage = (event) => {
      const { type, cities, workerId, page, citiesCollected } = event.data;

      switch (type) {
        case "progress":
          totalProcessed++;
          if (onProgress) {
            const progress = Math.round((totalProcessed / totalPages) * 100);
            onProgress(progress, {
              workers: numWorkers,
              currentPage: page,
              totalPages,
              citiesCollected: totalCollected + (citiesCollected || 0),
              workerId,
            });
          }
          break;

        case "complete":
          completedWorkers++;
          allCities.push(...(cities || []));
          totalCollected += (cities || []).length;
          worker.terminate();
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

        case "error":
          console.warn(`Worker ${workerId} erro na página ${page}:`, event.data.error);
          break;

        case "critical_error":
          console.error(`Worker ${workerId} erro crítico:`, event.data.error);
          worker.terminate();
          completedWorkers++;
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

  return new Promise((resolve, reject) => {
    const checkComplete = setInterval(() => {
      if (completedWorkers === workers.length) {
        clearInterval(checkComplete);
        
        // Remove duplicatas usando estratégia multi-critério (mesma lógica do SharedArrayBuffer)
        const uniqueCitiesById = Array.from(
          new Map(allCities.map((city) => [city.id, city])).values()
        );
        
        const uniqueCities = [];
        const seen = new Map();
        
        for (const city of uniqueCitiesById) {
          const name = (city.name || city.cityName || "").toLowerCase().trim();
          const latRounded = Math.round(city.latitude * 100) / 100;
          const lonRounded = Math.round(city.longitude * 100) / 100;
          const key = `${name}|${latRounded}|${lonRounded}`;
          
          if (!seen.has(key)) {
            seen.set(key, city);
            uniqueCities.push(city);
          } else {
            const existing = seen.get(key);
            if (city.population > (existing.population || 0)) {
              const index = uniqueCities.indexOf(existing);
              if (index !== -1) {
                uniqueCities[index] = city;
                seen.set(key, city);
              }
            }
          }
        }
        
        console.log(`🔍 Duplicatas removidas (fallback): ${allCities.length} → ${uniqueCities.length}`);
        resolve(uniqueCities);
      }
    }, 100);

    setTimeout(() => {
      clearInterval(checkComplete);
      workers.forEach((worker) => worker.terminate());
      reject(new Error("Timeout na coleta de dados"));
    }, 600000);
  });
};
