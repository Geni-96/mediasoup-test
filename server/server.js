// src/server.js
const express = require('express');
const http = require('http');
// const { mediasoup } = require('mediasoup');
const cors = require('cors')
const { createWorker, worker, getRouter } = require('./mediasoup-config');
(async () => {
  await createWorker();
})();
const app = express();
const server = http.createServer(app);
const io = require("socket.io")(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  }
});

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

const rooms = new Map()
// const peers = io.of('/mediasoup')

io.on("connection", socket =>{
  console.log('new peer connected', socket.id)
  socket.on('joinRoom', async ({ username, roomId }, callback) => {
    let room = rooms.get(roomId)
    let router;
    let producerTransport
    let consumerTransport
    if(!room){
      console.log('creating a new room with id:', roomId, `Adding user:${username}`)
      router = await getRouter();
      rooms.set(roomId, { router, peers: [] });
      async()=>{
        if(rooms.has(roomId)){
          await rooms.peers.push(username)
        }
      }
    }
    else{
      console.log(`Adding ${username} to existing room ${roomId}`)
      router = room.router
      async()=>{
        if(rooms.has(roomId)){
          await rooms.peers.push(username)
          socket.emit("newParticipant", rooms.peers)
          console.log("emiting event new participant and sending peers:", rooms.peers)
        }
      }
    }
    //push the new peer into the room
    console.log(rooms)
    
    //send router rtpcapabilities to client
    const  rtpCapabilities= router.rtpCapabilities
    callback({rtpCapabilities})
    //once we have the router, we create produce and consume transports for each
    socket.on("createWebRTCTransport",async(callback)=>{
      // create both producerTransport and consumer Transport
      producerTransport = await createWebRtcTransport(router)
      consumerTransport = await createWebRtcTransport(router)
      
      callback({producer:producerTransport,consumer:consumerTransport})
    })

  })

})

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

  const transportOptions = {
    id: transport.id,
    iceParameters: transport.iceParameters,
    iceCandidates: transport.iceCandidates,
    dtlsParameters: transport.dtlsParameters
  }
  return transportOptions;
};

server.listen(5001, ()=>{
  console.log('Server runnning on port 5001')
})