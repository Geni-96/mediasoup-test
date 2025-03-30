import './App.css';
import { React, useState, useRef } from 'react';
import { io } from "socket.io-client";
import { Device } from "mediasoup-client";

const socket = io("http://localhost:5001", {
  transports: ["websocket", "polling"],
  withCredentials: true
});
const device = new Device();

socket.on("connect", () => {
  console.log("Connected to WebSocket server:", socket.id);
  socket.emit('getRouterCapabilities', async (response) => {
    await device.load({ routerRtpCapabilities: response.rtpCapabilities });

    if (!device.canProduce('video')) {
      console.warn('Cannot produce video');
      alert('This device is not compatible');
      return;
    }
  });
});

socket.on("connect_error", (error) => {
  console.error("WebSocket Connection Error:", error);
});

function App() {
  const [username, setUsername] = useState('');
  const [roomId, setRoomId] = useState('');
  const localStream = useRef(null);
  const [videos, setVideos] = useState([]);
  const [isVisible, setIsVisible] = useState(true);
  const sendTransport = useRef(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (username && roomId) {
      socket.emit("joinRoom", { username, roomId }, async (response) => {
        console.log('Received transport options', response.transportOptions);
        const { id, iceParameters, iceCandidates, dtlsParameters } = response.transportOptions;

        sendTransport.current = device.createSendTransport({
          id,
          iceParameters,
          iceCandidates,
          dtlsParameters,
          sctpCapabilities: device.sctpCapabilities,
        });

        // Set transport "connect" event handler.
        sendTransport.current.on('connect', async ({ dtlsParameters }, callback, errback) => {
          try {
            await socket.emit('transport-connect', {
              transportId: sendTransport.current.id,
              dtlsParameters,
            });

            callback();
          } catch (error) {
            errback(error);
          }
        });

        // Set transport "produce" event handler.
        sendTransport.current.on('produce', async ({ kind, rtpParameters, appData }, callback, errback) => {
          try {
            const { id } = await socket.emit('produce', {
              transportId: sendTransport.current.id,
              kind,
              rtpParameters,
              appData,
            });

            callback({ id });
          } catch (error) {
            errback(error);
          }
        });

        // Set transport "producedata" event handler.
        sendTransport.current.on('producedata', async ({ sctpStreamParameters, label, protocol, appData }, callback, errback) => {
          try {
            const { id } = await socket.emit('produceData', {
              transportId: sendTransport.current.id,
              sctpStreamParameters,
              label,
              protocol,
              appData,
            });

            callback({ id });
          } catch (error) {
            errback(error);
          }
        });
      });

      navigator.mediaDevices.getUserMedia({ audio: true, video: true })
        .then(async (stream) => {
          localStream.current = stream;
          setIsVisible(false);
          addParticipantVideo('username', stream); // Add local stream to videos

          // Emit local stream to other participants
          socket.emit('newParticipant', { id: username, stream });

          const tracks = localStream.current.getTracks();
          const producerPromises = tracks.map(async (track) => {
            try {
              // Create a producer for each track
              const producer = await sendTransport.current.produce({
                track,
                encodings: [{ maxBitrate: 1000000 }],
                codecOptions: { video: { framerate: 30 } },
              });
              return producer; // Return the producer
            } catch (error) {
              console.error("Error producing track:", error);
            }
          });

          // Wait for all producers to be created
          const producers = await Promise.all(producerPromises);

          // Produce data (DataChannel).
          const dataProducer = await sendTransport.current.produceData({
            ordered: true,
            label: 'foo',
          });
        })
        .catch((error) => {
          console.error('Error accessing media devices.', error);
          alert('Could not access your camera and microphone. Please check your permissions.');
        });
    }
  };

  const addParticipantVideo = (id, stream) => {
    setVideos((prevVideos) => [...prevVideos, { id, stream }]); // Store stream and ID
  };

  const removeParticipantVideo = (id) => {
    setVideos((prevVideos) => prevVideos.filter((video) => video.id !== id)); // Remove participant by ID
  };

  // Listen for new participants
  socket.on('newParticipant', ({ id, stream }) => {
    addParticipantVideo(id, stream);
  });

  // Listen for participant leaving
  socket.on('participantLeft', (id) => {
    removeParticipantVideo(id);
  });

  // Listen for room joined
  socket.on('roomJoined', (data) => {
    console.log(`Joined room ${data.roomId} as ${data.username}`);
  });

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
