// src/server.js
const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
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

// IndexedCP integration for separate audio and annotation uploads
const { 
  initializeIndexedCP, 
  uploadAnnotationsToIndexedCP, 
  uploadAudioToIndexedCP, 
  uploadMetadataToIndexedCP 
} = require('./indexedcp-client');

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
let botInfo = new Map()
let username;

// Speaker Diarization System
const audioLevelObservers = new Map(); // roomId -> AudioLevelObserver
const speakerLogs = new Map(); // roomId -> { [user]: { speaking: boolean, startTime: number } }
const speakerTimelines = new Map(); // roomId -> [{ user, start, end }]

// Speaker diarization functions
function initializeSpeakerDiarization(roomId) {
  if (!speakerLogs.has(roomId)) {
    speakerLogs.set(roomId, {});
    speakerTimelines.set(roomId, []);
    console.log(`Initialized speaker diarization for room: ${roomId}`);
  }
}

async function createAudioLevelObserver(router, roomId) {
  try {
    const audioLevelObserver = await router.createAudioLevelObserver({
      maxEntries: 10,
      threshold: -50, // dBFS
      interval: 100   // ms
    });

    audioLevelObserver.on('volumes', (volumes) => {
      const now = Date.now() / 1000; // Convert to seconds
      const currentSpeakers = speakerLogs.get(roomId) || {};
      const timeline = speakerTimelines.get(roomId) || [];

      // Process current speaking participants
      const activeSpeakers = new Set();
      volumes.forEach(({ producer, volume }) => {
        // Find the username associated with this producer
        for (const [key, producerMap] of producerInfo.entries()) {
          if (key.startsWith(`${roomId}:`)) {
            const user = key.split(':')[1];
            const audioProducer = producerMap.get('audio:producer');
            if (audioProducer && audioProducer.id === producer.id) {
              activeSpeakers.add(user);
              
              // Start speaking event
              if (!currentSpeakers[user] || !currentSpeakers[user].speaking) {
                currentSpeakers[user] = { speaking: true, startTime: now };
                console.log(`${user} started speaking at ${now}`);
              }
            }
          }
        }
      });

      // Process users who stopped speaking
      Object.keys(currentSpeakers).forEach(user => {
        if (currentSpeakers[user].speaking && !activeSpeakers.has(user)) {
          const endTime = now;
          const startTime = currentSpeakers[user].startTime;
          
          // Add to timeline
          timeline.push({
            user,
            start: startTime,
            end: endTime
          });
          
          currentSpeakers[user].speaking = false;
          console.log(`${user} stopped speaking. Duration: ${endTime - startTime}s`);
        }
      });

      speakerLogs.set(roomId, currentSpeakers);
      speakerTimelines.set(roomId, timeline);
    });

    audioLevelObserver.on('silence', () => {
      // Handle silence - end all current speaking sessions
      const now = Date.now() / 1000;
      const currentSpeakers = speakerLogs.get(roomId) || {};
      const timeline = speakerTimelines.get(roomId) || [];

      Object.keys(currentSpeakers).forEach(user => {
        if (currentSpeakers[user].speaking) {
          timeline.push({
            user,
            start: currentSpeakers[user].startTime,
            end: now
          });
          currentSpeakers[user].speaking = false;
          console.log(`${user} stopped speaking (silence detected)`);
        }
      });

      speakerLogs.set(roomId, currentSpeakers);
      speakerTimelines.set(roomId, timeline);
    });

    audioLevelObservers.set(roomId, audioLevelObserver);
    console.log(`Created AudioLevelObserver for room: ${roomId}`);
    return audioLevelObserver;
  } catch (error) {
    console.error(`Error creating AudioLevelObserver for room ${roomId}:`, error);
    throw error;
  }
}

function addProducerToObserver(roomId, producer) {
  const observer = audioLevelObservers.get(roomId);
  if (observer && producer.kind === 'audio') {
    observer.addProducer({ producerId: producer.id });
    console.log(`Added audio producer to observer for room: ${roomId}`);
  }
}

function removeProducerFromObserver(roomId, producer) {
  const observer = audioLevelObservers.get(roomId);
  if (observer && producer.kind === 'audio') {
    observer.removeProducer({ producerId: producer.id });
    console.log(`Removed audio producer from observer for room: ${roomId}`);
  }
}

