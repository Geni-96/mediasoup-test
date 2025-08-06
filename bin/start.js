#!/usr/bin/env node

/**
 * MediaSoup Conference Starter Script
 * 
 * This script starts the MediaSoup server with MCP agent support
 */

const { startServer } = require('../server/server');

console.log('🚀 Starting MediaSoup Conference Server with MCP Agent Support...');

startServer();
