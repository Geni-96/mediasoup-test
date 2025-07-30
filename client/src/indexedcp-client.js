// Frontend IndexedCP client configuration and utilities
// Browser-compatible implementation following official IndexedCP protocol
// Uses same chunking and upload approach as official package but adapted for browsers

// Frontend IndexedCP client configuration and utilities
// Browser-compatible implementation following official IndexedCP protocol
// Uses same chunking and upload approach as official package but adapted for browsers

/**
 * Browser-compatible IndexedCP client class
 * Follows the same protocol as the official IndexedCP package
 */
class BrowserIndexedCPClient {
  constructor(config) {
    this.config = config;
    this.db = null;
    this.dbName = 'indexcp';
    this.storeName = 'chunks';
    this.apiKey = config.apiKey || '';
  }

  async initDB() {
    if (!this.db) {
      // Use native IndexedDB for browser compatibility
      this.db = await new Promise((resolve, reject) => {
        const request = indexedDB.open(this.dbName, 1);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        
        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          if (!db.objectStoreNames.contains(this.storeName)) {
            db.createObjectStore(this.storeName, { keyPath: 'id', autoIncrement: true });
          }
        };
      });
    }
    return this.db;
  }

  async uploadChunk(serverUrl, chunkData, chunkIndex, fileName, apiKey) {
    const response = await fetch(serverUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Chunk-Index': chunkIndex.toString(),
        'X-File-Name': fileName,
        'Authorization': `Bearer ${apiKey || this.apiKey}`
      },
      body: chunkData
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Authentication failed: Invalid API key');
      }
      throw new Error(`Upload failed: ${response.statusText}`);
    }

    return response;
  }

  async uploadBlobWithChunks(blob, filename) {
    const chunkSize = 1024 * 1024; // 1MB chunks (same as official IndexedCP)
    const totalSize = blob.size;
    const totalChunks = Math.ceil(totalSize / chunkSize);
    
    // Initialize database for chunk storage
    await this.initDB();
    
    // Process the blob in chunks
    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const start = chunkIndex * chunkSize;
      const end = Math.min(start + chunkSize, totalSize);
      const chunkBlob = blob.slice(start, end);
      
      // Convert chunk to ArrayBuffer for upload
      const chunkBuffer = await chunkBlob.arrayBuffer();
      const chunkArray = new Uint8Array(chunkBuffer);
      
      // Upload chunk using IndexedCP protocol
      await this.uploadChunk(this.config.server, chunkArray, chunkIndex, filename, this.apiKey);
    }
  }
}

let indexedCPClient = null;
let indexedCPConfig = null;

/**
 * Initialize IndexedCP client with configuration
 * This function should be called at app startup
 */
async function initializeIndexedCP() {
  try {
    // Store configuration for browser-compatible usage
    indexedCPConfig = {
      server: process.env.REACT_APP_INDEXEDCP_SERVER || 'http://localhost:3000',
      apiKey: process.env.REACT_APP_INDEXEDCP_API_KEY || '',
      timeout: parseInt(process.env.REACT_APP_INDEXEDCP_TIMEOUT) || 30000
    };
    
    // Initialize the browser-compatible IndexedCP client
    indexedCPClient = new BrowserIndexedCPClient(indexedCPConfig);
    
    console.log('Frontend IndexedCP client initialized successfully (browser-compatible)');
    console.log('IndexedCP Server:', indexedCPConfig.server);
    return true;
  } catch (error) {
    console.error('Failed to initialize frontend IndexedCP client:', error.message);
    // Non-disruptive: if IndexedCP fails to initialize, we continue without it
    indexedCPClient = null;
    indexedCPConfig = null;
    return false;
  }
}

/**
 * Upload mixed audio file to IndexedCP from frontend using compatible protocol
 * @param {string} roomId - The room identifier
 * @param {string} sessionId - The session identifier
 * @param {Blob} audioBlob - The audio file blob
 * @param {string} fileExtension - The file extension (e.g., 'webm', 'wav')
 * @returns {Promise<boolean>} - Success status
 */
async function uploadMixedAudioToIndexedCP(roomId, sessionId, audioBlob, fileExtension = 'webm') {
  // If IndexedCP is not initialized, fail gracefully
  if (!indexedCPClient || !indexedCPConfig) {
    console.log('Frontend IndexedCP not initialized, skipping audio upload');
    return false;
  }

  try {
    const filename = `${roomId}-${sessionId}-audio.${fileExtension}`;
    
    console.log(`Uploading mixed audio to IndexedCP from frontend: ${filename}`);
    
    // Use browser-compatible chunked upload
    await indexedCPClient.uploadBlobWithChunks(audioBlob, filename);
    
    console.log(`Successfully uploaded mixed audio to IndexedCP from frontend: ${filename}`);
    return true;
  } catch (error) {
    console.error('Failed to upload mixed audio to IndexedCP from frontend:', error.message);
    // Non-disruptive: log error but don't throw
    return false;
  }
}

/**
 * Upload audio file using File API (alternative method)
 * @param {string} roomId - The room identifier
 * @param {string} sessionId - The session identifier
 * @param {File} audioFile - The audio file object
 * @returns {Promise<boolean>} - Success status
 */
async function uploadAudioFileToIndexedCP(roomId, sessionId, audioFile) {
  // If IndexedCP is not initialized, fail gracefully
  if (!indexedCPClient || !indexedCPConfig) {
    console.log('Frontend IndexedCP not initialized, skipping audio file upload');
    return false;
  }

  try {
    const fileExtension = audioFile.name.split('.').pop() || 'webm';
    const filename = `${roomId}-${sessionId}-audio.${fileExtension}`;
    
    console.log(`Uploading audio file to IndexedCP from frontend: ${filename}`);
    
    // Use browser-compatible chunked upload
    await indexedCPClient.uploadBlobWithChunks(audioFile, filename);
    
    console.log(`Successfully uploaded audio file to IndexedCP from frontend: ${filename}`);
    return true;
  } catch (error) {
    console.error('Failed to upload audio file to IndexedCP from frontend:', error.message);
    // Non-disruptive: log error but don't throw
    return false;
  }
}

/**
 * Check if IndexedCP client is available
 * @returns {boolean} - Whether IndexedCP client is initialized
 */
function isIndexedCPAvailable() {
  return indexedCPClient !== null && indexedCPConfig !== null;
}

/**
 * Get IndexedCP configuration (for debugging)
 * @returns {object|null} - Configuration object or null
 */
function getIndexedCPConfig() {
  if (!indexedCPConfig) {
    return null;
  }
  
  // Return basic configuration info without exposing sensitive data
  return {
    server: indexedCPConfig.server || 'not configured',
    hasApiKey: !!(indexedCPConfig.apiKey),
    timeout: indexedCPConfig.timeout || 'default',
    initialized: indexedCPClient !== null
  };
}

export {
  initializeIndexedCP,
  uploadMixedAudioToIndexedCP,
  uploadAudioFileToIndexedCP,
  isIndexedCPAvailable,
  getIndexedCPConfig
};