async function writeSpeakerLogToFile(roomId, sessionId) {
  const timeline = speakerTimelines.get(roomId) || [];
  const logData = {
    roomId,
    sessionId,
    timestamp: new Date().toISOString(),
    speakers: timeline
  };

  const logDir = path.join(__dirname, '../logs');
  
  // Ensure logs directory exists
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  try {
    // Write room-based log (EXISTING FUNCTIONALITY - DO NOT MODIFY)
    const roomLogPath = path.join(logDir, `speaker-log-${roomId}.json`);
    fs.writeFileSync(roomLogPath, JSON.stringify(logData, null, 2));
    
    // Write session-based log
    // const sessionLogPath = path.join(logDir, `speaker-log-${sessionId}.json`);
    // fs.writeFileSync(sessionLogPath, JSON.stringify(logData, null, 2));
    
    console.log(`Speaker logs written for room ${roomId} and session ${sessionId}`);
    console.log(`Total speaking events: ${timeline.length}`);
    
    // ADD: Upload annotations to IndexedCP (non-disruptive)
    uploadAnnotationsToIndexedCP(roomId, sessionId, logData).catch(error => {
      console.error('IndexedCP annotation upload failed, continuing normally:', error.message);
    });
    
  } catch (error) {
    console.error(`Error writing speaker log for room ${roomId}:`, error);
  }
}

