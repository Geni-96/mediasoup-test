// src/server.js
const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
// const { mediasoup } = require('mediasoup');
const cors = require('cors')
require('dotenv').config();

const redis = require('redis');
const { createWorker, getRouter } = require('./mediasoup-config');
const yaml = require('js-yaml');

//environment variables
const PORT = process.env.PORT || 5001;
const BLUEHIVE_API_URL = process.env.BLUEHIVE_API_URL || 'https://ai.bluehive.com/api/consume-audio';
const BLUEHIVE_AUTH = process.env.BLUEHIVE_AUTH;
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost';

(async () => {
  await createWorkers();
})();
const app = express();
const server = http.createServer(app);

// const io = require("socket.io")(server);

//for processing audio chunks
const meteorRandom = require('meteor-random');
let sessionId = meteorRandom.id(); // Generate a unique session ID
console.log('Session ID:', sessionId); // Log the session ID for debugging
// let sessionId = 'Jjwjg6gouWLXhMGKW' //static session ID for testing
const axios = require('axios');
const FormData = require('form-data');

// const path = require('path')
// app.use(express.static(path.join(__dirname, '../client/build')))
const io = require("socket.io")(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000", // Allow React frontend
    methods: ["GET", "POST"],
    credentials: true
  }
});

// cors setup
app.use(cors({ 
    origin: process.env.FRONTEND_URL || "http://localhost:3000", // Allow React frontend
    credentials: true  // Allow cookies & authentication headers
}));

app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", process.env.FRONTEND_URL || "http://localhost:3000");
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


async function connectRedis() {
  await client.connect();
  console.log('Connected to Redis');
}

