// IndexedCP HTTP client configuration and utilities
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
require('dotenv').config();

let indexedCPServiceUrl = null;

/**
 * Initialize IndexedCP HTTP client with configuration
 * This function should be called at server startup
 */
async function initializeIndexedCP() {
  try {
    // Set up IndexedCP service URL from environment variable
    indexedCPServiceUrl = process.env.INDEXEDCP_SERVER || 'http://localhost:3000';
    
    // Test connection to IndexedCP service
    const response = await axios.get(`${indexedCPServiceUrl}/health`, { 
      timeout: 5000 
    });
    
    console.log('IndexedCP service connection established:', indexedCPServiceUrl);
    return true;
  } catch (error) {
    console.warn('IndexedCP service not available:', error.message);
    console.warn('Will continue without IndexedCP integration');
    // Non-disruptive: if IndexedCP service is unavailable, we continue without it
    indexedCPServiceUrl = null;
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
  // If IndexedCP service is not available, fail gracefully
  if (!indexedCPServiceUrl) {
    console.log('IndexedCP service not available, skipping annotation upload');
    return false;
  }

  let tempFilePath = null;
  try {
    const filename = `speaker-log-${roomId}.json`;
    
    // Create temporary directory for IndexedCP uploads
    const tempDir = path.join(__dirname, '../temp-indexedcp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // Write data to temporary file
    tempFilePath = path.join(tempDir, filename);
    fs.writeFileSync(tempFilePath, JSON.stringify(annotationData, null, 2));
    
    console.log(`Uploading annotations to IndexedCP: ${filename}`);
    
    // Create form data for multipart upload
    const formData = new FormData();
    formData.append('file', fs.createReadStream(tempFilePath), {
      filename: filename,
      contentType: 'application/json'
    });
    formData.append('roomId', roomId);
    formData.append('sessionId', sessionId);
    formData.append('type', 'annotations');
    
    // Send HTTP POST request to IndexedCP service
    const response = await axios.post(`${indexedCPServiceUrl}/upload`, formData, {
      headers: {
        ...formData.getHeaders(),
      },
      timeout: 30000, // 30 second timeout
      maxContentLength: 100 * 1024 * 1024, // 100MB limit
    });
    
    console.log(`Successfully uploaded annotations to IndexedCP: ${filename}`, response.data);
    return true;
  } catch (error) {
    console.error('Failed to upload annotations to IndexedCP:', error.message);
    if (error.response) {
      console.error('IndexedCP service response:', error.response.status, error.response.data);
    }
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
  // If IndexedCP service is not available, fail gracefully
  if (!indexedCPServiceUrl) {
    console.log('IndexedCP service not available, skipping audio upload');
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
    
    // Create form data for multipart upload
    const formData = new FormData();
    formData.append('file', fs.createReadStream(tempFilePath), {
      filename: filename,
      contentType: getContentType(fileExtension)
    });
    formData.append('roomId', roomId);
    formData.append('sessionId', sessionId);
    formData.append('type', 'audio');
    
    // Send HTTP POST request to IndexedCP service
    const response = await axios.post(`${indexedCPServiceUrl}/upload`, formData, {
      headers: {
        ...formData.getHeaders(),
      },
      timeout: 60000, // 60 second timeout for audio files
      maxContentLength: 500 * 1024 * 1024, // 500MB limit for audio
    });
    
    console.log(`Successfully uploaded audio to IndexedCP: ${filename}`, response.data);
    return true;
  } catch (error) {
    console.error('Failed to upload audio to IndexedCP:', error.message);
    if (error.response) {
      console.error('IndexedCP service response:', error.response.status, error.response.data);
    }
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
  // If IndexedCP service is not available, fail gracefully
  if (!indexedCPServiceUrl) {
    console.log('IndexedCP service not available, skipping metadata upload');
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
    
    // Create form data for multipart upload
    const formData = new FormData();
    formData.append('file', fs.createReadStream(tempFilePath), {
      filename: filename,
      contentType: 'application/json'
    });
    formData.append('roomId', roomId);
    formData.append('sessionId', sessionId);
    formData.append('type', 'metadata');
    
    // Send HTTP POST request to IndexedCP service
    const response = await axios.post(`${indexedCPServiceUrl}/upload`, formData, {
      headers: {
        ...formData.getHeaders(),
      },
      timeout: 30000, // 30 second timeout
      maxContentLength: 10 * 1024 * 1024, // 10MB limit for metadata
    });
    
    console.log(`Successfully uploaded metadata to IndexedCP: ${filename}`, response.data);
    return true;
  } catch (error) {
    console.error('Failed to upload metadata to IndexedCP:', error.message);
    if (error.response) {
      console.error('IndexedCP service response:', error.response.status, error.response.data);
    }
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
 * Check if IndexedCP service is available
 * @returns {boolean} - Whether IndexedCP service is available
 */
function isIndexedCPAvailable() {
  return indexedCPServiceUrl !== null;
}

/**
 * Helper function to determine content type based on file extension
 * @param {string} extension - File extension
 * @returns {string} - MIME type
 */
function getContentType(extension) {
  const mimeTypes = {
    'webm': 'audio/webm',
    'wav': 'audio/wav',
    'mp3': 'audio/mpeg',
    'mp4': 'audio/mp4',
    'json': 'application/json'
  };
  return mimeTypes[extension.toLowerCase()] || 'application/octet-stream';
}

module.exports = {
  initializeIndexedCP,
  uploadAnnotationsToIndexedCP,
  uploadAudioToIndexedCP,
  uploadMetadataToIndexedCP,
  isIndexedCPAvailable
};