function cleanupSpeakerDiarization(roomId) {
  // Finalize any ongoing speaking sessions
  const now = Date.now() / 1000;
  const currentSpeakers = speakerLogs.get(roomId) || {};
  const timeline = speakerTimelines.get(roomId) || [];

  Object.keys(currentSpeakers).forEach(user => {
    if (currentSpeakers[user].speaking) {
      timeline.push({
        user,
        start: currentSpeakers[user].startTime,
        end: now
      });
    }
  });

  speakerTimelines.set(roomId, timeline);

  // Close and remove observer
  const observer = audioLevelObservers.get(roomId);
  if (observer) {
    observer.close();
    audioLevelObservers.delete(roomId);
  }

  console.log(`Cleaned up speaker diarization for room: ${roomId}`);
}
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
        
        // Initialize speaker diarization for new room
        initializeSpeakerDiarization(roomId);
        await createAudioLevelObserver(router, roomId);
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
        
        // Initialize speaker diarization if not already done
        if (!speakerLogs.has(roomId)) {
          initializeSpeakerDiarization(roomId);
          await createAudioLevelObserver(router, roomId);
        }
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
      console.log(consumerInfo.get(`${roomId}:${username}`).get('consumers'), 'consumers for current user')
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
    
    // Add audio producer to speaker diarization observer
    if (kind === 'audio') {
      addProducerToObserver(roomId, producer);
    }
    
    // console.log('producer from map', producerInfo)
    io.to(roomId).emit("new-transport", username)
    
    producer.on('transportclose', () => {
      console.log('transport for this producer closed ')
      // Remove from observer before closing
      if (kind === 'audio') {
        removeProducerFromObserver(roomId, producer);
      }
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

//   socket.on('startTranscriptions', async () => {
//     const roomData = await client.get(`room:${roomId}`);
//     const room = JSON.parse(roomData);
//     const cur_peers = room.peers;

//     const plainTransport = await router.createPlainTransport({
//       listenIp: '127.0.0.1',
//       rtcpMux: true,
//       comedia: false
//     });
//     const portBase = 4000; // increment per user
//     const handshake = {
//       sessionId,
//       roomId,
//       ports: [],
//     };

//     botInfo.set('plainTransport', plainTransport);
//     botInfo.set('consumers', new Map());

//     for (let i = 0; i < cur_peers.length; i++) {
//       const peer = cur_peers[i];
//       const producer = producerInfo.get(`${roomId}:${peer}`).get(`audio:producer`);
//       const port = portBase + i;
//       handshake.ports.push({ peerId: peer, port });

//       const consumer = await plainTransport.consume({
//         producerId: producer.id,
//         rtpCapabilities: router.rtpCapabilities,
//         paused: false
//       });

//       await consumer.setPreferredLayers({ spatialLayer: 0 });
//       botInfo.get('consumers').set(`${peer}`, consumer);
//       // Connect to mixer app
//       await plainTransport.connect({ ip: '127.0.0.1', port });
//     }

//     // Send handshake
//     fetch('http://localhost:8000/mixer/start', {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify(handshake),
//     });
//   });


//   let index = 0;
//   let isProcessing = false;
//   if (sessionId){
//     socket.emit('sessionId', sessionId);
//   }
//  let processed = new Set()
//   socket.on('audioChunks', async ({audioChunk, blobindex}) => {
//     console.log("Received audio chunk", typeof audioChunk, audioChunk);
//     if (blobindex in processed){
//       return
//     }
//         // Only handle Buffer (socket.io will send as Buffer from Node.js client, or as {type: 'Buffer', data: ...} from some clients)
//         let buf;
//         if (Buffer.isBuffer(audioChunk)) {
//             buf = audioChunk;
//         } else if (audioChunk && audioChunk.type === 'Buffer' && Array.isArray(audioChunk.data)) {
//             buf = Buffer.from(audioChunk.data);
//         } else {
//             console.log("Unknown audioChunk type, skipping.");
//             return;
//         }
//         if (buf.length === 0) {
//             console.log("Skipping empty audio chunk.");
//             return;
//         }
//         if (isProcessing) {
//             console.log("Still processing previous chunk, skipping this one.");
//             return;
//         }

//         isProcessing = true;
//         const formData = new FormData();
//         formData.append('index', index );
//         formData.append('type','audio/webm;codecs=opus')
//         formData.append('sessionId', sessionId);
//         formData.append('audioId', uniqueId)
//         formData.append('data', buf, `chunk-${index}`);
//         console.log(index, sessionId, uniqueId, buf, formData.getHeaders())
//         try{
//             console.log('sending audio chunk to Bluehive AI', formData)
//             const response = await axios.post(
//             'https://ai.bluehive.com/api/consume-audio',
//             formData,
//             {
//             headers: {
//                 'x-bluehive-authorization': 'FBoYfOkX35nT1Uv3XAinrIPbYGBzZGYQPQc2BUjC8lY',
//                 'Origin': 'https://localhost:8181',
//                 ...formData.getHeaders()
//                 },
//             })
//             console.log(response.data);
//             index++;
//             // callback(`Audio chunk ${index} sent successfully.`);
//             processed.add(blobindex)
//         }catch(err){
//             console.error('Error sending audio chunks to ozwell', err)
//         }
//         finally{
//             isProcessing = false;

//         }
//   })


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
        
        // Write final speaker log and cleanup
        await writeSpeakerLogToFile(roomId, sessionId);
        cleanupSpeakerDiarization(roomId);
        
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

  socket.on('peerLeft', async(uname) => {
    console.log('peer left:', uname, 'curuser', username)
    consumerInfo.get(`${roomId}:${username}`)?.get('consumers')?.get(uname)?.close()
    consumerInfo.get(`${roomId}:${username}`)?.get('consumers')?.delete(uname)
    botInfo?.get('consumers')?.get(uname)?.close()
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
      
      // Write final speaker log and cleanup
      await writeSpeakerLogToFile(roomId, sessionId);
      cleanupSpeakerDiarization(roomId);
      
      const result = await client.del(`room:${roomId}`);
      console.log(result, 'result of deleting room data from redis')
      
    }
    const botConsumers = await botInfo?.get('consumers');
    for (const [peer, consumer] of botConsumers.entries()) {
      console.log('closing bot consumer for:', peer)
      consumer.close();
    }
    botInfo?.get('plainTransport')?.close()
    io.to(roomId).emit("remove-all-videos")
  })

  // NEW: Audio upload event for IndexedCP integration
  socket.on('upload-mixed-audio', async ({ audioData, fileExtension, metadata }, callback) => {
    try {
      console.log(`Received mixed audio upload request for room ${roomId}, session ${sessionId}`);
      
      // Convert base64 audio data to buffer if needed
      let audioBuffer;
      if (typeof audioData === 'string') {
        // Assume base64 encoded data
        audioBuffer = Buffer.from(audioData, 'base64');
      } else if (Buffer.isBuffer(audioData)) {
        audioBuffer = audioData;
      } else {
        throw new Error('Invalid audio data format');
      }
      
      // Upload to IndexedCP (non-disruptive)
      const success = await uploadAudioToIndexedCP(roomId, sessionId, audioBuffer, fileExtension || 'webm');
      
      // Optionally upload metadata if provided
      if (metadata && success) {
        await uploadMetadataToIndexedCP(roomId, sessionId, {
          ...metadata,
          participantCount: Object.keys(consumerInfo.get(`${roomId}:${username}`)?.get('consumers') || {}).length,
          uploadTimestamp: new Date().toISOString()
        }).catch(error => {
          console.error('Metadata upload failed:', error.message);
        });
      }
      
      // Always call callback with success status
      if (callback) {
        callback({ 
          success: success, 
          message: success ? 'Audio uploaded successfully' : 'Audio upload failed, but system continues normally' 
        });
      }
      
    } catch (error) {
      console.error('Error handling audio upload:', error.message);
      // Non-disruptive: always respond positively to client
      if (callback) {
        callback({ 
          success: false, 
          message: 'Audio upload failed, but system continues normally' 
        });
      }
    }
  });

  })
})

const createWebRtcTransport = async (router) => {
  const transport = await router.createWebRtcTransport({
      listenIps: [{ ip: '0.0.0.0', announcedIp: '127.0.0.1' }],
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

const delPeerTransports = async(roomId, uname, peers) =>{
  try{
    console.log('deleting producers, consumers, transports for:', uname)
    
    // Remove producers from observer before closing
    const videoProducer = producerInfo.get(`${roomId}:${uname}`).get('video:producer');
    const audioProducer = producerInfo.get(`${roomId}:${uname}`).get('audio:producer');
    
    if (audioProducer) {
      removeProducerFromObserver(roomId, audioProducer);
      audioProducer.close();
    }
    if (videoProducer) {
      videoProducer.close();
    }
    
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
  server.listen(5001,()=>{
    // console.log('started server on port 5001')
  })
  connectRedis();
  
  // Initialize IndexedCP client (non-disruptive)
  initializeIndexedCP().catch(error => {
    console.error('IndexedCP initialization failed, continuing without it:', error.message);
  });
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