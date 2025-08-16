// src/server.js
const express = require('express');
const http = require('http');
require('dotenv').config();

const redis = require('redis');
const yaml = require('js-yaml');

const { createWorkers, getRouter } = require('./mediasoup-config');
(async () => {
  await createWorkers();
})();

//environment variables
const PORT = process.env.PORT || 5001;
const BACKEND_IP = process.env.BACKEND_IP || '127.0.0.1';

const app = express();
const server = http.createServer(app);


const io = require("socket.io")(server);
// fs and path are used for parsing yaml content
const fs = require('fs');
const path = require('path')
app.use(express.static(path.join(__dirname, '../client/build')))

function validateEnv() {
  const requiredVars = ['REDIS_HOST', 'REDIS_PORT', 'REDIS_PASSWORD'];
  const missing = requiredVars.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.log(`Missing required environment variables: ${missing.join(', ')}`)
    console.log('using device storage instead')
    return false
  }
  return true
}

// Call before using Redis
if (validateEnv()){
  client = redis.createClient({
    username: 'default',
    password: process.env.REDIS_PASSWORD,
    socket: {
        host: process.env.REDIS_HOST,
        port: process.env.REDIS_PORT
    }
  });
  (async () => {
    await client.connect();
    console.log('Connected to Redis');
  })();
  client.on('error', err => console.log('Redis Client Error', err));
}

const rooms = new Map()
let producer
let consumer
let room;
const paramlist = []
let producerInfo = new Map();
let consumerInfo = new Map();
// let username;
io.on("connection", socket =>{

  // console.log('new peer connected', socket.id)
  socket.on('joinRoom', async ({ username, param,create }, callback) => {
    socket.io = io
    const roomId = param;
    socket.join(roomId)
    // username = username;
    socket.roomId = roomId;
    let router;

    producerInfo.set(`${roomId}:${username}`, new Map());
    consumerInfo.set(`${roomId}:${username}`, new Map());

    if(client){
      room = await client.exists(`room:${roomId}`);
    
    if(create || !room){
      if(room){
        return callback({error: 'Please try again, room already exists'})
      }
      console.log('creating a new room with id:', roomId, `Adding user:${username}`)
      router = await getRouter(roomId);
      
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
    }}
    else{
      console.log('No redis client found, using device storage')
      room = rooms.get(roomId)
      if(!room){
        console.log('creating a new room with Id:', roomId, `Adding user:${username}`)
        router = await getRouter(roomId);
        rooms.set(roomId, {router, peers: []})
        room = rooms.get(roomId)
        if(rooms.has(roomId)){
          rooms.peers.push(username)
        }
      }
      else{
        console.log(`Adding ${username} to exising room ${roomId}`)
        router = room.router
        if(rooms.has(roomId)){
          room = rooms.get(roomId)
          room.peers.push(username)
          socket.emit("newParticipant", room.peers)
          console.log("emitting new participant event and sending peers", room.peers)
        }
      }
    }
    console.log('username after making it unique', username)
    socket.emit('changeUsername', username)
    
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

      //if using redis for storage of room data
      if(client){
        let roomData = await client.get(`room:${roomId}`);
        room = JSON.parse(roomData)
      }
      
      const cur_peers = room.peers
      const consumers = consumerInfo.get(`${roomId}:${username}`).get('consumers')
      console.log("current peers in the room", cur_peers, "cur username", username)
      
      async function createConsumers(curProducer, curPeer){
        if (router.canConsume({
          producerId: curProducer.id,
          rtpCapabilities
        })) {
          // transport can now consume and return a consumer
          console.log(`creating consumer for ${curPeer} in ${username}`)
          consumer = await consumerInfo.get(`${roomId}:${username}`).get('consumerTransport').consume({
            producerId: curProducer.id,
            rtpCapabilities,
            paused: true,
          })
          consumerInfo.get(`${roomId}:${username}`).get('consumers').set(`${curPeer}`, consumer)
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


  socket.on('hangup', async(uname) =>{
    console.log("on one peer left", uname)
    socket.to(roomId).emit('remove video', uname)
    
    //remove peer from redis
    if(client){
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
  }
  // if there's no redis
  else{
    room.peers = room.peers.filter(peer => peer !== uname);

      // Optionally remove the room if it's empty
      if (room.peers.length ===  1) {
        io.to(roomId).emit("remove video", room.peers[0])
        delPeerTransports(roomId,username)
        rooms.delete(roomId);
        router.close()
        return
      } else {
        rooms.set(roomId, room); // update Map (technically not needed unless replacing the object)
      }
  }
  })

  socket.on("end-meeting",async()=>{
    
    console.log('ending the meeting in ', roomId)
    let users;
    if(client){
      const data = await client.get(`room:${roomId}`);
      if(data){
        const {peers} = JSON.parse(data)
        users = peers
      }
    }
    else{
      users = room.peers
    }
      // console.log(peers)
      for(const peer of users){
        console.log('About to delete peer transports for:', roomId, peer, 'inside end meet for loop')
        delPeerTransports(roomId, peer)
      }
      if(client){
        const result = await client.del(`room:${roomId}`);
        console.log(result, 'result of deleting room data from redis')
      }else{
        rooms.delete(roomId)
      }
      io.to(roomId).emit("remove-all-videos")
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
      listenIps: [{ ip: '0.0.0.0', announcedIp: BACKEND_IP || "127.0.0.1" }],
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
  server.listen(PORT,()=>{
    console.log(`started server on port ${PORT}`)
  })
  // connectRedis();
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