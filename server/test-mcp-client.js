#!/usr/bin/env node

/**
 * Simple HTTP-based MCP Client for Testing Agent Room Participation
 */

const axios = require('axios');

class MediaSoupMCPClient {
  constructor() {
    this.mcpServerUrl = 'http://localhost:5002';
    this.sessionId = null;
    this.currentRoom = null;
  }

  async connect() {
    try {
      console.log('Initializing MCP HTTP client...');
      
      const initResponse = await axios.post(`${this.mcpServerUrl}/mcp`, {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'test-client',
            version: '1.0.0'
          }
        }
      });

      this.sessionId = initResponse.headers['x-session-id'];
      console.log('Connected to MCP server via HTTP');
      
      return true;
    } catch (error) {
      console.error('Failed to connect:', error.message);
      return false;
    }
  }

  async listTools() {
    const response = await axios.post(`${this.mcpServerUrl}/mcp`, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {}
    }, {
      headers: this.sessionId ? { 'X-Session-Id': this.sessionId } : {}
    });
    
    console.log('Available tools:', response.data.result.tools.map(t => t.name));
    return response.data.result.tools;
  }

  async joinRoom(agentName, roomId) {
    try {
      const response = await axios.post(`${this.mcpServerUrl}/mcp`, {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'join_room',
          arguments: {
            agentName,
            roomId
          }
        }
      }, {
        headers: this.sessionId ? { 'X-Session-Id': this.sessionId } : {}
      });

      const result = JSON.parse(response.data.result.content[0].text);
      if (result.success) {
        this.currentRoom = roomId;
        console.log(`Successfully joined room ${roomId} as ${agentName}`);
        return result;
      } else {
        console.error(`Failed to join room: ${result.error}`);
        return null;
      }
    } catch (error) {
      console.error('Error joining room:', error.response?.data || error.message);
      return null;
    }
  }
}

// Test scenario
async function runTest() {
  const client = new MediaSoupMCPClient();
  const testRoomId = 'test-room-' + Date.now();
  
  try {
    console.log('=== MCP Agent Test Scenario ===');
    const connected = await client.connect();
    if (!connected) {
      throw new Error('Failed to connect to MCP server');
    }

    console.log('\n--- Available Tools ---');
    await client.listTools();

    console.log('\n--- Joining Room ---');
    await client.joinRoom('Test Agent', testRoomId);

    console.log('\n=== Test Completed ===');

  } catch (error) {
    console.error('\n=== Test Failed ===');
    console.error('Error:', error.message);
  }
}

// Run the test if this script is executed directly
if (require.main === module) {
  runTest().catch(console.error);
}

module.exports = { MediaSoupMCPClient };
