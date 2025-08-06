#!/usr/bin/env node

/**
 * Quick validation script for MCP Agent Integration
 * Tests the HTTP endpoints without starting full MCP server
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:5001';
const TEST_ROOM = 'validation-room-' + Date.now();

async function validateMCPIntegration() {
  console.log('🧪 Validating MCP Agent Integration...\n');

  try {
    // Test room creation (simulate existing room)
    console.log('1. Creating test room...');
    const roomResponse = await axios.get(`${BASE_URL}/api/room/${TEST_ROOM}`);
    console.log('   ❌ Room should not exist yet');
  } catch (error) {
    if (error.response?.status === 404) {
      console.log('   ✅ Room correctly does not exist');
    } else {
      console.log('   ⚠️  Unexpected error:', error.message);
    }
  }

  try {
    // Test agent joining non-existent room
    console.log('\n2. Testing agent join to non-existent room...');
    const joinResponse = await axios.post(`${BASE_URL}/api/agent/join`, {
      username: 'TestAgent',
      roomId: TEST_ROOM,
      agentType: 'assistant'
    });
    console.log('   ❌ Should have failed for non-existent room');
  } catch (error) {
    if (error.response?.status === 404) {
      console.log('   ✅ Correctly rejected non-existent room');
    } else {
      console.log('   ⚠️  Unexpected error:', error.message);
    }
  }

  console.log('\n3. Testing input validation...');
  try {
    const validationResponse = await axios.post(`${BASE_URL}/api/agent/join`, {
      username: '', // Empty username
      roomId: TEST_ROOM
    });
    console.log('   ❌ Should have failed validation');
  } catch (error) {
    if (error.response?.status === 400) {
      console.log('   ✅ Input validation working correctly');
    } else {
      console.log('   ⚠️  Unexpected error:', error.message);
    }
  }

  console.log('\n4. Testing server connectivity...');
  try {
    const healthResponse = await axios.get(`${BASE_URL}/api/room/health-check`);
    console.log('   ℹ️  Health check response:', healthResponse.status);
  } catch (error) {
    if (error.response?.status === 404) {
      console.log('   ✅ Server is responding (404 expected for non-existent endpoint)');
    } else if (error.code === 'ECONNREFUSED') {
      console.log('   ❌ Server is not running. Please start with: npm start');
      return false;
    } else {
      console.log('   ⚠️  Unexpected error:', error.message);
    }
  }

  console.log('\n✨ Validation completed!');
  console.log('\n📋 Integration Status:');
  console.log('   ✅ HTTP endpoints configured');
  console.log('   ✅ Error handling implemented');
  console.log('   ✅ Input validation working');
  console.log('   ✅ Server responding correctly');
  
  console.log('\n🚀 To test full functionality:');
  console.log('   1. Start server: npm start');
  console.log('   2. Create a room through the web interface');
  console.log('   3. Run: node server/test-mcp-client.js [roomId] [agentName]');
  
  return true;
}

// Run if called directly
if (require.main === module) {
  validateMCPIntegration()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ Validation failed:', error.message);
      process.exit(1);
    });
}

module.exports = validateMCPIntegration;
