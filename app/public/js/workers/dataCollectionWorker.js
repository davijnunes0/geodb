/**
 * Web Worker para coleta paralela de dados da API
 * Cada worker busca um subconjunto de páginas usando algoritmo de divisão e conquista
 * Implementa escrita controlada em memória compartilhada usando Atomics
 * 
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Atomics
 */

import { serializeCity } from "../util/sharedMemorySerializer.js";

// Rate limiting: delay entre requisições para evitar saturação
// Plano BASIC da RapidAPI tem limite muito restritivo (1 req/s)
// Delay total de 2.5 segundos (2s base + 0.5s margem) garante que nunca excedemos 1 req/s
// Isso garante ~0.4 req/s, bem abaixo do limite de 1 req/s
const REQUEST_DELAY_MS = 2000; // 2 segundos base entre requisições (mais conservador)
const SAFETY_MARGIN_MS = 500; // 500ms de margem adicional = total 2.5s entre requisições

/**
 * Faz requisição à API com retry em caso de erro
 * @param {number} offset - Offset para paginação
 * @param {number} limit - Limite de resultados
 * @param {number} page - Número da página (para logging)
 * @returns {Promise<Object>} Dados retornados pela API
 */
const fetchPage = async (offset, limit, page = null) => {
  const maxRetries = 3;
  let retryCount = 0;

  while (retryCount < maxRetries) {
    try {
      const queryString = new URLSearchParams({
        offset,
        limit,
        sort: "name",
      }).toString();

      const response = await fetch(`/api/cities?${queryString}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const status = response.status;
        
        if (status === 429) {
          // Rate limit - backoff exponencial mais agressivo
          // Plano BASIC tem limite muito baixo, então aguardamos mais tempo
          // Aguarda tempo suficiente para API resetar o contador (geralmente 60s)
          const waitTime = Math.min(15000 * (retryCount + 1), 60000); // 15s, 30s, 45s, max 60s
          console.warn(`Rate limit atingido. Aguardando ${waitTime/1000}s antes de retry ${retryCount + 1}/${maxRetries}`);
          
          // Notifica thread principal sobre rate limit
          self.postMessage({
            type: "rate_limit",
            workerId: currentWorkerId,
            waitTime: waitTime / 1000,
            page,
          });
          
          // Aguarda tempo suficiente para resetar o contador de rate limit
          await new Promise((resolve) => setTimeout(resolve, waitTime));
          retryCount++;
          continue;
        } else if (status === 403) {
          // Acesso negado - provavelmente limite excedido, não tenta novamente
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            `Acesso negado: ${errorData.error?.message || errorData.message || 'Limite excedido'}`
          );
        } else if (status === 500 || status === 502 || status === 503 || status === 504) {
          // Erros de servidor - aguarda antes de retry
          const waitTime = 2000 * (retryCount + 1); // 2s, 4s, 6s
          await new Promise((resolve) => setTimeout(resolve, waitTime));
          retryCount++;
          continue;
        }
        
        // Para outros erros, tenta obter mensagem de erro
        let errorMessage = `HTTP error! status: ${status}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error?.message || errorData.error || errorMessage;
        } catch {
          // Se não conseguir parsear JSON, usa mensagem padrão
        }
        
        throw new Error(errorMessage);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      retryCount++;
      if (retryCount >= maxRetries) {
        throw error;
      }
      // Aguarda antes de tentar novamente
      await new Promise((resolve) => setTimeout(resolve, 1000 * retryCount));
    }
  }
};

/**
 * Escreve cidade no buffer compartilhado usando Atomics para controle de escrita
 * Implementa algoritmo de divisão e conquista: cada worker escreve sua parcela
 * de forma thread-safe usando operações atômicas
 * 
 * @param {Object} city - Cidade a escrever
 * @param {SharedArrayBuffer} sharedBuffer - Buffer compartilhado
 * @param {Int32Array} atomicView - View atômica do buffer
 * @param {number} headerSize - Tamanho do header
 * @param {number} totalBufferSize - Tamanho total do buffer
 * @returns {boolean} True se escrita foi bem-sucedida
 */
