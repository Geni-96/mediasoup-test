#!/usr/bin/env node

/**
 * Start the MediaSoup MCP Server
 * This script starts the MCP server on HTTP transport
 */

const { MediaSoupMCPHttpServer } = require('./mcp-http-server');

async function startMCPServer() {
  console.log('🚀 Starting MediaSoup MCP HTTP Server...');
  
  const server = new MediaSoupMCPHttpServer();
  
  try {
    await server.run();
    console.log('✅ MCP HTTP Server started successfully');
    
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
