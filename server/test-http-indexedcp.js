#!/usr/bin/env node

// Test script for HTTP-based IndexedCP client
const { 
  initializeIndexedCP, 
  uploadAnnotationsToIndexedCP, 
  uploadMetadataToIndexedCP,
  isIndexedCPAvailable 
} = require('./indexedcp-client');

async function testIndexedCPIntegration() {
  console.log('🧪 Testing HTTP-based IndexedCP integration...\n');

  // Test 1: Initialize IndexedCP service connection
  console.log('1. Testing IndexedCP service initialization...');
  const initSuccess = await initializeIndexedCP();
  console.log(`   Result: ${initSuccess ? '✅ Success' : '❌ Failed'}`);
  console.log(`   Service available: ${isIndexedCPAvailable()}\n`);

  if (!isIndexedCPAvailable()) {
    console.log('⚠️  IndexedCP service not available. This is expected if the service is not running.');
    console.log('   The application will continue to work normally without IndexedCP integration.\n');
    return;
  }

  // Test 2: Upload test annotations
  console.log('2. Testing annotation upload...');
  const testAnnotations = {
    roomId: 'test-room-123',
    sessionId: 'test-session-456',
    speakers: [
      { id: 'speaker1', name: 'Test Speaker 1', segments: [{ start: 0, end: 5, text: 'Hello world' }] },
      { id: 'speaker2', name: 'Test Speaker 2', segments: [{ start: 5, end: 10, text: 'How are you?' }] }
    ],
    timestamp: new Date().toISOString()
  };

  const annotationSuccess = await uploadAnnotationsToIndexedCP('test-room-123', 'test-session-456', testAnnotations);
  console.log(`   Result: ${annotationSuccess ? '✅ Success' : '❌ Failed'}\n`);

  // Test 3: Upload test metadata
  console.log('3. Testing metadata upload...');
  const testMetadata = {
    roomId: 'test-room-123',
    sessionId: 'test-session-456',
    participants: ['user1', 'user2'],
    duration: 120,
    recordingStart: new Date().toISOString(),
    audioCodec: 'webm',
    sampleRate: 48000
  };

  const metadataSuccess = await uploadMetadataToIndexedCP('test-room-123', 'test-session-456', testMetadata);
  console.log(`   Result: ${metadataSuccess ? '✅ Success' : '❌ Failed'}\n`);

  console.log('🎉 Test completed!');
  console.log('📝 Note: If uploads failed, ensure the IndexedCP service is running on the configured port.');
}

// Run the test
testIndexedCPIntegration().catch(error => {
  console.error('❌ Test failed with error:', error.message);
  process.exit(1);
});
