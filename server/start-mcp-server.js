#!/usr/bin/env node

/**
 * Start the MediaSoup MCP Server
 * This script starts the MCP server on HTTP with SSE transport
 */

const { MediaSoupMCPServer } = require('./mcp-server');

async function startMCPServer() {
  console.log('🚀 Starting MediaSoup MCP Server...');
  
  const server = new MediaSoupMCPServer();
  
  try {
    await server.run();
    console.log('✅ MCP Server started successfully');
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n🛑 Shutting down MCP server...');
      process.exit(0);
    });
    
  } catch (error) {
    console.error('❌ Failed to start MCP server:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  startMCPServer();
}
