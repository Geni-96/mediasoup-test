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
  const [meetingEnded, setMeetingEnded] = useState(false)
  const curDevice = useRef(null)
  const producerTransport = useRef(null)
  const consumerTransport = useRef(null)
  const [params, setParams] = useState({
    video: {
      track: null,
      encodings: [
        { rid: 'r0', maxBitrate: 100000 },
        { rid: 'r1', maxBitrate: 300000 },
        { rid: 'r2', maxBitrate: 900000 },
      ],
      codecOptions: {
        videoGoogleStartBitrate: 1000
      },
      appData: { mediaTag: 'video' }
    },
    audio: {
      track: null,
      appData: { mediaTag: 'audio' }
    }
  })

  // useEffect(() => {
  //   if (params.track) { // Check if the track is available
        
  //   }
  // }, [params.track]); // Run this effect when params.track changes

  const addParticipantVideo = (user, id, stream) => {
    console.log(stream);
    setVideos((prevVideos) => [...prevVideos, { user, id, stream }]); // Store stream and ID
  };

  const removeParticipantVideo = (user) => {
    setVideos((prevVideos) => prevVideos.filter((video) => video.user !== user)); // Remove participant by username
    if(user===username){
      delPeerTransports()
      setMeetingEnded(true)
    }
  };

  const handleSubmit = async(e) =>{
    e.preventDefault()
    let device;
    let rtpCapabilities;

    try{
      if(username && roomId){
        navigator.mediaDevices.getUserMedia({ 
          audio: true, 
          video: true, 
          audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          googEchoCancellation: true,
          googAutoGainControl: true,
          googNoiseSuppression: true,
          googHighpassFilter: true,
          googTypingNoiseDetection: true,
          googNoiseReduction: true,
          volume: 1.0,
          }, })
        .then(async (stream) => {
          addParticipantVideo(username,'local', stream);
          // localStream.current.srcObject = stream
          setIsVisible(false)
          const videoTrack = stream.getVideoTracks()[0]
          const audioTrack = stream.getAudioTracks()[0]
          // console.log('printing local stream', stream)
          setParams(prev => ({
            video: {
              ...prev.video,
              track: videoTrack
            },
            audio: {
              ...prev.audio,
              track: audioTrack
            }
          }));
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
      const videoProducer = await producerTransport.current.produce(params.video)
      const audioProducer = await producerTransport.current.produce(params.audio)

      videoProducer.on('trackended', () => {
        console.log('video track ended')
      })

      audioProducer.on('trackended', () => {
        console.log('audio track ended')
      })
    
      videoProducer.on('transportclose', () => {
        console.log('video transport ended')
      })

      audioProducer.on('transportclose', () => {
        console.log('audio transport ended')
      })
    }catch(err){
      console.error('Error creating producer',err)
    }
  }

  async function connectRecvTransport() {
    console.log("connecting recv transport and start consuming");
  
    await socket.emit('consume', {
      rtpCapabilities: curDevice.current.rtpCapabilities,
    }, async ({ paramsList }) => {
  
    const userStreams = new Map(); // To group audio/video tracks by user

    try {
      for (const params of paramsList) {
        if (params.error) {
          console.log('error consuming', params.error);
          continue;
        }

        const consumer = await consumerTransport.current.consume({
          id: params.id,
          producerId: params.producerId,
          kind: params.kind,
          rtpParameters: params.rtpParameters
        });

        console.log("consumer created for", params.kind, "from", params.user);

        // Get or create a stream for this user
        let remoteStream = userStreams.get(params.user) || new MediaStream();
        remoteStream.addTrack(consumer.track); // Add either audio or video
        userStreams.set(params.user, remoteStream);

        // Resume the consumer (server started it paused)
        socket.emit('consumer-resume', params.user, params.id);
      }

      // Now add all user streams to the UI
      for (const [user, stream] of userStreams.entries()) {
        const video_id = Math.floor(Math.random() * 100);
        addParticipantVideo(user, video_id, stream); // You might rename this to `addParticipantMedia`
        console.log("added participant media for", user);
      }

    } catch (error) {
      console.error("Error consuming tracks:", error);
    }
  });
}

  async function handleHangup(){
    console.log('Exiting user from call:', username)
    socket.emit('hangup', username);
    delPeerTransports()
    setMeetingEnded(true)
    setVideos([])
    console.log('emitng hangup username', username)
  }

  async function delPeerTransports(){
    console.log('deleting tranports for:',username)
    try{
      
      producerTransport.current.close()
      consumerTransport.current.close()
      const localStream = videos.find(video => video.user === username)?.stream
      console.log(localStream, 'local video for me')
      localStream.getTracks().forEach(track => track.stop());
    }catch(error){
      console.error('error deleting transports for ', username, error)
    }
    
  }

  async function handleEndMeet() {
    socket.emit('end-meeting')
  }

  socket.on('remove video', user=>{
    removeParticipantVideo(user)
  })

  socket.on("remove-all-videos",()=>{
    setVideos([])
    setMeetingEnded(true)
    delPeerTransports()
  })

  return (
    <div className="flex items-center justify-center">
      {meetingEnded ? 
        <div className="w-full h-screen bg-linear-to-br from-gray-300 to-gray-600">
        <h1 className="text-3xl md:text-5xl lg:7xl font-semibold absolute -translate-x-1/2 -translate-y-1/2 top-2/4 left-1/2">Thank you</h1>
        </div>
        : 
        (<div className="container my-10">
          {isVisible ? (
            <form id="join-screen" onSubmit={handleSubmit} className="max-w-9/10 md:max-w-sm mx-auto my-4 p-4 border-2 dark:border-gray-200 border-gray-600">
              <h2 className="dark:text-white text-2xl font-semibold ml-[30%] my-4">Join Room</h2>
              <label className="dark:text-white my-8">
                Display name:
                <input
                type="text"
                id="username"
                placeholder="Enter your name"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                />
              </label>
              <label className="dark:text-white my-8">
                Room number to join:
                <input
                type="text"
                id="room-id"
                placeholder="Enter room ID"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                />
              </label>
              <button id="join-button" className="mt-6 block w-full select-none rounded-lg hover:bg-gray-600 py-3 px-6 text-center align-middle bg-gray-300 dark:bg-gray-800 border border-gray-300 text-gray-900 font-bold uppercase shadow-md shadow-gray-500/20 dark:text-white dark:border-gray-50">Join Meeting</button>
            </form>
          ) : null}

          <div className={`grid gap-2 my-4 mx-10 place-items-center ${videos.length === 1 ? "grid-cols-1" : ""} ${videos.length === 2 ? "grid-cols-2" : ""} ${videos.length > 2 ? "grid-cols-3" : ""}`}>
            {videos.map((video) => (
              <div key={video.id} className="video-frame">
                <video
                    ref={(videoElement) => {
                        if (videoElement) {
                            videoElement.srcObject = video.stream;
                        }
                    }}
                    autoPlay
                    playsInline
                    // muted ={video.id==='local'}
                />
              <div className="video-username">
              {video.user}
              </div>
          </div>
        ))}
        </div>
        {isVisible ? null : 
          <div className="flex items-center justify-center gap-2 md:gap-6 mt-2">
          <button onClick={(e)=>{connectSendTransport()}} className="custom-button">Produce</button>
          <button onClick={(e)=>{connectRecvTransport()}} className="custom-button">Consume</button>
          <button onClick={(e)=>{handleHangup()}} className="custom-button">Leave</button>
          <button onClick={(e)=>{handleEndMeet()}} className="custom-button">End Meeting</button>
        </div>}
        
      </div>)
      }
    </div>
  );
}

export default App;
