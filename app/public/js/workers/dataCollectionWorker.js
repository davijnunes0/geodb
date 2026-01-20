/**
 * Web Worker para coleta paralela de dados da API
 * Cada worker busca um subconjunto de páginas
 * 
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API
 */

// Rate limiting: delay entre requisições para evitar saturação
// Plano BASIC da RapidAPI tem limite muito restritivo (geralmente 1 req/s)
// Delay total de 2 segundos (1.5s + 0.5s margem) garante que nunca excedemos
const REQUEST_DELAY_MS = 1500; // 1.5 segundos base entre requisições
const SAFETY_MARGIN_MS = 500; // 500ms de margem adicional = total 2s entre requisições

/**
 * Faz requisição à API com retry em caso de erro
 * @param {number} offset - Offset para paginação
 * @param {number} limit - Limite de resultados
 * @returns {Promise<Object>} Dados retornados pela API
 */
const fetchPage = async (offset, limit) => {
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
          // Aguarda tempo suficiente para API resetar o contador
          const waitTime = Math.min(10000 * (retryCount + 1), 60000); // 10s, 20s, 30s, max 60s
          console.warn(`Rate limit atingido. Aguardando ${waitTime/1000}s antes de retry ${retryCount + 1}/${maxRetries}`);
          
          // Notifica thread principal sobre rate limit
          self.postMessage({
            type: "rate_limit",
            workerId: currentWorkerId,
            waitTime: waitTime / 1000,
            page,
          });
          
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
 * Processa mensagens do thread principal
 */
let currentWorkerId = 0;

self.onmessage = async (event) => {
  const { startPage, endPage, limit, workerId } = event.data;
  currentWorkerId = workerId; // Armazena para uso em fetchPage

  try {
    const results = [];
    let totalCities = 0;

    // Processa cada página atribuída a este worker
    for (let page = startPage; page <= endPage; page++) {
      const offset = (page - 1) * limit;

      try {
        const data = await fetchPage(offset, limit);
        
        // Extrai cidades do resultado
        // A API pode retornar data como array ou objeto
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

        results.push(...validCities);
        totalCities += cities.length;

        // Envia progresso para o thread principal
        self.postMessage({
          type: "progress",
          workerId,
          page,
          totalPages: endPage - startPage + 1,
          citiesCollected: validCities.length,
          totalCitiesInPage: cities.length,
        });

        // Rate limiting: aguarda antes da próxima requisição
        // Delay aumentado para respeitar limite do plano BASIC
        if (page < endPage) {
          // Delay base entre requisições
          await new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY_MS));
          
          // Delay adicional após processar página para garantir margem de segurança
          // Isso garante que mesmo com pequenas variações de tempo, não excedemos limite
          await new Promise((resolve) => setTimeout(resolve, SAFETY_MARGIN_MS));
          
          // Log de progresso a cada 10 páginas para feedback
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
    self.postMessage({
      type: "complete",
      workerId,
      cities: results,
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
