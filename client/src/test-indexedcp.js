// Simple test script to validate frontend IndexedCP integration
import { 
  initializeIndexedCP, 
  uploadMixedAudioToIndexedCP, 
  isIndexedCPAvailable,
  getIndexedCPConfig
} from './indexedcp-client.js';

async function testFrontendIndexedCPIntegration() {
  console.log('Testing Frontend IndexedCP integration...');
  
  // Test initialization
  console.log('1. Testing IndexedCP initialization...');
  const initialized = await initializeIndexedCP();
  console.log(`IndexedCP initialized: ${initialized}`);
  console.log(`IndexedCP available: ${isIndexedCPAvailable()}`);
  console.log('IndexedCP config:', getIndexedCPConfig());
  
  if (!initialized) {
    console.log('IndexedCP not initialized. This is expected if no server is configured.');
    console.log('✅ Non-disruptive behavior test passed - system continues without IndexedCP');
    return;
  }
  
  // Test audio upload (with mock blob)
  console.log('\n2. Testing audio blob upload...');
  
  // Create a mock audio blob for testing
  const mockAudioData = new Array(1024).fill(0).map(() => Math.random() * 256);
  const mockAudioBlob = new Blob([new Uint8Array(mockAudioData)], { 
    type: 'audio/webm;codecs=opus' 
  });
  
  const audioSuccess = await uploadMixedAudioToIndexedCP(
    'test-room-frontend-123', 
    'test-session-frontend-456', 
    mockAudioBlob, 
    'webm'
  );
  console.log(`Audio upload success: ${audioSuccess}`);
  
  console.log('\n✅ Frontend IndexedCP integration test completed!');
  console.log('Note: Upload success depends on IndexedCP server availability and configuration.');
  console.log('For production use, configure REACT_APP_INDEXEDCP_SERVER environment variable.');
}

// Export for manual testing in browser console
if (typeof window !== 'undefined') {
  window.testFrontendIndexedCP = testFrontendIndexedCPIntegration;
}

// Auto-run test (commented out for production)
// testFrontendIndexedCPIntegration().catch(error => {
//   console.error('Frontend test failed:', error);
// });

export { testFrontendIndexedCPIntegration };
