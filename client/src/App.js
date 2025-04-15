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
      },
      {
        rid: 'r1',
        maxBitrate: 300000,
      },
      {
        rid: 'r2',
        maxBitrate: 900000,
      },
    ],
    // https://mediasoup.org/documentation/v3/mediasoup-client/api/#ProducerCodecOptions
    codecOptions: {
      videoGoogleStartBitrate: 1000
    }
  })

  // useEffect(() => {
  //   if (params.track) { // Check if the track is available
        
  //   }
  // }, [params.track]); // Run this effect when params.track changes

  const addParticipantVideo = (user, id, stream) => {
    setVideos((prevVideos) => [...prevVideos, { user, id, stream }]); // Store stream and ID
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
          addParticipantVideo(username,'local', stream);
          // localStream.current.srcObject = stream
          setIsVisible(false)
          const track = stream.getVideoTracks()[0]
          console.log('printing local stream', stream)
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
              
              producerTransport.current = await device.createSendTransport(response.producer)
              consumerTransport.current = await device.createRecvTransport(response.consumer)

              producerTransport.current.on('connect', async ({ dtlsParameters }, callback, errback) => {
                try {
                  // Signal local DTLS parameters to the server side transport
                  // see server's socket.on('transport-connect', ...)
                  await socket.emit('transport-connect', {
                    dtlsParameters,
                  })
          
                  // Tell the transport that parameters were transmitted.
                  callback()
          
                } catch (error) {
                  errback(error)
                }
              })
          
              producerTransport.current.on('produce', async (parameters, callback, errback) => {
                console.log(parameters)
          
                try {
                  // tell the server to create a Producer
                  // with the following parameters and produce
                  // and expect back a server side producer id
                  // see server's socket.on('transport-produce', ...)
                  await socket.emit('transport-produce', {
                    kind: parameters.kind,
                    rtpParameters: parameters.rtpParameters,
                    appData: parameters.appData,
                  }, ({ id }) => {
                    // Tell the transport that parameters were transmitted and provide it with the
                    // server side producer's id.
                    callback({ id })
                  })
                } catch (error) {
                  errback(error)
                }
              })

              consumerTransport.current.on('connect', async ({ dtlsParameters }, callback, errback) => {
                try {
                  // Signal local DTLS parameters to the server side transport
                  // see server's socket.on('transport-recv-connect', ...)
                  await socket.emit('transport-recv-connect', {
                    dtlsParameters,
                  })
          
                  // Tell the transport that parameters were transmitted.
                  callback()
                } catch (error) {
                  // Tell the transport that something was wrong
                  errback(error)
                }
              })
            })
          }
        })
      }
      
    }catch(err){
      console.error(err)
    }
  }

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
    }, async ({ paramsList }) => {
  
      console.log(paramsList)
      // then consume with the local consumer transport
      // which creates a consumer
      try{
        paramsList.forEach(async(params)=>{
          if(params.error){
            console.log('error consuming', params.error)
            return
          }
          console.log('paramlist for each')
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
          console.log('track from consumer', track)
          let remoteStream = new MediaStream([track])
          // console.log(remoteStream.current.srcObject, 'check state of remote stream', localStream.current.srcObject)
          let video_id = Math.floor(Math.random() * 100)
          addParticipantVideo(params.user, video_id,remoteStream)
          console.log("adding new participant video to ui", remoteStream)
          // the server consumer started with media paused
          // so we need to inform the server to resume
          socket.emit('consumer-resume', params.user, params.id)
        })
      }catch(error){
        console.log(error)
      }      
    })
  }

  async function handleHangup(){
    console.log('Exising user from call:', username)
    io.emit('hangup', username)
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

      <div id="controls">
      {/* <video ref={localStream} autoPlay playsInline></video>
      <video ref={remoteStream} autoPlay playsInline></video> */}
      {videos.map((video) => (
        <div key={video.id} style={{ position: 'relative', display: 'inline-block', margin: '10px' }}>
            <video
                ref={(videoElement) => {
                    if (videoElement) {
                        videoElement.srcObject = video.stream;
                    }
                }}
                autoPlay
                controls
                playsInline
                style={{ width: '320px', height: '240px' }} // Adjust size as needed
            />
            <div
                style={{
                    position: 'absolute',
                    top: '5px',
                    right: '5px',
                    backgroundColor: 'rgba(0, 0, 0, 0.7)',
                    color: 'white',
                    padding: '5px',
                    borderRadius: '3px',
                    fontSize: '14px',
                }}
            >
                {video.user}
            </div>
        </div>
      ))}
      </div>
      <button onClick={(e)=>{connectSendTransport()}}>Produce</button>
      <button onClick={(e)=>{connectRecvTransport()}}>Consume</button>
      <button onClick={(e)=>{handleHangup()}}>Hangup</button>
    </div>
  );
}

export default App;
