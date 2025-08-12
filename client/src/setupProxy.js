const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
  const target = process.env.REACT_APP_SOCKET_URL || 'http://localhost:5001';

  // Proxy REST/MCP routes
  app.use(
    ['/api', '/mcp'],
    createProxyMiddleware({
      target,
      changeOrigin: true,
    })
  );

  // Proxy Socket.IO
  app.use(
    ['/socket.io'],
    createProxyMiddleware({
      target,
      changeOrigin: true,
      ws: true,
    })
  );
};