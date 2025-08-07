#!/usr/bin/env node

/**
 * MCP Server for LLM Agent Room Participation with HTTP Transport
 * 
 * This server provides tools that allow an LLM agent to:
 * - Join a room as a participant
 * - Leave a room
 * - Send messages to room participants
 * - Get room information
 */

const express = require('express');
const { randomUUID } = require('node:crypto');
const cors = require('cors');
const axios = require('axios');

// MediaSoup server URL
const MEDIASOUP_SERVER_URL = process.env.MEDIASOUP_SERVER_URL || 'http://localhost:5001';
const PORT = process.env.MCP_PORT || 5002;

class MediaSoupMCPHttpServer {
  constructor() {
    this.app = express();
    this.sessions = new Map(); // Session management
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json());
  }

  setupRoutes() {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        mediasoupUrl: MEDIASOUP_SERVER_URL 
      });
    });

    // MCP endpoint
    this.app.post('/mcp', async (req, res) => {
      try {
        // Get or create session
        const sessionId = req.headers['x-session-id'] || randomUUID();
        let session = this.sessions.get(sessionId);
        
        if (!session) {
          session = this.createSession(sessionId);
          this.sessions.set(sessionId, session);
        }

        // Handle the request
        const request = req.body;
        
        if (request.method === 'initialize') {
          // Initialize the session
          session.initialized = true;
          const response = {
            jsonrpc: '2.0',
            id: request.id,
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
          
          res.setHeader('X-Session-Id', sessionId);
          res.json(response);
          return;
        }

        // Handle other requests
        let response;
        
        switch (request.method) {
          case 'tools/list':
            response = await this.handleToolsList(request);
            break;
          case 'tools/call':
            response = await this.handleToolCall(request);
            break;
          case 'notifications/initialized':
            response = { jsonrpc: '2.0', id: request.id, result: {} };
            break;
          default:
            response = {
              jsonrpc: '2.0',
              id: request.id,
              error: {
                code: -32601,
                message: `Method not found: ${request.method}`
              }
            };
        }

        res.setHeader('X-Session-Id', sessionId);
        res.json(response);

      } catch (error) {
        console.error('Error handling MCP request:', error);
        res.status(500).json({
          jsonrpc: '2.0',
          id: req.body?.id || null,
          error: {
            code: -32603,
            message: error.message
          }
        });
      }
    });
  }

  createSession(sessionId) {
    return {
      id: sessionId,
      initialized: false,
      createdAt: new Date(),
      lastActivity: new Date()
    };
  }

  async handleToolsList(request) {
    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {
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
      }
    };
  }

  async handleToolCall(request) {
    try {
      const { name, arguments: args } = request.params;
      
      let result;
      switch (name) {
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
          throw new Error(`Unknown tool: ${name}`);
      }

      return {
        jsonrpc: '2.0',
        id: request.id,
        result
      };
    } catch (error) {
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32603,
          message: error.message
        }
      };
    }
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

  // Session cleanup
  cleanupSessions() {
    const now = new Date();
    const maxAge = 30 * 60 * 1000; // 30 minutes
    
    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.lastActivity > maxAge) {
        this.sessions.delete(sessionId);
        console.log(`Cleaned up expired session: ${sessionId}`);
      }
    }
  }

  async run() {
    // Cleanup sessions every 5 minutes
    setInterval(() => this.cleanupSessions(), 5 * 60 * 1000);

    const server = this.app.listen(PORT, () => {
      console.log(`MediaSoup MCP HTTP server running on http://localhost:${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/health`);
      console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
      console.log(`MediaSoup server: ${MEDIASOUP_SERVER_URL}`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.log('Shutting down gracefully...');
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    });

    return server;
  }
}

// Start the server if run directly
if (require.main === module) {
  const server = new MediaSoupMCPHttpServer();
  server.run().catch(console.error);
}

module.exports = { MediaSoupMCPHttpServer };
