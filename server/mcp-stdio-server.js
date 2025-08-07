#!/usr/bin/env node

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const axios = require('axios');

// MediaSoup server URL
const MEDIASOUP_SERVER_URL = process.env.MEDIASOUP_SERVER_URL || 'http://localhost:5001';

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

    this.setupToolHandlers();
  }

  setupToolHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'join_room',
            description: 'Join a MediaSoup room as an agent participant',
            inputSchema: {
              type: 'object',
              properties: {
                roomId: {
                  type: 'string',
                  description: 'The ID of the room to join'
                },
                agentName: {
                  type: 'string', 
                  description: 'The name of the agent (optional, defaults to "LLM Agent")'
                }
              },
              required: ['roomId']
            }
          },
          {
            name: 'leave_room',
            description: 'Leave a MediaSoup room',
            inputSchema: {
              type: 'object',
              properties: {
                roomId: {
                  type: 'string',
                  description: 'The ID of the room to leave'
                }
              },
              required: ['roomId']
            }
          },
          {
            name: 'send_message',
            description: 'Send a message to all participants in a room',
            inputSchema: {
              type: 'object',
              properties: {
                roomId: {
                  type: 'string',
                  description: 'The ID of the room'
                },
                message: {
                  type: 'string',
                  description: 'The message to send'
                }
              },
              required: ['roomId', 'message']
            }
          },
          {
            name: 'get_room_info',
            description: 'Get information about a room',
            inputSchema: {
              type: 'object',
              properties: {
                roomId: {
                  type: 'string',
                  description: 'The ID of the room'
                }
              },
              required: ['roomId']
            }
          },
          {
            name: 'list_participants',
            description: 'List all participants in a room',
            inputSchema: {
              type: 'object',
              properties: {
                roomId: {
                  type: 'string',
                  description: 'The ID of the room'
                }
              },
              required: ['roomId']
            }
          }
        ]
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
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: error.message,
                message: `Tool ${name} failed: ${error.message}`
              }, null, 2)
            }
          ],
          isError: true
        };
      }
    });
  }

  async joinRoom(args) {
    try {
      const { roomId, agentName = 'LLM Agent' } = args;
      
      const response = await axios.post(`${MEDIASOUP_SERVER_URL}/api/agent/join`, {
        roomId,
        username: agentName
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              data: response.data,
              message: `Successfully joined room ${roomId} as ${agentName}`
            }, null, 2)
          }
        ]
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
              message: `Failed to join room: ${errorMessage}`
            }, null, 2)
          }
        ],
        isError: true
      };
    }
  }

  async leaveRoom(args) {
    try {
      const { roomId } = args;
      
      const response = await axios.post(`${MEDIASOUP_SERVER_URL}/api/agent/leave`, {
        roomId
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              data: response.data,
              message: `Successfully left room ${roomId}`
            }, null, 2)
          }
        ]
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
              message: `Failed to leave room: ${errorMessage}`
            }, null, 2)
          }
        ],
        isError: true
      };
    }
  }

  async sendMessage(args) {
    try {
      const { roomId, message } = args;
      
      const response = await axios.post(`${MEDIASOUP_SERVER_URL}/api/agent/message`, {
        roomId,
        message
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              data: response.data,
              message: `Message sent to room ${roomId}: "${message}"`
            }, null, 2)
          }
        ]
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
              message: `Failed to send message: ${errorMessage}`
            }, null, 2)
          }
        ],
        isError: true
      };
    }
  }

  async getRoomInfo(args) {
    try {
      const { roomId } = args;
      
      const response = await axios.get(`${MEDIASOUP_SERVER_URL}/api/room/${roomId}`);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              data: response.data,
              message: `Room info for ${roomId}`
            }, null, 2)
          }
        ]
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
              message: `Failed to get room info: ${errorMessage}`
            }, null, 2)
          }
        ],
        isError: true
      };
    }
  }

  async listParticipants(args) {
    try {
      const { roomId } = args;
      
      const response = await axios.get(`${MEDIASOUP_SERVER_URL}/api/room/${roomId}/participants`);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              data: response.data,
              message: `Participants in room ${roomId}`
            }, null, 2)
          }
        ]
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
              message: `Failed to list participants: ${errorMessage}`
            }, null, 2)
          }
        ],
        isError: true
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
