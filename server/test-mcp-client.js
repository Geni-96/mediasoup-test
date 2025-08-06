#!/usr/bin/env node

/**
 * Simple MCP Client for Testing Agent Room Participation
 * 
 * This script demonstrates how to use the MCP tools to:
 * - Join a room as an agent
 * - Send messages to participants
 * - Leave the room
 */

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const { spawn } = require('child_process');

class MediaSoupMCPClient {
  constructor() {
    this.client = null;
    this.agentId = null;
    this.currentRoom = null;
  }

  async connect() {
    // Start the MCP server
    const serverProcess = spawn('node', ['./mcp-server.js'], {
      stdio: ['pipe', 'pipe', 'inherit'],
      cwd: __dirname
    });

    const transport = new StdioClientTransport({
      reader: serverProcess.stdout,
      writer: serverProcess.stdin
    });

    this.client = new Client(
      {
        name: 'mediasoup-test-client',
        version: '1.0.0'
      },
      {
        capabilities: {}
      }
    );

    await this.client.connect(transport);
    console.log('Connected to MCP server');
  }

  async listTools() {
    const response = await this.client.request(
      { method: 'tools/list' },
      { method: 'tools/list' }
    );
    console.log('Available tools:', response.tools.map(t => t.name));
    return response.tools;
  }

  async joinRoom(username, roomId, agentType = 'assistant') {
    try {
      const response = await this.client.request(
        {
          method: 'tools/call',
          params: {
            name: 'join_room',
            arguments: {
              username,
              roomId,
              agentType
            }
          }
        }
      );

      const result = JSON.parse(response.content[0].text);
      if (result.success) {
        this.agentId = result.agentId;
        this.currentRoom = result.roomId;
        console.log(`✅ Successfully joined room ${roomId} as ${result.actualUsername}`);
        console.log(`   Agent ID: ${this.agentId}`);
        return result;
      } else {
        console.error(`❌ Failed to join room: ${result.error}`);
        return null;
      }
    } catch (error) {
      console.error('Error joining room:', error.message);
      return null;
    }
  }

  async sendMessage(message, messageType = 'chat') {
    if (!this.agentId || !this.currentRoom) {
      console.error('❌ Not connected to any room');
      return null;
    }

    try {
      const response = await this.client.request(
        {
          method: 'tools/call',
          params: {
            name: 'send_message',
            arguments: {
              agentId: this.agentId,
              roomId: this.currentRoom,
              message,
              messageType
            }
          }
        }
      );

      const result = JSON.parse(response.content[0].text);
      if (result.success) {
        console.log(`✅ Message sent: "${message}"`);
        return result;
      } else {
        console.error(`❌ Failed to send message: ${result.error}`);
        return null;
      }
    } catch (error) {
      console.error('Error sending message:', error.message);
      return null;
    }
  }

  async getRoomInfo(roomId) {
    try {
      const response = await this.client.request(
        {
          method: 'tools/call',
          params: {
            name: 'get_room_info',
            arguments: {
              roomId: roomId || this.currentRoom
            }
          }
        }
      );

      const result = JSON.parse(response.content[0].text);
      if (result.success) {
        console.log('📊 Room Info:', result.roomInfo);
        return result.roomInfo;
      } else {
        console.error(`❌ Failed to get room info: ${result.error}`);
        return null;
      }
    } catch (error) {
      console.error('Error getting room info:', error.message);
      return null;
    }
  }

  async listParticipants(roomId) {
    try {
      const response = await this.client.request(
        {
          method: 'tools/call',
          params: {
            name: 'list_participants',
            arguments: {
              roomId: roomId || this.currentRoom
            }
          }
        }
      );

      const result = JSON.parse(response.content[0].text);
      if (result.success) {
        console.log('👥 Participants:', result.participants);
        console.log(`   Total: ${result.count} (${result.humanCount} humans, ${result.agentCount} agents)`);
        return result;
      } else {
        console.error(`❌ Failed to list participants: ${result.error}`);
        return null;
      }
    } catch (error) {
      console.error('Error listing participants:', error.message);
      return null;
    }
  }

  async leaveRoom() {
    if (!this.agentId || !this.currentRoom) {
      console.error('❌ Not connected to any room');
      return null;
    }

    try {
      const response = await this.client.request(
        {
          method: 'tools/call',
          params: {
            name: 'leave_room',
            arguments: {
              agentId: this.agentId,
              roomId: this.currentRoom
            }
          }
        }
      );

      const result = JSON.parse(response.content[0].text);
      if (result.success) {
        console.log(`✅ Successfully left room ${this.currentRoom}`);
        this.agentId = null;
        this.currentRoom = null;
        return result;
      } else {
        console.error(`❌ Failed to leave room: ${result.error}`);
        return null;
      }
    } catch (error) {
      console.error('Error leaving room:', error.message);
      return null;
    }
  }
}

// Example usage
async function runExample() {
  const client = new MediaSoupMCPClient();
  
  try {
    await client.connect();
    await client.listTools();

    // Example workflow
    const roomId = process.argv[2] || 'test-room-' + Math.random().toString(36).substring(2, 8);
    const agentName = process.argv[3] || 'Assistant';

    console.log(`\n🤖 Starting agent workflow for room: ${roomId}`);
    
    // Join room
    const joinResult = await client.joinRoom(agentName, roomId, 'assistant');
    if (!joinResult) {
      console.log('❌ Failed to join room, exiting');
      return;
    }

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Get room info
    await client.getRoomInfo();
    await client.listParticipants();

    // Send some messages
    await client.sendMessage('Hello everyone! I am an AI assistant here to help.');
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    await client.sendMessage('I can help with transcription, note-taking, and answering questions.', 'announcement');
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Stay in room for a while
    console.log('\n⏳ Staying in room for 30 seconds...');
    console.log('   You can join the room at: http://localhost:3000?roomId=' + roomId);
    await new Promise(resolve => setTimeout(resolve, 30000));

    // Leave room
    await client.leaveRoom();
    
    console.log('\n✨ Example completed');
  } catch (error) {
    console.error('Example failed:', error);
  } finally {
    process.exit(0);
  }
}

// Run if called directly
if (require.main === module) {
  runExample().catch(console.error);
}

module.exports = MediaSoupMCPClient;
