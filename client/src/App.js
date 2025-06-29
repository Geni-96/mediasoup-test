import { React, useState, useRef, useEffect } from 'react';
import { io } from "socket.io-client";
import { Device } from "mediasoup-client";
import SmartVoiceRecorder from 'smartaudiomonitor';

const socket = io("https://miewebconfbackend.idcxyz.shop", {
  transports: ["websocket", "polling"],
  withCredentials: true
});

// const socket = io();

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
  const [producerTransport, setProducerTransport] = useState(null);
  const producerCreated = useRef(false);
  const consumers = useRef({});
  const consumerTransport = useRef(null)
  const [sendTransportConnected, setSendTransportConnected] = useState(false);
  const localStream = useRef(null)
  const [isAudioMuted, setIsAudioMuted] = useState(null)
  const [isVideoPaused, setIsVideoPaused] = useState(null)
  const [micIcon, setMicIcon] = useState("mic-24.png")
  const [camIcon, setCamIcon] = useState("video-24.png")
  const [sessionId, setSessionId] = useState(null)
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

  useEffect(() => {
    if (producerTransport?.id && params.video.track) {
      connectSendTransport();
      // sendTransportConnected.current = true;
      setSendTransportConnected(true)
    }
    
  }, [producerTransport, params.video.track]);

  
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

  const handleSubmit = async(e,create, room) =>{
    e.preventDefault()
    setIsVisible(false)
    let device;
    let rtpCapabilities;

    if(!username) {
      alert("Please enter your username to be displayed in the meeting");
      return;
    }
    
    console.log('roomId', roomId, room)
    try{
      if(username && (roomId || room)){
        navigator.mediaDevices.getUserMedia({ 
          audio: false, 
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
          }, 
          })
        .then(async (stream) => {
          addParticipantVideo(username,'local', stream);
          // localStream.current.srcObject = stream
          localStream.current = stream
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
        let param = room || roomId
        console.log('joining room with params', username, param, create)
        socket.emit("joinRoom", {username, param, create}, async(response) =>{
          if(response.rtpCapabilities){
            rtpCapabilities = response.rtpCapabilities
            await device.load({routerRtpCapabilities: rtpCapabilities})
            curDevice.current = device
            console.log('device created', device.rtpCapabilities)
            socket.emit("createWebRTCTransport", async(response)=>{
              console.log("transports received from backend", response.producer, response.consumer)
              const sendTransport = device.createSendTransport(response.producer);
              consumerTransport.current = device.createRecvTransport(response.consumer)
              
              console.log('transports created on frontend', producerTransport, consumerTransport.current)
              
              sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
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

              // producerTransport.on('connectionstatechange', async (state) => {
              //   if (state === 'connected') {
              //     connectSendTransport();
              //   }
              // });
          
              sendTransport.on('produce', async (parameters, callback, errback) => {
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
              setProducerTransport(sendTransport);
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
      const videoProducer = await producerTransport.produce(params.video)
      const audioProducer = await producerTransport.produce(params.audio)
      producerCreated.current = true;

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
        consumers.current[username] = true;
      }

    } catch (error) {
      console.error("Error consuming tracks:", error);
    }
  });
}

socket.on("new-transport", user => {
  console.log("new transport created for ", user)
  
  if(user!==username && !consumers.current[user]){
    connectRecvTransport();
    consumers.current[user] = true
  }
})

  const handleMuteAudio = () =>{
    const audioTrack = localStream.current?.getAudioTracks()[0];
    if (!audioTrack) return;

    const newMutedState = !isAudioMuted;
    audioTrack.enabled = !newMutedState;
    setIsAudioMuted(newMutedState);
    setMicIcon(newMutedState ? "mute-24.png" : "mic-24.png");

    console.log(`Audio ${newMutedState ? "muted" : "unmuted"}.`);
  }

  const handlePauseVideo = ()=>{
    const videoTrack = localStream.current?.getVideoTracks()[0]
    if(!videoTrack) return;

    const newPausedState = !isVideoPaused
    videoTrack.enabled = !newPausedState
    setIsVideoPaused(newPausedState)
    setCamIcon(newPausedState ? "no-video-24.png" : "video-24.png")

    console.log(`Video ${newPausedState ? "video paused" : "video resumed"}`)
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
      
      producerTransport.close()
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

  socket.on('sessionId', (id) => {
    console.log('sessionId received from server:', id);
    setSessionId(id);
    socket.off('sessionId'); // Remove the listener after receiving the sessionId
  }
  );

  const createMeet = (e) => {
    e.preventDefault();
    const room = Math.random().toString(36).substring(2, 15)
    console.log('creating room with id:', room, typeof room) 
    setRoomId(room)
    handleSubmit(e, true, room)
  }
  const joinMeet = (e) => {
    e.preventDefault();
    let paramId;
    if(!roomId){
      paramId = new URLSearchParams(window.location.search).get('roomId');
      if(!paramId){
        alert("Please enter a room ID")
        return
      }
    setRoomId(paramId)
    handleSubmit(e, false, paramId)
  }
}
socket.on('startTranscriptions', () => {
  if(!localStream.current || !localStream.current.getAudioTracks().length) {
    console.error('No audio track available for transcription');
    return;
  }
  console.log('Starting transcriptions for audio track');
  const audioOnlyStream = new MediaStream(localStream.current.getAudioTracks());
  // const processedIndexes = new Set(); // To track processed chunks
    try{
        const recorder = new SmartVoiceRecorder(audioOnlyStream)
        console.log("Creating audio recorder")
        recorder.startMonitoring();
        console.log("Audio recorder started")
        // Start polling for DB recordings every 10 seconds
        let recordingsInterval;
        if (recordingsInterval) clearInterval(recordingsInterval);
        let blobindex = 0
        recordingsInterval = setInterval(async() => {
            blobindex += 1
            const chunks = await recorder.getRecordings()
            const blob = new Blob(chunks, { type: 'audio/webm;codecs=opus' })
            socket.emit('audioChunks', {blob,blobindex});
            for (const chunk of chunks){
                recorder.deleteRecording(chunk.id)
                console.log("Deleted recording with ID:", chunk);
            }
        }, 1000); // 1 seconds
        
    }catch(err){
        console.error('Something went wrong in processing audioChunks',err)
    }
})
const startTranscriptions = () => {
  socket.emit('startTranscriptions', roomId);
}
const copyLink = async(e, type) => {
    const successMessage1 = document.getElementById("icon-success1");
    const defaultMessage1 = document.getElementById("icon-default1");
    const defaultMessage2 = document.getElementById("icon-default2");
    const successMessage2 = document.getElementById("icon-success2");
    try{
        e.preventDefault();
        if (type === "meeting"){
          const windowObject = window.location.href
          await navigator.clipboard.writeText(`${windowObject}?roomId=${roomId}`)
          
          // show the success message
          defaultMessage1.classList.add("hidden");
          successMessage1.classList.remove("hidden");

          // Optionally, reset the success message after a few seconds (for example, 2 seconds)
          setTimeout(function() {
              defaultMessage1.classList.remove("hidden");
              successMessage1.classList.add("hidden");
          }, 2000);
        }else if(type === "transcription" && sessionId){
          await navigator.clipboard.writeText(`https://ai.bluehive.com/session/${sessionId}`)
          
          // show the success message
          defaultMessage2.classList.add("hidden");
          successMessage2.classList.remove("hidden");

          // Optionally, reset the success message after a few seconds (for example, 2 seconds)
          setTimeout(function() {
              defaultMessage2.classList.remove("hidden");
              successMessage2.classList.add("hidden");
          }, 2000);
        }else{
          alert(`No link to copy for type: ${type}`);
          return;
        }
        
    }catch(err){
        console.log('an error occured',err)
    }
}


  return (
    <div className="w-full flex items-center justify-center">
      {meetingEnded ? 
        <div className="w-full h-screen bg-linear-to-br from-gray-300 to-gray-600">
        <h1 className="text-3xl md:text-5xl lg:7xl font-semibold absolute -translate-x-1/2 -translate-y-1/2 top-2/4 left-1/2">Thank you</h1>
        </div>
        : 
        (<div className="container my-10">
          {isVisible ? (
            <div id="join-screen" className="max-w-9/10 md:max-w-md mx-auto my-4 p-4 border-2 dark:border-gray-200 border-gray-600">
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
              
              <div className="flex items-center justify-center mt-6 gap-2 md:gap-6">
                <button id="create-button" onClick={createMeet} type="submit" className="submit-button">Create Meeting</button>
                <button id="join-button" onClick={joinMeet} type="submit" className="submit-button">Join Meeting</button>
              </div>
            </div>
          ) : null}
          <div className={`grid [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))] gap-2 my-4 mx-10 place-items-center`}>
            {videos.map((video) => (
              <div key={video.id} className="video-frame">
                <video
                    id = {video.id}
                    ref={(videoElement) => {
                        if (videoElement) {
                            videoElement.srcObject = video.stream;
                        }
                    }}
                    autoPlay
                    playsInline
                />
              <div className="video-username">
              {video.user}
              </div>
              {/* {isVideoPaused && (
                <div className="p-5 bg-linear-to-br from-white to-gray-400 dark:from-gray-900 dark:to-gray-500 border-2 dark:border-gray-200 border-gray-400 relative">
                  <img src="icon1.png" alt="default-user-icon" className="absolute inset-0  top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"/>
                </div>
              )} */}
          </div>
        ))}
        </div>
        {isVisible ? null : 
          <div className="button-container">
          
          <div className="relative group inline-block">
            <button onClick={handleMuteAudio} className="mic-bg">
              <img src={micIcon} alt="Microphone" style={{ cursor: "pointer" }} className="p-3"></img>
            </button>
            <div class="tool-tip-text">
              Mute/Unmute
              <div class="tool-tip-arrow"></div>
            </div>
          </div>
          <div className="relative group inline-block">
              <button
                id="copyBtn"  onClick={(e) => copyLink(e, "meeting")}
                className="text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 rounded-full p-3 inline-flex items-center justify-center transition-colors"
                aria-label="Copy to clipboard"
              >
                <span id="icon-default1">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 18 20" xmlns="http://www.w3.org/2000/svg">
                    <path d="M16 1h-3.278A1.992 1.992 0 0 0 11 0H7a1.993 1.993 0 0 0-1.722 1H2a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V3a2 2 0 0 0-2-2Zm-3 14H5a1 1 0 0 1 0-2h8a1 1 0 0 1 0 2Zm0-4H5a1 1 0 0 1 0-2h8a1 1 0 1 1 0 2Zm0-5H5a1 1 0 0 1 0-2h2V2h4v2h2a1 1 0 1 1 0 2Z"/>
                  </svg>
                </span>

                <span id="icon-success1" class="hidden">
                  <svg class="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 16 12" xmlns="http://www.w3.org/2000/svg">
                    <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M1 5.917 5.724 10.5 15 1.5"/>
                  </svg>
                </span>
              </button>
              <div class="tool-tip-text">
                Meeting Link
                <div class="tool-tip-arrow"></div>
              </div>
          </div>
          <div className="relative group inline-block">
            <button onClick={startTranscriptions} className="mic-bg">
              <img src="transcriptions.png" alt="Transcriptions Icon" style={{cursor:"pointer"}} className="p-3"></img>
            </button>
            <div class="tool-tip-text">
              Transcribe
              <div class="tool-tip-arrow"></div>
            </div>
          </div>
          <div className="relative group inline-block">
              <button
                id="copyBtn"  onClick={(e) => copyLink(e, "transcription")}
                class="text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 rounded-full p-3 inline-flex items-center justify-center transition-colors"
                aria-label="Copy to clipboard"
              >
                <span id="icon-default2">
                  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 18 20" xmlns="http://www.w3.org/2000/svg">
                    <path d="M16 1h-3.278A1.992 1.992 0 0 0 11 0H7a1.993 1.993 0 0 0-1.722 1H2a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V3a2 2 0 0 0-2-2Zm-3 14H5a1 1 0 0 1 0-2h8a1 1 0 0 1 0 2Zm0-4H5a1 1 0 0 1 0-2h8a1 1 0 1 1 0 2Zm0-5H5a1 1 0 0 1 0-2h2V2h4v2h2a1 1 0 1 1 0 2Z"/>
                  </svg>
                </span>

                <span id="icon-success2" class="hidden">
                  <svg class="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 16 12" xmlns="http://www.w3.org/2000/svg">
                    <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M1 5.917 5.724 10.5 15 1.5"/>
                  </svg>
                </span>
              </button>
              <div class="tool-tip-text">
                Transcriptions Link
                <div class="tool-tip-arrow"></div>
              </div>
          </div>
          <div className="relative group inline-block">
            <button onClick={(e)=>{handleHangup()}} className="mic-bg">
              <img src="leaveMeet.png" alt="Leave Meeting" style={{cursor:"pointer"}} className="p-3"></img>
            </button>
            <div class="tool-tip-text">
                Leave Meeting
                <div class="tool-tip-arrow"></div>
              </div>
          </div>
          <div className="relative group inline-block">
            <button  onClick={(e)=>{handleEndMeet()}} className="mic-bg">
              <img src="endMeet.png" alt="End meeting" style={{cursor:"pointer"}} className="p-3"></img>
            </button>
            <div class="tool-tip-text">
                End Meeting
                <div class="tool-tip-arrow"></div>
            </div>
          </div>
          <div className="relative group inline-block">
          <button onClick={handlePauseVideo} className="mic-bg">
            <img src={camIcon} alt="Video Icon" style={{cursor:"pointer"}} className="p-3"></img>
          </button>
          <div class="tool-tip-text">
              Show/Hide Video
              <div class="tool-tip-arrow"></div>
            </div>
          </div>
        </div>}
        
      </div>)
      }
    </div>
  );
}

export default App;