let producer
let consumer
let room;
const paramlist = []
let producerInfo = new Map();
let consumerInfo = new Map();
io.on("connection", socket =>{

  // console.log('new peer connected', socket.id)
  socket.on('joinRoom', async ({ username, param,create }, callback) => {
    socket.io = io
    const roomId = param;
    socket.join(roomId)
    let router;
    let uniqueId;
    console.log
    producerInfo.set(`${roomId}:${username}`, new Map());
    consumerInfo.set(`${roomId}:${username}`, new Map());
    room = await client.exists(`room:${roomId}`);
    if(create){
      if(room){
        return callback({error: 'Please try again, room already exists'})
      }
      console.log('creating a new room with id:', roomId, `Adding user:${username}`)
      router = await getRouter(roomId);
      uniqueId = Math.random().toString(36).substring(2, 15)+Math.random().toString(36).substring(2, 15)
      // console.log('router',router)
      if(router){
        const roomData = {
          peers: [username]
        };
        await client.set(`room:${roomId}`, JSON.stringify(roomData));
      }
    }
    else{
      if(!room){
        return callback({error: 'Room not found'})
      }
      console.log(`Adding ${username} to existing room ${roomId}`)
      const data = await client.get(`room:${roomId}`);
      console.log(data, 'exiting room data')
      if (data){
        room = JSON.parse(data);
        router = await getRouter(roomId);
        // console.log('router', router)
        room.peers.push(username);
        socket.emit("newParticipant", room.peers)
        console.log("emiting event new participant and sending peers:", room.peers)
        await client.set(`room:${roomId}`, JSON.stringify(room));
      }
    }
    
    //send router rtpcapabilities to client
    if(router){
      const rtpCapabilities = await router.rtpCapabilities
      // console.log('rtp',rtpCapabilities)
      callback({rtpCapabilities})
    }
    //once we have the router, we create produce and consume transports for each
    socket.on("createWebRTCTransport",async(callback)=>{
      // create both producerTransport and consumer Transport
      if(!router){
        console.log('Failed to fetch router for this room')
        return
      }
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
      // console.log('transports created')
      // router.observer.on("newtransport", ()=>{
      //   console.log("new transport created") //not working when the first user transports are created
      //   io.in(roomId).emit("new-transport", username)
      // })
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
    console.log('producer producing', kind)
    producer = await producerInfo.get(`${roomId}:${username}`).get('producerTransport').produce({
      kind,
      rtpParameters,
    })
    producerInfo.get(`${roomId}:${username}`).set(`${kind}:producer`, producer)
    // console.log('producer from map', producerInfo)
    io.to(roomId).emit("new-transport", username)
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
    // console.log(`DTLS PARAMS: ${dtlsParameters}`)
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
      
      async function createConsumers(curProducer, curPeer){
        if (router.canConsume({
          producerId: curProducer.id,
          rtpCapabilities
        })) {
          // transport can now consume and return a consumer
          console.log('router can consume', 'creating consumer for:', curPeer)
          consumer = await consumerInfo.get(`${roomId}:${username}`).get('consumerTransport').consume({
            producerId: curProducer.id,
            rtpCapabilities,
            paused: true,
          })
          consumerInfo.get(`${roomId}:${username}`).get('consumers').set(`${curPeer}`, consumer)
          
          consumer.on('transportclose', () => {
            console.log('transport close for consumer')
          })
  
          consumer.on('producerclose', () => {
            console.log('producer of consumer closed')
          })
          // from the consumer extract the following params
          // to send back to the Client
          let params = {
            user: curPeer,
            id: consumer.id,
            producerId: producer.id,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters,
            resumed:false
          }
          paramsList.push(params);
        }
      }
      for(const peer of cur_peers){
        if(peer!=username){
          if (!consumers.has(peer)){
            console.log(`${peer} doesn't have a counsumer in ${username}`)
            // console.log('producerInfo', producerInfo)
            let audioProducer = await producerInfo.get(`${roomId}:${peer}`).get('audio:producer')
            let videoProducer = await producerInfo.get(`${roomId}:${peer}`).get('video:producer')
            // console.log('producer for ',peer, producer)
            if (audioProducer) {
              await createConsumers(audioProducer, peer)
            }
            if (videoProducer) {
              await createConsumers(videoProducer, peer)
            }
          }
        }
      }
      // console.log('paramsList after callback', paramsList)
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

  socket.on('startTranscriptions', ()=>{
    socket.emit('startTranscriptions')
  })

  let index = 0;
  let isProcessing = false;
  if (sessionId){
    socket.emit('sessionId', sessionId);
  }
 let processed = new Set()
  socket.on('audioChunks', async (audioChunk, blobindex) => {
    console.log("Received audio chunk", typeof audioChunk, audioChunk);
    if (blobindex in processed){
      return
    }
        // Only handle Buffer (socket.io will send as Buffer from Node.js client, or as {type: 'Buffer', data: ...} from some clients)
        let buf;
        if (Buffer.isBuffer(audioChunk)) {
            buf = audioChunk;
        } else if (audioChunk && audioChunk.type === 'Buffer' && Array.isArray(audioChunk.data)) {
            buf = Buffer.from(audioChunk.data);
        } else {
            console.log("Unknown audioChunk type, skipping.");
            return;
        }
        if (buf.length === 0) {
            console.log("Skipping empty audio chunk.");
            return;
        }
        if (isProcessing) {
            console.log("Still processing previous chunk, skipping this one.");
            return;
        }

        isProcessing = true;
        const formData = new FormData();
        formData.append('index', index );
        formData.append('type','audio/webm;codecs=opus')
        formData.append('sessionId', sessionId);
        formData.append('audioId', uniqueId)
        formData.append('data', buf, `chunk-${index}`);
        console.log(index, sessionId, uniqueId, buf, formData.getHeaders())
        try{
            console.log('sending audio chunk to Bluehive AI', formData)
            const response = await axios.post(
            BLUEHIVE_API_URL,
            formData,
            {
            headers: {
                'x-bluehive-authorization': BLUEHIVE_AUTH,
                'Origin': `${BACKEND_URL}:${PORT}` || 'https://localhost:5001',
                ...formData.getHeaders()
                },
            })
            console.log(response.data);
            index++;
            // callback(`Audio chunk ${index} sent successfully.`);
            processed.add(blobindex)
        }catch(err){
            console.error('Error sending audio chunks to ozwell', err)
        }
        finally{
            isProcessing = false;

        }
  })


  socket.on('hangup', async(uname) =>{
    console.log("on one peer left")
    socket.to(roomId).emit('remove video', uname)
    delPeerTransports(roomId, uname)

    //remove peer from redis
    const roomKey = `room:${roomId}`
    const data = await client.get(roomKey);

    if (data) {
      const roomData = JSON.parse(data);
      
      // Remove the peer from the array
      roomData.peers = roomData.peers.filter(peer => peer !== uname);
      console.log('filetered peers', roomData.peers)
      if(roomData.peers.length===1){
        // io.to(roomId).emit("end-meeting")
        io.to(roomId).emit("remove video", roomData.peers[0])
        delPeerTransports(roomId,username)
        const result = await client.del(`room:${roomId}`);
        console.log(result, 'result of deleting room data from redis')
        //close router
        router.close()
        return
      }
      // Update the Redis entry
      await client.set(roomKey, JSON.stringify(roomData));

      console.log(`Removed ${uname} from room ${roomId}`);
    } else {
      console.log(`Room ${roomId} or ${uname} not found in Redis`);
    }
  })


  socket.on("end-meeting",async()=>{
    io.to(roomId).emit("remove-all-videos")
    console.log('ending the meeting in ', roomId)
    const data = await client.get(`room:${roomId}`);
    if(data){
      const {peers} = JSON.parse(data)
      // console.log(peers)
      for(const peer of peers){
        console.log('About to delete peer transports for:', roomId, peer, 'inside end meet for loop')
        delPeerTransports(roomId, peer)
      }
      const result = await client.del(`room:${roomId}`);
      console.log(result, 'result of deleting room data from redis')
      //close router
      router.close()
    }
  })
  })
})

const createWebRtcTransport = async (router) => {
  // Read config from YAML file
  let transportConfig;
  try {
    const configPath = process.env.WEBRTC_TRANSPORT_YAML || path.join(__dirname, 'webrtc-transport.yaml');
    const fileContents = fs.readFileSync(configPath, 'utf8');
    const config = yaml.load(fileContents) || {};
    transportConfig = config.webrtcTransport || config
  } catch (err) {
    console.error('Error reading webrtc-transport.yaml:', err);
    // Fallback to defaults if YAML not found or invalid
    transportConfig = {
      listenIps: [{ ip: '0.0.0.0', announcedIp: process.env.BACKEND_URL || "127.0.0.1" }],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
    };
  }

  const transport = await router.createWebRtcTransport(transportConfig);

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

const delPeerTransports = async(roomId, uname) =>{
  try{
    console.log('deleting producers, consumers, transports for:', uname)
    await producerInfo.get(`${roomId}:${uname}`).get('video:producer').close();
    await producerInfo.get(`${roomId}:${uname}`).get('audio:producer').close();
    const userConsumers = consumerInfo.get(`${roomId}:${uname}`).get('consumers') || {};

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

    console.log(producerInfo.get(`${roomId}:${uname}`))
    producerInfo.get(`${roomId}:${uname}`).get('producerTransport').close();
    consumerInfo.get(`${roomId}:${uname}`).get('consumerTransport').close();
    producerInfo.delete(`${roomId}:${uname}`)
    consumerInfo.delete(`${roomId}:${uname}`)
  }
  catch(error){
    console.log("Error in deleting peer transports for:", uname, roomId, error)
  }
}

function startServer(){  
  server.listen(PORT,()=>{
    // console.log('started server on port 5001')
  })
  connectRedis();
}

async function stopServer() {
  try{
    for (let [id, socket] of io.sockets.sockets) {
      socket.disconnect(true);
    }
  }catch(e){
    console.error('error closing sockets',e)
  }
  try {
    await new Promise((resolve) => io.close(() => {
      resolve();
    }));
  } catch (e) {
    console.error("[stopServer] Error closing Socket.IO:", e);
  }

  try {
    if (client.isOpen) {
      await client.quit();
    }
  } catch (e) {
    console.error("[stopServer] Error closing Redis client:", e);
  }
  try{
    await server.close()
  }catch(e){
    console.error('server closing err:',e)
  }
}


// startServer()

module.exports = ({startServer, stopServer, io, client});