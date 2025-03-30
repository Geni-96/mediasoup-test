// src/server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mediasoup = require('mediasoup');
const cors = require('cors')
const app = express();
const server = http.createServer(app);
const io = require("socket.io")(server, {
    cors: {
      origin: "http://localhost:3000",
      methods: ["GET", "POST"],
      credentials: true
    }
  });

// MediaSoup server setup
const { createWorker, worker, getRouter } = require('./mediasoup-config');

(async () => {
    await createWorker();
  })();

// cors setup
app.use(cors({ 
    origin: "http://localhost:3000", // Allow React frontend
    credentials: true  // Allow cookies & authentication headers
}));

app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "http://localhost:3000");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Credentials", "true");

    if (req.method === "OPTIONS") {
        return res.sendStatus(200);
    }
    next();
});

io.on('connection', (socket) => {
  console.log('New client connected');
  
  // Handle client requests for MediaSoup
  socket.on('joinRoom', async ({ username, roomId }, callback) => {
    console.log(`${username} is joining room: ${roomId}`);
    // Create or join room logic
    // Create a transport for the client
    const router = getRouter();
    socket.on('getRouterCapabilities', (callback) =>{
        const rtpCapabilities = router.rtpCapabilities;
        callback(rtpCapabilities);
    })
    const transport = await createWebRtcTransport(router);
    callback({ transportOptions: transport });
    socket.join(roomId);
    io.to(roomId).emit('roomJoined', { username, roomId });

    socket.on('newParticipant', ({ id, stream }) => {
        socket.to(roomId).emit('newParticipant', { id, stream });
      });
  
      socket.on('leaveRoom', ({ username, roomId }) => {
        socket.leave(roomId);
        socket.to(roomId).emit('participantLeft', username);
      });
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

const createWebRtcTransport = async (router) => {
    const transport = await router.createWebRtcTransport({
        listenIps: [{ ip: '0.0.0.0', announcedIp: 'localhost' }],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
    });

    transport.on('dtlsstatechange', dtlsState => {
        if (dtlsState === 'closed') {
        transport.close();
        }
    });

    transport.on('close', () => {
        console.log('Transport closed');
    });

    return transport;
};
server.listen(5001, () => {
  console.log('Server is running on port 5001');
});
