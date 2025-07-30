// Frontend IndexedCP client configuration and utilities
// Browser-compatible version using fetch API instead of Node.js IndexedCP client

let indexedCPConfig = null;

/**
 * Initialize IndexedCP client with configuration
 * This function should be called at app startup
 */
async function initializeIndexedCP() {
  try {
    // Store configuration for browser-based uploads
    indexedCPConfig = {
      server: process.env.REACT_APP_INDEXEDCP_SERVER || 'http://localhost:3000',
      apiKey: process.env.REACT_APP_INDEXEDCP_API_KEY || '',
      timeout: parseInt(process.env.REACT_APP_INDEXEDCP_TIMEOUT) || 30000
    };
    
    console.log('Frontend IndexedCP client initialized successfully');
    console.log('IndexedCP Server:', indexedCPConfig.server);
    return true;
  } catch (error) {
    console.error('Failed to initialize frontend IndexedCP client:', error.message);
    // Non-disruptive: if IndexedCP fails to initialize, we continue without it
    indexedCPConfig = null;
    return false;
  }
}

/**
 * Upload mixed audio file to IndexedCP from frontend using fetch API
 * @param {string} roomId - The room identifier
 * @param {string} sessionId - The session identifier
 * @param {Blob} audioBlob - The audio file blob
 * @param {string} fileExtension - The file extension (e.g., 'webm', 'wav')
 * @returns {Promise<boolean>} - Success status
 */
async function uploadMixedAudioToIndexedCP(roomId, sessionId, audioBlob, fileExtension = 'webm') {
  // If IndexedCP is not initialized, fail gracefully
  if (!indexedCPConfig) {
    console.log('Frontend IndexedCP not initialized, skipping audio upload');
    return false;
  }

  try {
    const filename = `${roomId}-${sessionId}-audio.${fileExtension}`;
    
    console.log(`Uploading mixed audio to IndexedCP from frontend: ${filename}`);
    
    // Create FormData for file upload
    const formData = new FormData();
    formData.append('file', audioBlob, filename);
    
    // Add metadata
    formData.append('roomId', roomId);
    formData.append('sessionId', sessionId);
    formData.append('type', 'audio');
    formData.append('source', 'frontend');
    
    // Prepare headers
    const headers = {};
    if (indexedCPConfig.apiKey) {
      headers['Authorization'] = `Bearer ${indexedCPConfig.apiKey}`;
    }
    
    // Upload using fetch API
    const response = await fetch(`${indexedCPConfig.server}/upload`, {
      method: 'POST',
      headers: headers,
      body: formData,
      timeout: indexedCPConfig.timeout
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.json();
    console.log(`Successfully uploaded mixed audio to IndexedCP from frontend: ${filename}`, result);
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
  if (!indexedCPConfig) {
    console.log('Frontend IndexedCP not initialized, skipping audio file upload');
    return false;
  }

  try {
    const fileExtension = audioFile.name.split('.').pop() || 'webm';
    const filename = `${roomId}-${sessionId}-audio.${fileExtension}`;
    
    console.log(`Uploading audio file to IndexedCP from frontend: ${filename}`);
    
    // Create FormData for file upload
    const formData = new FormData();
    formData.append('file', audioFile, filename);
    
    // Add metadata
    formData.append('roomId', roomId);
    formData.append('sessionId', sessionId);
    formData.append('type', 'audio');
    formData.append('source', 'frontend');
    
    // Prepare headers
    const headers = {};
    if (indexedCPConfig.apiKey) {
      headers['Authorization'] = `Bearer ${indexedCPConfig.apiKey}`;
    }
    
    // Upload using fetch API
    const response = await fetch(`${indexedCPConfig.server}/upload`, {
      method: 'POST',
      headers: headers,
      body: formData,
      timeout: indexedCPConfig.timeout
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.json();
    console.log(`Successfully uploaded audio file to IndexedCP from frontend: ${filename}`, result);
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
  return indexedCPConfig !== null;
}

/**
 * Get IndexedCP configuration (for debugging)
 * @returns {object|null} - Configuration object or null
 */
function getIndexedCPConfig() {
  return indexedCPConfig;
}

export {
  initializeIndexedCP,
  uploadMixedAudioToIndexedCP,
  uploadAudioFileToIndexedCP,
  isIndexedCPAvailable,
  getIndexedCPConfig
};
