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
let transports = new Map()
let producers = new Map()
let consumers = new Map()
let room;
io.on("connection", socket =>{
  
  console.log('new peer connected', socket.id)
  socket.on('joinRoom', async ({ username, roomId }, callback) => {
    room = rooms.get(roomId)
    if(!room){
      console.log('creating a new room with id:', roomId, `Adding user:${username}`)
      router = await getRouter();
      rooms.set(roomId, { router, peers: [] });
      room = rooms.get(roomId)
      if(rooms.has(roomId)){
        room.peers.push(username)
      }
    }
    else{
      console.log(`Adding ${username} to existing room ${roomId}`)
      router = room.router
      if(rooms.has(roomId)){
        room = rooms.get(roomId)
        room.peers.push(username)
        socket.emit("newParticipant", room.peers)
        console.log("emiting event new participant and sending peers:", room.peers)
      }
    }
    
    //send router rtpcapabilities to client
    const  rtpCapabilities= router.rtpCapabilities
    callback({rtpCapabilities})
    //once we have the router, we create produce and consume transports for each
    socket.on("createWebRTCTransport",async(callback)=>{
      // create both producerTransport and consumer Transport
      producerTransport = await createWebRtcTransport(router)
      consumerTransport = await createWebRtcTransport(router)
      transports.set(`${username}`, { producer: producerTransport, consumer: consumerTransport})
      console.log('transports for current user stored in map')
      producers.set(`${username}`,[])
      consumers.set(`${username}`, new Map())
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
    const cur_producers= producers.get(username)
    if(cur_producers){
      cur_producers.push(producer)
      producers.set(username, cur_producers)
    }
    console.log('producer from map', producers.get(username))
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
    const currentTransports = transports.get(username)
    await currentTransports.consumer.connect({ dtlsParameters })
  })

  socket.on('consume', async ({ rtpCapabilities }, callback) => {
    try {
      // check if the router can consume the specified producer
      room = rooms.get(roomId)
      const cur_peers = room.peers
      console.log("current peers in the room", cur_peers, "cur username", username)
      cur_peers.forEach(async(peer)=>{
        if(peer!=username){
          const existing_consumers = consumers.get(username)
          if (!existing_consumers.has(peer)){
            console.log(" inside if check foreach")
            const consume_producer = producers.get(peer)[0]
            if (router.canConsume({
              producerId: consume_producer.id,
              rtpCapabilities
            })) {
              // transport can now consume and return a consumer
              console.log('router can consume', 'creating consumer for:', peer)
              const cur_transports = transports.get(username)
              consumer = await cur_transports.consumer.consume({
                producerId: consume_producer.id,
                rtpCapabilities,
                paused: true,
              })
              const cur_consumers= consumers.get(username)
              if(cur_consumers){
                cur_consumers.set(peer, consumer)
                consumers.set(username, cur_consumers)
              }
              console.log('consumer from map', consumers.get(username))
              
              consumer.on('transportclose', () => {
                console.log('transport close from consumer')
              })
      
              consumer.on('producerclose', () => {
                console.log('producer of consumer closed')
              })
              // from the consumer extract the following params
              // to send back to the Client
              const params = {
                user: peer,
                id: consumer.id,
                producerId: consume_producer.id,
                kind: consumer.kind,
                rtpParameters: consumer.rtpParameters,
              }
              console.log('consumer params', params)
              // send the parameters to the client
              callback({ params })
            }
          }
        }
      })
      
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
    const curConsumers = consumers.get(username)
    await curConsumers.forEach(async(consumer)=>{
      await consumer.resume()
    })
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