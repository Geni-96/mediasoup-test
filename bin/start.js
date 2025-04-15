#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');


// Step 1: Build client
try {
  execSync('npm run build', { cwd: path.join(__dirname, '../client'), stdio: 'inherit' });
} catch (err) {
  console.error('❌ Failed to build client');
  process.exit(1);
}

// Step 2: Start server
require(path.join(__dirname, '../server/server.js'))(); // simply invoke the exported server function

// Step 3: Open browser

