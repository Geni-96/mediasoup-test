// src/server.js
const express = require('express');
const http = require('http');
// const { mediasoup } = require('mediasoup');
const cors = require('cors')
require('dotenv').config();

const redis = require('redis');
const { createWorkers, getRouter } = require('./mediasoup-config');
(async () => {
  await createWorkers();
})();
const app = express();
const server = http.createServer(app);

const io = require("socket.io")(server);

//for processing audio chunks
const meteorRandom = require('meteor-random');
let sessionId = meteorRandom.id(); // Generate a unique session ID
console.log('Session ID:', sessionId); // Log the session ID for debugging
// let sessionId = 'Jjwjg6gouWLXhMGKW' //static session ID for testing
const axios = require('axios');
const FormData = require('form-data');

const path = require('path')
app.use(express.static(path.join(__dirname, '../client/build')))
// const io = require("socket.io")(server, {
//   cors: {
//     origin: "http://localhost:3000",
//     methods: ["GET", "POST"],
//     credentials: true
//   }
// });

// // cors setup
// app.use(cors({ 
//     origin: "http://localhost:3000", // Allow React frontend
//     credentials: true  // Allow cookies & authentication headers
// }));

// app.use((req, res, next) => {
//     res.setHeader("Access-Control-Allow-Origin", "http://localhost:3000");
//     res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
//     res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
//     res.setHeader("Access-Control-Allow-Credentials", "true");

//     if (req.method === "OPTIONS") {
//         return res.sendStatus(200);
//     }
//     next();
// });

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

// startServer()

