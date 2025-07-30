// IndexedCP client configuration and utilities
const { client: IndexedCPClient } = require('indexedcp');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

let indexedCPClient = null;

/**
 * Initialize IndexedCP client with configuration
 * This function should be called at server startup
 */
async function initializeIndexedCP() {
  try {
    // Initialize IndexedCP client (constructor takes no parameters)
    indexedCPClient = new IndexedCPClient();
    
    // Configuration is handled via environment variables and API key setting
    const apiKey = process.env.INDEXEDCP_API_KEY || '';
    if (apiKey) {
      indexedCPClient.apiKey = apiKey;
    }
    
    console.log('IndexedCP client initialized successfully');
    console.log('IndexedCP server will be specified per upload operation');
    return true;
  } catch (error) {
    console.error('Failed to initialize IndexedCP client:', error.message);
    // Non-disruptive: if IndexedCP fails to initialize, we continue without it
    indexedCPClient = null;
    return false;
  }
}

/**
 * Upload speaker annotations to IndexedCP
 * @param {string} roomId - The room identifier
 * @param {string} sessionId - The session identifier
 * @param {Object} annotationData - The speaker diarization data
 * @returns {Promise<boolean>} - Success status
 */
async function uploadAnnotationsToIndexedCP(roomId, sessionId, annotationData) {
  // If IndexedCP is not initialized, fail gracefully
  if (!indexedCPClient) {
    console.log('IndexedCP not initialized, skipping annotation upload');
    return false;
  }

  let tempFilePath = null;
  try {
    const filename = `${roomId}-${sessionId}-annotations.json`;
    
    // Create temporary directory for IndexedCP uploads
    const tempDir = path.join(__dirname, '../temp-indexedcp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // Write data to temporary file
    tempFilePath = path.join(tempDir, filename);
    fs.writeFileSync(tempFilePath, JSON.stringify(annotationData, null, 2));
    
    console.log(`Uploading annotations to IndexedCP: ${filename}`);
    
    // Use bufferAndUpload method with the temporary file path
    const serverUrl = process.env.INDEXEDCP_SERVER || 'http://localhost:8080';
    await indexedCPClient.bufferAndUpload(tempFilePath, serverUrl);
    
    console.log(`Successfully uploaded annotations to IndexedCP: ${filename}`);
    return true;
  } catch (error) {
    console.error('Failed to upload annotations to IndexedCP:', error.message);
    // Non-disruptive: log error but don't throw
    return false;
  } finally {
    // Clean up temporary file
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (cleanupError) {
        console.warn('Failed to cleanup temporary file:', tempFilePath, cleanupError.message);
      }
    }
  }
}

/**
 * Upload audio file to IndexedCP
 * @param {string} roomId - The room identifier
 * @param {string} sessionId - The session identifier
 * @param {Buffer} audioBuffer - The audio file buffer
 * @param {string} fileExtension - The file extension (e.g., 'webm', 'wav')
 * @returns {Promise<boolean>} - Success status
 */
async function uploadAudioToIndexedCP(roomId, sessionId, audioBuffer, fileExtension = 'webm') {
  // If IndexedCP is not initialized, fail gracefully
  if (!indexedCPClient) {
    console.log('IndexedCP not initialized, skipping audio upload');
    return false;
  }

  let tempFilePath = null;
  try {
    const filename = `${roomId}-${sessionId}-audio.${fileExtension}`;
    
    // Create temporary directory for IndexedCP uploads
    const tempDir = path.join(__dirname, '../temp-indexedcp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // Write audio buffer to temporary file
    tempFilePath = path.join(tempDir, filename);
    fs.writeFileSync(tempFilePath, audioBuffer);
    
    console.log(`Uploading audio to IndexedCP: ${filename}`);
    
    // Use bufferAndUpload method with the temporary file path
    const serverUrl = process.env.INDEXEDCP_SERVER || 'http://localhost:8080';
    await indexedCPClient.bufferAndUpload(tempFilePath, serverUrl);
    
    console.log(`Successfully uploaded audio to IndexedCP: ${filename}`);
    return true;
  } catch (error) {
    console.error('Failed to upload audio to IndexedCP:', error.message);
    // Non-disruptive: log error but don't throw
    return false;
  } finally {
    // Clean up temporary file
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (cleanupError) {
        console.warn('Failed to cleanup temporary file:', tempFilePath, cleanupError.message);
      }
    }
  }
}

/**
 * Upload session metadata to IndexedCP
 * @param {string} roomId - The room identifier
 * @param {string} sessionId - The session identifier
 * @param {Object} metadata - Session metadata (participants, duration, etc.)
 * @returns {Promise<boolean>} - Success status
 */
async function uploadMetadataToIndexedCP(roomId, sessionId, metadata) {
  // If IndexedCP is not initialized, fail gracefully
  if (!indexedCPClient) {
    console.log('IndexedCP not initialized, skipping metadata upload');
    return false;
  }

  let tempFilePath = null;
  try {
    const filename = `${roomId}-${sessionId}-metadata.json`;
    
    // Create temporary directory for IndexedCP uploads
    const tempDir = path.join(__dirname, '../temp-indexedcp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // Write metadata to temporary file
    tempFilePath = path.join(tempDir, filename);
    fs.writeFileSync(tempFilePath, JSON.stringify(metadata, null, 2));
    
    console.log(`Uploading metadata to IndexedCP: ${filename}`);
    
    // Use bufferAndUpload method with the temporary file path
    const serverUrl = process.env.INDEXEDCP_SERVER || 'http://localhost:8080';
    await indexedCPClient.bufferAndUpload(tempFilePath, serverUrl);
    
    console.log(`Successfully uploaded metadata to IndexedCP: ${filename}`);
    return true;
  } catch (error) {
    console.error('Failed to upload metadata to IndexedCP:', error.message);
    // Non-disruptive: log error but don't throw
    return false;
  } finally {
    // Clean up temporary file
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (cleanupError) {
        console.warn('Failed to cleanup temporary file:', tempFilePath, cleanupError.message);
      }
    }
  }
}

/**
 * Check if IndexedCP client is available
 * @returns {boolean} - Whether IndexedCP client is initialized
 */
function isIndexedCPAvailable() {
  return indexedCPClient !== null;
}

module.exports = {
  initializeIndexedCP,
  uploadAnnotationsToIndexedCP,
  uploadAudioToIndexedCP,
  uploadMetadataToIndexedCP,
  isIndexedCPAvailable
};
