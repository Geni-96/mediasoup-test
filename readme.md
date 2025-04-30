
## 🎥 Mediasoup based Video Conferencing App

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

### 🔧 Required Environment Variables

Your app requires the following environment variables to connect to Redis:

- `REDIS_HOST` – the hostname of your Redis server
- `REDIS_PORT` – the port (usually 6379)
- `REDIS_PASSWORD` – the password for authentication.  

You can define these in your environment or in a `.env` file.  
Make sure to run Redis locally or use a cloud Redis provider.    
All usernames within a room must be unique.    

### 🧑‍💻 Usage
 
npm start   
By default, the app runs on http://localhost:5001.  


### 📡 How It Works

- User enters a username and room ID.
- If the room ID exists, the user joins the room; otherwise, a new room is created.
- Media capabilities are negotiated using Mediasoup.
- Media streams are transmitted over WebRTC using a Send/Receive transport.
- Redis ensures that multiple rooms and users can be handled simultaneously without collisions.

### 🧪 Features in Progress / TODO

- Add additional workers and implement round robin.
- UI Changes for preserving the state.
