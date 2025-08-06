#!/usr/bin/env node

/**
 * MCP Server for LLM Agent Room Participation
 * 
 * This server provides tools that allow an LLM agent to:
 * - Join a room as a participant
 * - Leave a room
 * - Send messages to room participants
 * - Get room information
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} = require('@modelcontextprotocol/sdk/types.js');
const axios = require('axios');

class MediaSoupMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'mediasoup-agent-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.baseUrl = process.env.MEDIASOUP_SERVER_URL || 'http://localhost:5001';
    this.setupToolHandlers();
  }

  setupToolHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'join_room',
            description: 'Join a room as an LLM agent participant',
            inputSchema: {
              type: 'object',
              properties: {
                username: {
                  type: 'string',
                  description: 'Username for the agent (will be made unique if needed)',
                },
                roomId: {
                  type: 'string',
                  description: 'Room ID to join',
                },
                agentType: {
                  type: 'string',
                  description: 'Type of agent (e.g., "assistant", "moderator", "transcriber")',
                  default: 'assistant',
                },
              },
              required: ['username', 'roomId'],
            },
          },
          {
            name: 'leave_room',
            description: 'Leave a room as an LLM agent',
            inputSchema: {
              type: 'object',
              properties: {
                agentId: {
                  type: 'string',
                  description: 'Agent ID received when joining the room',
                },
                roomId: {
                  type: 'string',
                  description: 'Room ID to leave',
                },
              },
              required: ['agentId', 'roomId'],
            },
          },
          {
            name: 'send_message',
            description: 'Send a message to room participants',
            inputSchema: {
              type: 'object',
              properties: {
                agentId: {
                  type: 'string',
                  description: 'Agent ID',
                },
                roomId: {
                  type: 'string',
                  description: 'Room ID',
                },
                message: {
                  type: 'string',
                  description: 'Message to send to participants',
                },
                messageType: {
                  type: 'string',
                  description: 'Type of message (e.g., "chat", "announcement", "transcription")',
                  default: 'chat',
                },
              },
              required: ['agentId', 'roomId', 'message'],
            },
          },
          {
            name: 'get_room_info',
            description: 'Get information about a room',
            inputSchema: {
              type: 'object',
              properties: {
                roomId: {
                  type: 'string',
                  description: 'Room ID to get information about',
                },
              },
              required: ['roomId'],
            },
          },
          {
            name: 'list_participants',
            description: 'List all participants in a room',
            inputSchema: {
              type: 'object',
              properties: {
                roomId: {
                  type: 'string',
                  description: 'Room ID to list participants for',
                },
              },
              required: ['roomId'],
            },
          },
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'join_room':
            return await this.joinRoom(args);
          case 'leave_room':
            return await this.leaveRoom(args);
          case 'send_message':
            return await this.sendMessage(args);
          case 'get_room_info':
            return await this.getRoomInfo(args);
          case 'list_participants':
            return await this.listParticipants(args);
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error.message}`
        );
      }
    });
  }

  async joinRoom(args) {
    const { username, roomId, agentType = 'assistant' } = args;

    if (!username || !roomId) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Username and roomId are required'
      );
    }

    try {
      const response = await axios.post(`${this.baseUrl}/api/agent/join`, {
        username,
        roomId,
        agentType,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              agentId: response.data.agentId,
              actualUsername: response.data.username,
              roomId: response.data.roomId,
              message: `Successfully joined room ${roomId} as ${response.data.username}`,
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error.response?.data?.error || error.message;
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: errorMessage,
              message: `Failed to join room ${roomId}: ${errorMessage}`,
            }, null, 2),
          },
        ],
      };
    }
  }

  async leaveRoom(args) {
    const { agentId, roomId } = args;

    if (!agentId || !roomId) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'AgentId and roomId are required'
      );
    }

    try {
      const response = await axios.post(`${this.baseUrl}/api/agent/leave`, {
        agentId,
        roomId,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `Successfully left room ${roomId}`,
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error.response?.data?.error || error.message;
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: errorMessage,
              message: `Failed to leave room ${roomId}: ${errorMessage}`,
            }, null, 2),
          },
        ],
      };
    }
  }

  async sendMessage(args) {
    const { agentId, roomId, message, messageType = 'chat' } = args;

    if (!agentId || !roomId || !message) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'AgentId, roomId, and message are required'
      );
    }

    try {
      const response = await axios.post(`${this.baseUrl}/api/agent/message`, {
        agentId,
        roomId,
        message,
        messageType,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              messageId: response.data.messageId,
              message: 'Message sent successfully',
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error.response?.data?.error || error.message;
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: errorMessage,
              message: `Failed to send message: ${errorMessage}`,
            }, null, 2),
          },
        ],
      };
    }
  }

  async getRoomInfo(args) {
    const { roomId } = args;

    if (!roomId) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'RoomId is required'
      );
    }

    try {
      const response = await axios.get(`${this.baseUrl}/api/room/${roomId}`);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              roomInfo: response.data,
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error.response?.data?.error || error.message;
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: errorMessage,
              message: `Failed to get room info: ${errorMessage}`,
            }, null, 2),
          },
        ],
      };
    }
  }

  async listParticipants(args) {
    const { roomId } = args;

    if (!roomId) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'RoomId is required'
      );
    }

    try {
      const response = await axios.get(`${this.baseUrl}/api/room/${roomId}/participants`);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              participants: response.data.participants,
              count: response.data.count,
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error.response?.data?.error || error.message;
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: errorMessage,
              message: `Failed to list participants: ${errorMessage}`,
            }, null, 2),
          },
        ],
      };
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('MediaSoup MCP server running on stdio');
  }
}

// Start the server
const server = new MediaSoupMCPServer();
server.run().catch(console.error);
