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
let router;
let producerTransport
let consumerTransport
let producer
let consumer
io.on("connection", socket =>{
  
  console.log('new peer connected', socket.id)
  socket.on('joinRoom', async ({ username, roomId }, callback) => {
    let room = rooms.get(roomId)
    

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
      const producerOptions = {
        id: producerTransport.id,
        iceParameters: producerTransport.iceParameters,
        iceCandidates: producerTransport.iceCandidates,
        dtlsParameters: producerTransport.dtlsParameters
      }
      const consumerOptions = {
        id: consumerTransport.id,
        iceParameters: consumerTransport.iceParameters,
        iceCandidates: consumerTransport.iceCandidates,
        dtlsParameters: consumerTransport.dtlsParameters
      }
      callback({producer:producerOptions,consumer:consumerOptions})
    })
    // see client's socket.emit('transport-connect', ...)
  socket.on('transport-connect', async ({ dtlsParameters }) => {
    console.log('DTLS PARAMS... ', { dtlsParameters },producerTransport)
    await producerTransport.connect({ dtlsParameters })
    console.log('producer connected')
  })

  // see client's socket.emit('transport-produce', ...)
  socket.on('transport-produce', async ({ kind, rtpParameters, appData }, callback) => {
    // call produce based on the prameters from the client
    console.log('producer producing')
    producer = await producerTransport.produce({
      kind,
      rtpParameters,
    })

    console.log('Producer', producer.id, producer.kind)

    producer.on('transportclose', () => {
      console.log('transport for this producer closed ')
      producer.close()
    })

    // Send back to the client the Producer's id
    callback({
      id: producer.id
    })
  })

  // see client's socket.emit('transport-recv-connect', ...)
  socket.on('transport-recv-connect', async ({ dtlsParameters }) => {
    console.log(`DTLS PARAMS: ${dtlsParameters}`)
    await consumerTransport.connect({ dtlsParameters })
  })

  socket.on('consume', async ({ rtpCapabilities }, callback) => {
    try {
      // check if the router can consume the specified producer
      if (router.canConsume({
        producerId: producer.id,
        rtpCapabilities
      })) {
        // transport can now consume and return a consumer
        console.log('router can consume')
        consumer = await consumerTransport.consume({
          producerId: producer.id,
          rtpCapabilities,
          paused: true,
        })
        consumer.on('transportclose', () => {
          console.log('transport close from consumer')
        })

        consumer.on('producerclose', () => {
          console.log('producer of consumer closed')
        })
        // from the consumer extract the following params
        // to send back to the Client
        const params = {
          id: consumer.id,
          producerId: producer.id,
          kind: consumer.kind,
          rtpParameters: consumer.rtpParameters,
        }
        console.log('consumer params', params)
        // send the parameters to the client
        callback({ params })
      }
    } catch (error) {
      console.log(error.message)
      callback({
        params: {
          error: error
        }
      })
    }
  })

  socket.on('consumer-resume', async () => {
    console.log('consumer resume')
    await consumer.resume()
  })

  })

})

const createWebRtcTransport = async (router) => {
  const transport = await router.createWebRtcTransport({
      listenIps: [{ ip: '127.0.0.1', announcedIp: '127.0.0.1' }],
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

server.listen(5001, ()=>{
  console.log('Server runnning on port 5001')
})