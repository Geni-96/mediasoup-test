// src/server.js
const express = require('express');
const http = require('http');
// const { mediasoup } = require('mediasoup');
const cors = require('cors')
require('dotenv').config();
const redis = require('redis');
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

const client = redis.createClient({
  username: 'default',
  password: process.env.REDIS_PASSWORD,
  socket: {
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT
  }
});


client.on('error', err => console.log('Redis Client Error', err));


(async () => {
  await client.connect();
  console.log('Connected to Redis');
})();

// const rooms = new Map()
// const peers = io.of('/mediasoup')
const routers = new Map;

let producer
let consumer
let room;
const paramlist = []
let producerInfo = new Map();
let consumerInfo = new Map();
io.on("connection", socket =>{

  console.log('new peer connected', socket.id)
  socket.on('joinRoom', async ({ username, roomId }, callback) => {
    socket.join(roomId)
    let router;
    
    producerInfo.set(`${roomId}:${username}`, new Map());
    consumerInfo.set(`${roomId}:${username}`, new Map());
    room = await client.exists(`room:${roomId}`);
    if(!room){
      console.log('creating a new room with id:', roomId, `Adding user:${username}`)
      router = await getRouter();
      routers.set(`${roomId}`, router)
      if(router){
        const roomData = {
          peers: [username]
        };
        await client.set(`room:${roomId}`, JSON.stringify(roomData));
      }
    }
    else{
      console.log(`Adding ${username} to existing room ${roomId}`)
      const data = await client.get(`room:${roomId}`);
      console.log(data, 'exiting room data')
      if (data){
        room = JSON.parse(data);
        router = await routers.get(`${roomId}`)
        console.log('router', router)
        room.peers.push(username);
        socket.emit("newParticipant", room.peers)
        console.log("emiting event new participant and sending peers:", room.peers)
        await client.set(`room:${roomId}`, JSON.stringify(room));
      }
    }
    
    //send router rtpcapabilities to client
    if(router){
      const rtpCapabilities = router.rtpCapabilities
      // console.log('rtp',rtpCapabilities)
      callback({rtpCapabilities})
    }
    //once we have the router, we create produce and consume transports for each
    socket.on("createWebRTCTransport",async(callback)=>{
      // create both producerTransport and consumer Transport
      let producerTransport = await createWebRtcTransport(router)
      let consumerTransport = await createWebRtcTransport(router)
      producerInfo.get(`${roomId}:${username}`).set('producerTransport', producerTransport);
      consumerInfo.get(`${roomId}:${username}`).set('consumerTransport', consumerTransport)
      consumerInfo.get(`${roomId}:${username}`).set('consumers', new Map())
      // transports.set(`${username}`, { producer: producerTransport, consumer: consumerTransport})
      // console.log('transports for current user stored in map')
      // await client.set(`producers:${roomId}${username}`,[])
      
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
    // console.log('DTLS PARAMS... ', { dtlsParameters },producerTransport)
    await producerInfo.get(`${roomId}:${username}`).get('producerTransport').connect({ dtlsParameters })
    console.log('producer connected')
  })

  // see client's socket.emit('transport-produce', ...)
  socket.on('transport-produce', async ({ kind, rtpParameters, appData }, callback) => {
    // call produce based on the prameters from the client
    console.log('producer producing')
    producer = await producerInfo.get(`${roomId}:${username}`).get('producerTransport').produce({
      kind,
      rtpParameters,
    })
    producerInfo.get(`${roomId}:${username}`).set('producer', producer)
    console.log('producer from map', producerInfo)
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
    const consumer = await consumerInfo.get(`${roomId}:${username}`).get('consumerTransport');
    await consumer.connect({ dtlsParameters })
  })

  socket.on('consume', async ({ rtpCapabilities }, callback) => {
    
    const paramsList = []
    try {
      // check if the router can consume the specified producer
      let roomData = await client.get(`room:${roomId}`);
      room = JSON.parse(roomData)
      const cur_peers = room.peers
      console.log("current peers in the room", cur_peers, "cur username", username)
      const consumers = consumerInfo.get(`${roomId}:${username}`).get('consumers')
      for(const peer of cur_peers){
        if(peer!=username){
          if (!consumers.has(peer)){
            console.log(`${peer} doesn't have a counsumer in ${username}`)
            console.log('producerInfo', producerInfo)
            producer = await producerInfo.get(`${roomId}:${peer}`).get('producer')
            console.log('producer for ',peer, producer)
            if (router.canConsume({
              producerId: producer.id,
              rtpCapabilities
            })) {
              // transport can now consume and return a consumer
              console.log('router can consume', 'creating consumer for:', peer)
              consumer = await consumerInfo.get(`${roomId}:${username}`).get('consumerTransport').consume({
                producerId: producer.id,
                rtpCapabilities,
                paused: true,
              })
              consumerInfo.get(`${roomId}:${username}`).get('consumers').set(`${peer}`, consumer)
              
              consumer.on('transportclose', () => {
                console.log('transport close from consumer')
              })
      
              consumer.on('producerclose', () => {
                console.log('producer of consumer closed')
              })
              // from the consumer extract the following params
              // to send back to the Client
              let params = {
                user: peer,
                id: consumer.id,
                producerId: producer.id,
                kind: consumer.kind,
                rtpParameters: consumer.rtpParameters,
                resumed:false
              }
              paramsList.push(params);
            }
          }
        }
      }
      console.log('paramsList after callback', paramsList)
      callback({paramsList:paramsList})
    } catch (error) {
      paramsList.push({ error: `Could not consume: ${error.message}` });
      console.log(error.message)
      callback({paramsList});
    }
  })

  socket.on('consumer-resume', async (user, consumerId) => {
    console.log('consumer resume')
    consumerInfo.get(`${roomId}:${username}`).get('consumers').get(user).resume()
  })

  })
  socket.on('hangup', async({roomId, username}) =>{
    console.log("on one peer left")
    socket.to(roomId).emit('remove video', username)
    delPeerTransports(roomId, username)

    //remove peer from redis
    const roomKey = `room:${roomId}`
    const data = await client.get(roomKey);

    if (data) {
      const roomData = JSON.parse(data);
      
      // Remove the peer from the array
      roomData.peers = roomData.peers.filter(peer => peer !== username);
      console.log('filetered peers', roomData.peers)
      // Update the Redis entry
      await client.set(roomKey, JSON.stringify(roomData));

      console.log(`Removed ${username} from room ${roomId}`);
    } else {
      console.log(`Room ${roomId} or ${username} not found in Redis`);
    }

  })

  socket.on("end-meeting",async(roomId)=>{
    socket.to(roomId).emit("remove-all-videos")
    console.log('ending the meeting in ', roomId)
    const data = await client.get(`room:${roomId}`);
    if(data){
      const {peers} = JSON.parse(data)
      for(let peer in peers){
        console.log('About to delete peer transports for:', roomId, peer)
        delPeerTransports(roomId, peer)
      }
      const result = await client.del(`room:${roomId}`);
      console.log(result, 'result of deleting room data from redis')
      //close router

    }
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
      console.log('Transport closed')
  });

  return transport;
};

const delPeerTransports = async(roomId, username) =>{
  try{
    const userProducers = producerInfo.get(`${roomId}:${username}`) || {};
    const userConsumers = consumerInfo.get(`${roomId}:${username}`).get('consumers') || {};

    // Close all producers
    for (const producer of Object.values(userProducers)) {
      try {
        producer.close();
      } catch (err) {
        console.error("Error closing producer", err);
      }
    }

    // Close all consumers
    for (const peerId in userConsumers) {
      for (const consumer of Object.values(userConsumers[peerId])) {
        try {
          consumer.close();
        } catch (err) {
          console.error("Error closing consumer", err);
        }
      }
    }

    await producerInfo.get(`${roomId}:${username}`).get('producerTransport').close()
    await consumerInfo.get(`${roomId}:${username}`).get('consumerTransport').close()
    producerInfo.delete(`${roomId}:${username}`)
    consumerInfo.delete(`${roomId}:${username}`)
  }
  catch(error){
    console.log("Error in deleting peer transports for:", username, roomId, error)
  }
}

server.listen(5001, ()=>{
  console.log('Server runnning on port 5001')
})