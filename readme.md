
## 🎥 Mediasoup Video Conferencing App

[short demo](https://youtube.com/shorts/fFixahtMb28?feature=shared)

A full-stack WebRTC-based video conferencing application built using React, Socket.IO, Express, Mediasoup, and Redis.

### 🚀 Features

- Real-time group video/audio calling using Mediasoup
- Socket.IO-based signaling for fast and reliable communication
- Redis integration to support multiple concurrent calls across rooms
- Join or create rooms using a unique roomId
- Enter a unique username for each call session
- Mute/unmute audio and video during calls
- Leave the call anytime

### 🛠️ Tech Stack

Frontend    - 	React  
Backend	    -   Express, Socket.IO  
Media Layer -	Mediasoup  
Data Store	-   Redis (for room/call management)  

### 🧑‍💻 Usage

1. Start the backend   
cd server   
npm install   
npm run start   
2. Start the frontend   
cd client   
npm install   
npm run start   
By default, the frontend runs on http://localhost:3000 and the backend on http://localhost:5001.  
Make sure to run Redis locally or use a cloud Redis provider.  
All usernames within a room must be unique.  

### 📡 How It Works

- User enters a username and room ID.
- If the room ID exists, the user joins the room; otherwise, a new room is created.
- Media capabilities are negotiated using Mediasoup.
- Media streams are transmitted over WebRTC using a Send/Receive transport.
- Redis ensures that multiple rooms and users can be handled simultaneously without collisions.

### 🧪 Features in Progress / TODO

- Extending functionality for audio tracks as well.
- Adding hangup functionality
- Making produce/consume automatic.
- Add additional workers and implement round robin.
- UI Changes
