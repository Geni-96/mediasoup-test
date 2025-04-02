import './App.css';
import { React, useState, useRef, useEffect } from 'react';
import { io } from "socket.io-client";
import { Device } from "mediasoup-client";

const socket = io("http://localhost:5001", {
  transports: ["websocket", "polling"],
  withCredentials: true
});

socket.on("connect_error", (error) => {
  console.error("WebSocket Connection Error:", error);
})

function App() {
  const [username, setUsername] = useState('')
  const [roomId, setRoomId] = useState('')
  const [videos, setVideos] = useState([]);
  const [isVisible, setIsVisible] = useState(true)
  const curDevice = useRef(null)
  const [producers, setProducers] = useState([])
  const [consumers, setConsumers] = useState([])
  const producerTransport = useRef(null)
  const consumerTransport = useRef(null)
  const [params, setParams] = useState({
    // mediasoup params
    encodings: [
      {
        rid: 'r0',
        maxBitrate: 100000,
        scalabilityMode: 'S1T3',
      },
      {
        rid: 'r1',
        maxBitrate: 300000,
        scalabilityMode: 'S1T3',
      },
      {
        rid: 'r2',
        maxBitrate: 900000,
        scalabilityMode: 'S1T3',
      },
    ],
    // https://mediasoup.org/documentation/v3/mediasoup-client/api/#ProducerCodecOptions
    codecOptions: {
      videoGoogleStartBitrate: 1000
    }
  })

  useEffect(() => {
    if (params.track) { // Check if the track is available
        connectSendTransport();
        connectRecvTransport();
    }
  }, [params.track]); // Run this effect when params.track changes

  const addParticipantVideo = (id, stream) => {
    setVideos((prevVideos) => [...prevVideos, { id, stream }]); // Store stream and ID
  };

  const removeParticipantVideo = (id) => {
    setVideos((prevVideos) => prevVideos.filter((video) => video.id !== id)); // Remove participant by ID
  };
  const handleSubmit = async(e) =>{
    e.preventDefault()
    let device;
    let rtpCapabilities;

    try{
      if(username && roomId){
        navigator.mediaDevices.getUserMedia({ audio: false, video: true })
        .then(async (stream) => {
          addParticipantVideo('username', stream);
          setIsVisible(false)
          const track = stream.getVideoTracks()[0]
          console.log('printing track', track)
          setParams(prevParams => ({
            ...prevParams,
            track: track
        })
      );
        })
        device = new Device()
        socket.emit("joinRoom", {username, roomId}, async(response) =>{
          if(response.rtpCapabilities){
            rtpCapabilities = response.rtpCapabilities
            await device.load({routerRtpCapabilities: rtpCapabilities})
            curDevice.current = device
            console.log('device created', device.rtpCapabilities)
            socket.emit("createWebRTCTransport", async(response)=>{
              console.log('transports created', response.producer, response.consumer)
              const producerTransportOptions = response.producer
              const consumerTransportOptions = response.consumer
              producerTransport.current = await device.createSendTransport(producerTransportOptions)
              consumerTransport.current = await device.createRecvTransport(consumerTransportOptions)
              
              
            })
          }
        })
      }
      
    }catch(err){
      console.error(err)
    }
  }

  // socket.on('newParticipant', async(peers)=>{
  //   if (producerTransport.current && consumerTransport.current){
  //     peers.forEach((peer)=>{
  //       connectSendTransport
  //       connectRecvTransport
  //     })
  //   }
  // })

   async function connectSendTransport() {
    // we now call produce() to instruct the producer transport
    // to send media to the Router
    // https://mediasoup.org/documentation/v3/mediasoup-client/api/#transport-produce
    // this action will trigger the 'connect' and 'produce' events above
    try{
      console.log("connecting send transport and start producing", params)
      const producer = await producerTransport.current.produce(params)
      setProducers((prevProducers) => [...prevProducers, producer])

      producer.on('trackended', () => {
        console.log('track ended')
        // close video track
      })
    
      producer.on('transportclose', () => {
        console.log('transport ended')
        // close video track
      })
    }catch(err){
      console.error('Error creating producer',err)
    }
  }

  async function connectRecvTransport() {
    // for consumer, we need to tell the server first
    // to create a consumer based on the rtpCapabilities and consume
    // if the router can consume, it will send back a set of params as below
    console.log("connecting recv transport and start consuming")
    await socket.emit('consume', {
      rtpCapabilities: curDevice.current.rtpCapabilities,
    }, async ({ params }) => {
      if (params.error) {
        console.log('Cannot Consume')
        return
      }
  
      console.log(params)
      // then consume with the local consumer transport
      // which creates a consumer
      const consumer = await consumerTransport.current.consume({
        id: params.id,
        producerId: params.producerId,
        kind: params.kind,
        rtpParameters: params.rtpParameters
      })
      setConsumers((prevConsumers) => [...prevConsumers, consumer])
      console.log("consumer created")
      // destructure and retrieve the video track from the producer
      const { track } = consumer
  
      const remoteStream = new MediaStream([track])
      addParticipantVideo(remoteStream)
      console.log("adding new participant video to ui")
      // the server consumer started with media paused
      // so we need to inform the server to resume
      socket.emit('consumer-resume', params.id)
    })
  }

  return (
    <div className="App">
      {isVisible ? (
        <form id="join-screen" onSubmit={handleSubmit}>
          <h2>Join Room</h2>
          <input
            type="text"
            id="username"
            placeholder="Enter your name"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <input
            type="text"
            id="room-id"
            placeholder="Enter room ID"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
          />
          <button id="join-button">Join</button>
        </form>
      ) : null}

      <div id="controls" style={{ display: 'none' }}></div>

      {videos.map(({ id, stream }) => (
        <video
          key={id}
          ref={(video) => {
            if (video) video.srcObject = stream;
          }}
          autoPlay
          playsInline
        />
      ))}
      
    </div>
  );
}

export default App;
