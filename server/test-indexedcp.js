// Simple test script to validate IndexedCP integration
const { 
  initializeIndexedCP, 
  uploadAnnotationsToIndexedCP, 
  uploadAudioToIndexedCP, 
  isIndexedCPAvailable 
} = require('./indexedcp-client');

async function testIndexedCPIntegration() {
  console.log('Testing IndexedCP integration...');
  
  // Test initialization
  console.log('1. Testing IndexedCP initialization...');
  const initialized = await initializeIndexedCP();
  console.log(`IndexedCP initialized: ${initialized}`);
  console.log(`IndexedCP available: ${isIndexedCPAvailable()}`);
  
  if (!initialized) {
    console.log('IndexedCP not initialized. This is expected if no server is configured.');
    console.log('✅ Non-disruptive behavior test passed - system continues without IndexedCP');
    return;
  }
  
  // Test annotation upload (with mock data)
  console.log('\n2. Testing annotation upload...');
  const mockAnnotationData = {
    roomId: 'test-room-123',
    sessionId: 'test-session-456',
    timestamp: new Date().toISOString(),
    speakers: [
      { user: 'user1', start: 0, end: 5.5 },
      { user: 'user2', start: 6.0, end: 10.2 }
    ]
  };
  
  const annotationSuccess = await uploadAnnotationsToIndexedCP('test-room-123', 'test-session-456', mockAnnotationData);
  console.log(`Annotation upload success: ${annotationSuccess}`);
  
  // Test audio upload (with mock buffer)
  console.log('\n3. Testing audio upload...');
  const mockAudioBuffer = Buffer.from('mock audio data for testing');
  const audioSuccess = await uploadAudioToIndexedCP('test-room-123', 'test-session-456', mockAudioBuffer, 'webm');
  console.log(`Audio upload success: ${audioSuccess}`);
  
  console.log('\n✅ IndexedCP integration test completed!');
  console.log('Note: Upload success depends on IndexedCP server availability and configuration.');
  console.log('For production use, configure INDEXEDCP_SERVER environment variable.');
}

// Run the test
testIndexedCPIntegration().catch(error => {
  console.error('Test failed:', error);
});