// const rooms = new Map()
// const peers = io.of('/mediasoup')
let producer
let consumer
let room;
const paramlist = []
let producerInfo = new Map();
let consumerInfo = new Map();
let botConsumerInfo = new Map()
let username;
io.on("connection", socket =>{

  // console.log('new peer connected', socket.id)
  socket.on('joinRoom', async ({ username, param,create }, callback) => {
    socket.io = io
    const roomId = param;
    socket.join(roomId)
    username = username;
    socket.roomId = roomId;
    let router;
    let uniqueId;
    console.log
    room = await client.exists(`room:${roomId}`);
    if(create || !room){
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
      console.log(`Adding ${username} to existing room ${roomId}`)
      const data = await client.get(`room:${roomId}`);
      console.log(data, 'exiting room data')
      if (data){
        room = JSON.parse(data);
        if (room.peers.includes(username)){
          console.log(`${username} already exists in room ${roomId}`)
          username = `${username}-${Math.floor(Math.random() * 10)}`; // append a random number to username
        }
        router = await getRouter(roomId);
        // console.log('router', router)
        room.peers.push(username);
        await client.set(`room:${roomId}`, JSON.stringify(room));
      }
    }
    console.log('username after making it unique', username)
    socket.emit('changeUsername', username)
    producerInfo.set(`${roomId}:${username}`, new Map());
    consumerInfo.set(`${roomId}:${username}`, new Map());
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
    let paramsList = []
    let audioConsumers = []
    let videoConsumers = []
    try {
      // check if the router can consume the specified producer
      let roomData = await client.get(`room:${roomId}`);
      room = JSON.parse(roomData)
      const cur_peers = room.peers
      const consumers = consumerInfo.get(`${roomId}:${username}`).get('consumers')
      console.log("current peers in the room", cur_peers, "cur username", username)
      
      for(const peer of cur_peers){
        if(peer!=username){
          if (!consumers.has(peer)){
            console.log(`${peer} doesn't have a counsumer in ${username}`)
            // console.log('producerInfo', producerInfo)
            let audioProducer = await producerInfo.get(`${roomId}:${peer}`).get('audio:producer')
            let videoProducer = await producerInfo.get(`${roomId}:${peer}`).get('video:producer')
            // console.log('producer for ',peer, producer)
            if (audioProducer) {
              audioConsumers = await createConsumers(roomId, username, audioProducer, peer, rtpCapabilities)
            }
            if (videoProducer) {
              videoConsumers = await createConsumers(roomId, username, videoProducer, peer, rtpCapabilities)
            }
          }
        }
      }
      paramsList = audioConsumers.concat(videoConsumers)
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

  socket.on('startTranscriptions', async()=>{
    console.log('starting transcriptions')
    let rtpCapabilities = await router.rtpCapabilities
    let audioConsumers = []
    let roomData = await client.get(`room:${roomId}`);
    room = JSON.parse(roomData)
    const cur_peers = room.peers
    botConsumerInfo.set(`${roomId}:bot`, new Map());
    let botConsumerTransport = await createWebRtcTransport(router)
    botConsumerInfo.get(`${roomId}:bot`).set('consumerTransport', botConsumerTransport)
    botConsumerInfo.get(`${roomId}:bot`).set('consumers', new Map())
    const botConsumers = botConsumerInfo.get(`${roomId}:bot`).get('consumers')
    for (const peer of cur_peers){
      if (!botConsumers.has(peer)){
        console.log(`Bot doesn't have a consumer for ${peer}`)
        let audioProducer = await producerInfo.get(`${roomId}:${peer}`).get('audio:producer')
        // console.log('producer for ',peer, producer)
        if (audioProducer) {
          audioConsumers = await createConsumers(roomId, 'bot',audioProducer, peer, rtpCapabilities)
        }
      }
    }
    for (const botConsumer of audioConsumers){
      consumer.on('track', (track) => {
      // Use MediaStream/AudioWorklet to get PCM or encode to WAV
      // Send via socket to mixing server
      // sendTrackToMixingServer(track, userId, roomId);
    });
    }
  })
    
    socket.on('end-transcriptions', async()=>{
      console.log('ending transcriptions')
      // close all the bot consumers
      for(const [peer, consumer] of botConsumers){
        consumer.close()
        botConsumers.delete(peer)
      }
      botConsumerTransport.close()
      botConsumerInfo.delete(`${roomId}:bot`)
    })
  })

  let index = 0;
  let isProcessing = false;
  if (sessionId){
    socket.emit('sessionId', sessionId);
  }
 let processed = new Set()
  socket.on('audioChunks', async ({audioChunk, blobindex}) => {
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
            'https://ai.bluehive.com/api/consume-audio',
            formData,
            {
            headers: {
                'x-bluehive-authorization': 'FBoYfOkX35nT1Uv3XAinrIPbYGBzZGYQPQc2BUjC8lY',
                'Origin': 'https://localhost:8181',
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
    console.log("on one peer left", uname)
    socket.to(roomId).emit('remove video', uname)
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
        delPeerTransports(roomId,username)
        const result = await client.del(`room:${roomId}`);
        console.log(result, 'result of deleting room data from redis')
        io.to(roomId).emit("remove-all-videos")
        return
      }
      // Update the Redis entry
      await client.set(roomKey, JSON.stringify(roomData));

      console.log(`Removed ${uname} from room ${roomId}`);
    } else {
      console.log(`Room ${roomId} or ${uname} not found in Redis`);
    }
  })

  socket.on('peerLeft', (uname) => {
    console.log('peer left:', uname, 'curuser', username)
    consumerInfo.get(`${roomId}:${username}`)?.get('consumers')?.get(uname)?.close()
    consumerInfo.get(`${roomId}:${username}`)?.get('consumers')?.delete(uname)
  })
  
  socket.on("end-meeting",async()=>{
    
    console.log('ending the meeting in ', roomId)
    const data = await client.get(`room:${roomId}`);
    if(data){
      const {peers} = JSON.parse(data)
      // console.log(peers)
      for(const peer of peers){
        console.log('About to delete peer transports for:', roomId, peer, 'inside end meet for loop')
        delPeerTransports(roomId, peer, peers)
      }
      const result = await client.del(`room:${roomId}`);
      console.log(result, 'result of deleting room data from redis')
      
    }
    io.to(roomId).emit("remove-all-videos")
  })
})


const createWebRtcTransport = async (router) => {
  const transport = await router.createWebRtcTransport({
      listenIps: [{ ip: '0.0.0.0', announcedIp: 'https://miewebconf.opensource.mieweb.org' }],
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

async function createConsumers(roomId, uname, curProducer, curPeer, rtpCapabilities) {
  const paramsList = []
  if (!rtpCapabilities || router.canConsume({
    producerId: curProducer.id,
    rtpCapabilities
  })) {
    // transport can now consume and return a consumer
    console.log(`creating consumer for ${curPeer} in ${uname}`)
    consumer = await consumerInfo.get(`${roomId}:${uname}`).get('consumerTransport').consume({
      producerId: curProducer.id,
      rtpCapabilities,
      paused: true,
    })
    consumerInfo.get(`${roomId}:${uname}`).get('consumers').set(`${curPeer}`, consumer)
    console.log('consumer created for:', curPeer, consumer.id)
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
  return paramsList;
}

const delPeerTransports = async(roomId, uname, peers) =>{
  try{
    console.log('deleting producers, consumers, transports for:', uname)
    producerInfo.get(`${roomId}:${uname}`).get('video:producer').close();
    producerInfo.get(`${roomId}:${uname}`).get('audio:producer').close();
    
    // console.log(producerInfo.get(`${roomId}:${uname}`))
    producerInfo.get(`${roomId}:${uname}`).get('producerTransport').close();
    consumerInfo.get(`${roomId}:${uname}`).get('consumerTransport').close();
    
    producerInfo.delete(`${roomId}:${uname}`)
    consumerInfo.delete(`${roomId}:${uname}`)
    console.log("Deleted peer transports for:", uname, roomId);
  }
  catch(error){
    console.log("Error in deleting peer transports for:", uname, roomId, error)
  }
}

function startServer(){  
  server.listen(80,()=>{
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


startServer()

module.exports = ({startServer, stopServer, io, client});