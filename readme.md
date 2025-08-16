# MIE WebConf App - Mediasoup Server Library

[![NPM Version](https://img.shields.io/npm/v/mie-webconf-app.svg)](https://www.npmjs.com/package/mie-webconf-app)

`mie-webconf-app` is a powerful and flexible mediasoup-based server library for building scalable video conferencing applications. It provides a ready-to-use signaling server with Socket.IO, optional Redis integration for multi-server deployments, and a pre-built client for demonstration purposes.

This package is designed to be integrated into your own Node.js applications, giving you a robust backend for your WebRTC projects with minimal setup.

## Key Features

- **Ready-to-Use Mediasoup Server**: A fully functional signaling server that handles mediasoup room and transport management.
- **Optional Redis Integration**: Use Redis for multi-server scalability or fall back to in-memory storage for simple, single-instance setups.
- **Flexible Configuration**: Configure the server using environment variables (`.env`) and a YAML file for advanced transport settings.
- **Graceful Shutdown**: The server and all its mediasoup workers shut down cleanly, preventing orphaned processes.
- **Automatic Name Conflict Resolution**: If two users join with the same name, the server automatically ensures uniqueness.
- **Rejoin Meetings**: Allows users to leave and rejoin meetings.
- **Demo Client Included**: Comes with a pre-built React client to demonstrate functionality out of the box.

## Installation

Install the package using npm:

```bash
npm install mie-webconf-app
```

## Quick Start: Running the Server

Create a file (e.g., `index.js`) in your project and add the following code:

```javascript
const { startServer, stopServer } = require('mie-webconf-app');

// Start the server
startServer();

console.log('Mediasoup server is running.');
console.log('Access the demo client at http://localhost:5001');

// Implement a graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down server...');
  stopServer().then(() => {
    console.log('Server has been stopped.');
    process.exit(0);
  });
});
```

Now, run your file:

```bash
node index.js
```

The server will start, and you can access the included demo client by navigating to `http://localhost:5001` in your browser.

## Configuration

You can configure the server by creating a `.env` file in the root of your project.

### Environment Variables (`.env`)

Create a `.env` file and add the following variables as needed. You can use the included `.env.example` as a template.

| Variable         | Default     | Description                                                                                                |
| ---------------- | ----------- | ---------------------------------------------------------------------------------------------------------- |
| `PORT`           | `5001`      | The port on which the server will run.                                                                     |
| `BACKEND_IP`     | `127.0.0.1` | The publicly accessible IP address of the server. **Crucial for mediasoup to work correctly.**               |
| `REDIS_HOST`     | (none)      | **(Optional)** The hostname of your Redis instance. If provided, Redis will be used for room management.    |
| `REDIS_PORT`     | (none)      | **(Optional)** The port for your Redis instance.                                                           |
| `REDIS_PASSWORD` | (none)      | **(Optional)** The password for your Redis instance.                                                       |

### Advanced WebRTC Transport Configuration

For advanced users, you can configure mediasoup's WebRTC transport settings by creating a `webrtc-transport.yaml` file in your project's root directory. This allows you to fine-tune settings like ICE, UDP/TCP preferences, and more.

If this file is not found, the server will use default settings. An example is provided in the package.

## How It Works

This package exports two main functions:

- `startServer()`: Initializes and starts the Express server, Socket.IO signaling, and mediasoup workers.
- `stopServer()`: Gracefully shuts down the server, closes all mediasoup workers, and disconnects from Redis if connected.

The package also serves a static build of a React client located in the `client/build` directory, which provides a ready-to-use interface for testing and demonstration.

## License

This project is licensed under the ISC License.
