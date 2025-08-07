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
const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse.js');
const {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} = require('@modelcontextprotocol/sdk/types.js');
const axios = require('axios');
const express = require('express');
const cors = require('cors');

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
    this.port = process.env.MCP_PORT || 5002;
    this.app = express();
    
    this.setupExpress();
    this.setupToolHandlers();
  }

  setupExpress() {
    this.app.use(cors());
    this.app.use(express.json());
    
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', service: 'mediasoup-mcp-server' });
    });

    // HTTP API wrapper for MCP tools
    this.app.post('/api/tools/:toolName', async (req, res) => {
      try {
        const { toolName } = req.params;
        const args = req.body;

        let result;
        switch (toolName) {
          case 'join_room':
            result = await this.joinRoom(args);
            break;
          case 'leave_room':
            result = await this.leaveRoom(args);
            break;
          case 'send_message':
            result = await this.sendMessage(args);
            break;
          case 'get_room_info':
            result = await this.getRoomInfo(args);
            break;
          case 'list_participants':
            result = await this.listParticipants(args);
            break;
          default:
            return res.status(404).json({ error: `Unknown tool: ${toolName}` });
        }

        // Parse the JSON result from MCP format
        const mcpResult = JSON.parse(result.content[0].text);
        res.json(mcpResult);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // List available tools
    this.app.get('/api/tools', (req, res) => {
      res.json({
        tools: [
          'join_room',
          'leave_room', 
          'send_message',
          'get_room_info',
          'list_participants'
        ]
      });
    });
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
    const httpServer = this.app.listen(this.port, () => {
      console.log(`MediaSoup MCP server running on http://localhost:${this.port}`);
      console.log(`Health check: http://localhost:${this.port}/health`);
      console.log(`MCP endpoint: http://localhost:${this.port}/sse`);
    });

    // Set up SSE endpoint for MCP
    this.app.all('/sse', async (req, res) => {
      try {
        console.log('MCP client connecting via SSE...');
        
        // Set up SSE headers
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
        });

        // Handle preflight requests
        if (req.method === 'OPTIONS') {
          res.end();
          return;
        }

        // Create a simple transport that works with the MCP client
        const transport = {
          start: () => {
            console.log('SSE transport started');
          },
          send: (message) => {
            const data = JSON.stringify(message);
            res.write(`data: ${data}\n\n`);
          },
          close: () => {
            res.end();
          }
        };

        // Handle the MCP handshake manually
        if (req.method === 'POST') {
          let body = '';
          req.on('data', chunk => {
            body += chunk.toString();
          });
          
          req.on('end', async () => {
            try {
              const message = JSON.parse(body);
              console.log('Received MCP message:', message.method);
              
              // Handle initialize request
              if (message.method === 'initialize') {
                const response = {
                  jsonrpc: '2.0',
                  id: message.id,
                  result: {
                    protocolVersion: '2024-11-05',
                    capabilities: {
                      tools: {}
                    },
                    serverInfo: {
                      name: 'mediasoup-agent-server',
                      version: '1.0.0'
                    }
                  }
                };
                transport.send(response);
              }
              
              // Handle tools/list request
              else if (message.method === 'tools/list') {
                const toolsResponse = await this.server.request({
                  method: 'tools/list'
                }, ListToolsRequestSchema);
                
                const response = {
                  jsonrpc: '2.0',
                  id: message.id,
                  result: toolsResponse
                };
                transport.send(response);
              }
              
              // Handle tools/call request
              else if (message.method === 'tools/call') {
                const callResponse = await this.server.request(message.params, CallToolRequestSchema);
                
                const response = {
                  jsonrpc: '2.0',
                  id: message.id,
                  result: callResponse
                };
                transport.send(response);
              }
              
              // Handle notifications
              else if (message.method === 'notifications/initialized') {
                console.log('MCP client initialized');
              }
              
            } catch (error) {
              console.error('Error handling MCP message:', error);
              const errorResponse = {
                jsonrpc: '2.0',
                id: message.id || null,
                error: {
                  code: -32603,
                  message: error.message
                }
              };
              transport.send(errorResponse);
            }
          });
        } else {
          // For GET requests, just keep the connection open
          res.write('data: {"type":"connection_established"}\n\n');
        }

        // Handle client disconnect
        req.on('close', () => {
          console.log('MCP client disconnected');
        });

      } catch (error) {
        console.error('Error in SSE endpoint:', error);
        res.status(500).json({ error: error.message });
      }
    });
    
    console.log('MCP server ready for agent connections');
    
    return httpServer;
  }
}

// Start the server if run directly
if (require.main === module) {
  const server = new MediaSoupMCPServer();
  server.run().catch(console.error);
}

module.exports = { MediaSoupMCPServer };