const writeCityToSharedBuffer = (city, sharedBuffer, atomicView, headerSize, totalBufferSize) => {
  try {
    // Serializa cidade para calcular tamanho necessário
    const jsonString = JSON.stringify(city);
    const jsonBytes = new TextEncoder().encode(jsonString);
    const citySize = 4 + jsonBytes.length; // 4 bytes para tamanho + dados

    // Obtém índice de escrita atual de forma atômica
    // Usa compare-and-swap loop para garantir escrita thread-safe
    let writeIndex;
    let attempts = 0;
    const maxAttempts = 100;

    while (attempts < maxAttempts) {
      // Lê índice atual
      writeIndex = Atomics.load(atomicView, 0);

      // Verifica se há espaço suficiente
      if (writeIndex + citySize > totalBufferSize) {
        console.warn(`Worker ${currentWorkerId}: Buffer cheio. Não é possível escrever mais cidades.`);
        return false;
      }

      // Tenta reservar espaço usando compare-and-swap
      // Se outro worker escreveu entre a leitura e agora, o CAS falha e tentamos novamente
      const expectedIndex = writeIndex;
      const newIndex = writeIndex + citySize;
      
      const actualIndex = Atomics.compareExchange(atomicView, 0, expectedIndex, newIndex);
      
      if (actualIndex === expectedIndex) {
        // Sucesso: reservamos o espaço, agora podemos escrever
        writeIndex = expectedIndex;
        break;
      }
      
      // CAS falhou: outro worker escreveu primeiro, tenta novamente
      attempts++;
    }

    if (attempts >= maxAttempts) {
      console.warn(`Worker ${currentWorkerId}: Falhou ao reservar espaço após ${maxAttempts} tentativas`);
      return false;
    }

    // Escreve dados no buffer (já temos o espaço reservado)
    const uint8Array = new Uint8Array(sharedBuffer);
    const view = new DataView(sharedBuffer, writeIndex, 4);
    view.setUint32(0, jsonBytes.length, true); // Escreve tamanho
    uint8Array.set(jsonBytes, writeIndex + 4); // Escreve dados JSON

    return true;
  } catch (error) {
    console.error(`Worker ${currentWorkerId}: Erro ao escrever cidade no buffer compartilhado:`, error);
    return false;
  }
};

/**
 * Processa mensagens do thread principal
 */
let currentWorkerId = 0;
let sharedBuffer = null;
let atomicView = null;
let headerSize = 0;
let totalBufferSize = 0;
let useSharedMemory = false;

self.onmessage = async (event) => {
  const { type, startPage, endPage, limit, workerId, sharedBuffer: receivedBuffer, headerSize: receivedHeaderSize, totalBufferSize: receivedTotalBufferSize, useSharedMemory: receivedUseSharedMemory } = event.data;
  
  currentWorkerId = workerId;

  // Configura memória compartilhada se disponível
  if (receivedBuffer && receivedUseSharedMemory !== false) {
    try {
      sharedBuffer = receivedBuffer;
      headerSize = receivedHeaderSize || 8;
      totalBufferSize = receivedTotalBufferSize || sharedBuffer.byteLength;
      atomicView = new Int32Array(sharedBuffer, 0, 2);
      useSharedMemory = true;
    } catch (error) {
      console.warn(`Worker ${workerId}: Erro ao configurar memória compartilhada, usando fallback:`, error);
      useSharedMemory = false;
    }
  } else {
    useSharedMemory = false;
  }

  try {
    const results = []; // Mantido para fallback
    let totalCities = 0;
    let citiesCollected = 0;

    // Processa cada página atribuída a este worker (divisão e conquista)
    for (let page = startPage; page <= endPage; page++) {
      const offset = (page - 1) * limit;

      try {
        const data = await fetchPage(offset, limit, page);
        
        // Extrai cidades do resultado
        let cities = [];
        if (data.data) {
          if (Array.isArray(data.data)) {
            cities = data.data;
          } else {
            cities = Object.values(data.data);
          }
        }
        
        // Filtra cidades válidas (com latitude, longitude e população)
        const validCities = cities.filter(
          (city) =>
            city.latitude !== undefined &&
            city.longitude !== undefined &&
            city.population !== undefined &&
            city.population > 0
        );

        // Escreve cidades no buffer compartilhado ou acumula para fallback
        if (useSharedMemory && sharedBuffer) {
          // Escreve cada cidade no buffer compartilhado usando escrita controlada
          validCities.forEach((city) => {
            if (writeCityToSharedBuffer(city, sharedBuffer, atomicView, headerSize, totalBufferSize)) {
              citiesCollected++;
            }
          });
        } else {
          // Fallback: acumula em array local
          results.push(...validCities);
          citiesCollected = results.length;
        }

        totalCities += cities.length;

        // Envia progresso para o thread principal
        self.postMessage({
          type: "progress",
          workerId,
          page,
          totalPages: endPage - startPage + 1,
          citiesCollected: citiesCollected,
          totalCitiesInPage: cities.length,
        });

        // Rate limiting: aguarda antes da próxima requisição
        if (page < endPage) {
          await new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY_MS));
          await new Promise((resolve) => setTimeout(resolve, SAFETY_MARGIN_MS));
          
          if (page % 10 === 0) {
            self.postMessage({
              type: "progress_log",
              workerId,
              message: `Processadas ${page - startPage + 1} de ${endPage - startPage + 1} páginas`,
            });
          }
        }
      } catch (error) {
        // Envia erro mas continua processando outras páginas
        self.postMessage({
          type: "error",
          workerId,
          page,
          error: error.message,
        });
      }
    }

    // Envia resultados finais
    // Se usando memória compartilhada, não precisa enviar cidades (já estão no buffer)
    self.postMessage({
      type: "complete",
      workerId,
      cities: useSharedMemory ? [] : results, // Vazio se usando memória compartilhada
      totalCities,
    });
  } catch (error) {
    // Erro crítico
    self.postMessage({
      type: "critical_error",
      workerId,
      error: error.message,
    });
  }
};
