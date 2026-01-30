/**
 * Utilitário para serialização/desserialização de cidades em ArrayBuffer
 * Permite uso de memória compartilhada (SharedArrayBuffer) entre workers
 * 
 * Estrutura de cada cidade no buffer:
 * - 4 bytes: tamanho do objeto JSON serializado (Uint32)
 * - N bytes: dados JSON (UTF-8 encoded)
 * 
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Atomics
 */

/**
 * Calcula tamanho necessário do buffer para armazenar cidades
 * @param {Array} cities - Array de cidades
 * @returns {number} Tamanho em bytes necessário
 */
export const calculateBufferSize = (cities) => {
  let totalSize = 0;
  cities.forEach((city) => {
    const jsonString = JSON.stringify(city);
    const jsonBytes = new TextEncoder().encode(jsonString).length;
    totalSize += 4 + jsonBytes; // 4 bytes para tamanho + dados JSON
  });
  return totalSize;
};

/**
 * Serializa uma cidade para ArrayBuffer
 * @param {Object} city - Cidade a serializar
 * @param {number} offset - Offset no buffer
 * @param {Uint8Array} buffer - Buffer onde escrever
 * @returns {number} Novo offset após escrita
 */
export const serializeCity = (city, offset, buffer) => {
  const jsonString = JSON.stringify(city);
  const jsonBytes = new TextEncoder().encode(jsonString);
  const size = jsonBytes.length;

  // Escreve tamanho (4 bytes, little-endian)
  const view = new DataView(buffer.buffer, buffer.byteOffset + offset, 4);
  view.setUint32(0, size, true);

  // Escreve dados JSON
  buffer.set(jsonBytes, offset + 4);

  return offset + 4 + size;
};

/**
 * Desserializa uma cidade do ArrayBuffer
 * @param {number} offset - Offset no buffer
 * @param {Uint8Array} buffer - Buffer de onde ler
 * @returns {Object|null} Cidade desserializada ou null se inválida
 */
export const deserializeCity = (offset, buffer) => {
  try {
    // Lê tamanho (4 bytes, little-endian)
    const view = new DataView(buffer.buffer, buffer.byteOffset + offset, 4);
    const size = view.getUint32(0, true);

    if (size === 0 || size > buffer.length - offset - 4) {
      return null; // Tamanho inválido
    }

    // Lê dados JSON
    const jsonBytes = buffer.slice(offset + 4, offset + 4 + size);
    const jsonString = new TextDecoder().decode(jsonBytes);
    return JSON.parse(jsonString);
  } catch (error) {
    console.error("Erro ao desserializar cidade:", error);
    return null;
  }
};

/**
 * Serializa array de cidades para ArrayBuffer
 * @param {Array} cities - Array de cidades
 * @returns {ArrayBuffer} Buffer com cidades serializadas
 */
export const serializeCities = (cities) => {
  const totalSize = calculateBufferSize(cities);
  const buffer = new ArrayBuffer(totalSize);
  const uint8Array = new Uint8Array(buffer);

  let offset = 0;
  cities.forEach((city) => {
    offset = serializeCity(city, offset, uint8Array);
  });

  return buffer;
};

/**
 * Desserializa array de cidades do ArrayBuffer
 * @param {ArrayBuffer|SharedArrayBuffer} buffer - Buffer com cidades serializadas
 * @param {number} maxCities - Número máximo de cidades a ler (opcional)
 * @returns {Array} Array de cidades desserializadas
 */
export const deserializeCities = (buffer, maxCities = Infinity) => {
  const uint8Array = new Uint8Array(buffer);
  const cities = [];
  let offset = 0;
  let count = 0;

  while (offset < uint8Array.length && count < maxCities) {
    // Verifica se há espaço suficiente para ler o tamanho
    if (offset + 4 > uint8Array.length) {
      break;
    }

    const city = deserializeCity(offset, uint8Array);
    if (!city) {
      break; // Cidade inválida, para leitura
    }

    cities.push(city);
    count++;

    // Calcula próximo offset
    const view = new DataView(buffer, offset, 4);
    const size = view.getUint32(0, true);
    offset += 4 + size;
  }

  return cities;
};

/**
 * Calcula tamanho estimado necessário para armazenar N cidades
 * Baseado em tamanho médio de cidade (~200 bytes)
 * @param {number} numCities - Número de cidades
 * @returns {number} Tamanho estimado em bytes
 */
export const estimateBufferSize = (numCities) => {
  const avgCitySize = 200; // bytes médios por cidade
  const overhead = 4; // 4 bytes para tamanho
  return numCities * (avgCitySize + overhead) * 1.2; // 20% de margem
};
