# WebRTC Video Chat

A simple peer-to-peer video chat application built with WebRTC technology, TypeScript, and Docker. No user registration required - just create a room and share the link!

## Features

- Create video chat rooms instantly without registration
- Share room links with others to join
- Real-time audio and video communication
- Support for multiple participants
- Video and audio toggle controls
- Responsive design for desktop and mobile
- Dockerized for easy deployment

## Technology Stack

- **WebRTC** - Peer-to-peer video/audio communication
- **TypeScript** - Type-safe server-side code
- **Node.js & Express** - Web server
- **WebSocket (ws)** - Signaling server for WebRTC coordination
- **Docker** - Containerization
- **Vanilla JavaScript** - Client-side logic
- **HTML/CSS** - User interface

## Architecture

The application uses a client-server architecture:

1. **Signaling Server** - WebSocket server that coordinates peer connections
   - Manages rooms and clients
   - Exchanges WebRTC signaling messages (offers, answers, ICE candidates)
   - Does NOT relay media (media goes peer-to-peer)

2. **WebRTC Peers** - Browser clients that establish direct connections
   - Uses STUN servers for NAT traversal
   - Direct peer-to-peer media streaming
   - Multiple peer support in the same room

## Prerequisites

- **Docker & Docker Compose** (recommended)
  - OR -
- **Node.js** (v18 or higher) and npm

## Installation & Running

### Option 1: Using Docker (Recommended)

1. Clone or navigate to the project directory:
```bash
cd webrtc-video-chat
```

2. Build and run with Docker Compose:
```bash
docker-compose up --build
```

3. Open your browser and navigate to:
```
http://localhost:3000
```

4. To stop the application:
```bash
docker-compose down
```

### Option 2: Running Locally (Without Docker)

1. Navigate to the project directory:
```bash
cd webrtc-video-chat
```

2. Install dependencies:
```bash
npm install
```

3. Build the TypeScript code:
```bash
npm run build
```

4. Start the server:
```bash
npm start
```

Or for development with auto-reload:
```bash
npm run dev
```

5. Open your browser and navigate to:
```
http://localhost:3000
```

## How to Use

### Creating a Room

1. Open the application in your browser
2. Click **"Create Room"** button
3. Allow camera and microphone access when prompted
4. You'll see your room ID and a shareable link
5. Copy the link and share it with others

### Joining a Room

**Method 1: Using the shared link**
- Simply click on the link shared by the room creator
- The room ID will be auto-filled
- Click "Join Room" and allow camera/microphone access

**Method 2: Manual entry**
- Open the application
- Enter the room ID in the input field
- Click "Join Room"
- Allow camera and microphone access when prompted

### During the Call

- **Stop Video** - Toggle your video on/off
- **Mute** - Toggle your microphone on/off
- **Leave Room** - Exit the video chat

## Project Structure

```
webrtc-video-chat/
├── src/
│   └── server.ts           # WebSocket signaling server
├── public/
│   ├── index.html          # Main HTML page
│   ├── styles.css          # Styling
│   └── client.js           # WebRTC client logic
├── dist/                   # Compiled TypeScript (generated)
├── Dockerfile              # Docker image definition
├── docker-compose.yml      # Docker Compose configuration
├── package.json            # Node.js dependencies
├── tsconfig.json           # TypeScript configuration
└── README.md              # This file
```

## Configuration

### Port

The default port is `3000`. To change it:

**Docker:**
Edit `docker-compose.yml`:
```yaml
ports:
  - "YOUR_PORT:3000"
environment:
  - PORT=3000
```

**Local:**
Set environment variable:
```bash
PORT=8080 npm start
```

## Network Requirements

### For Local Testing
- Works on `localhost` without any special configuration
- Both users must be on the same network or use port forwarding

### For Production/Internet Use
You'll need:

1. **HTTPS** - WebRTC requires HTTPS in production (except localhost)
2. **STUN/TURN servers** - For NAT traversal across different networks
   - STUN servers are already configured (Google's public STUN)
   - For restrictive NAT/firewall scenarios, you may need a TURN server

To add TURN server support, modify `public/client.js`:
```javascript
this.iceServers = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    {
      urls: 'turn:your-turn-server.com:3478',
      username: 'username',
      credential: 'password'
    }
  ],
};
```

## Browser Compatibility

- Chrome/Edge (recommended)
- Firefox
- Safari
- Opera

All modern browsers with WebRTC support will work.

## Limitations

- No persistent storage - rooms exist only while at least one participant is connected
- No recording functionality
- Basic UI - focused on core functionality
- For production use, consider adding:
  - HTTPS/SSL certificates
  - TURN server for better connectivity
  - User authentication
  - Room passwords
  - Screen sharing
  - Chat messaging

## Troubleshooting

### Camera/Microphone not working
- Check browser permissions
- Ensure you're using HTTPS (or localhost for testing)
- Check if another application is using the camera

### Cannot connect to peer
- Check firewall settings
- If on different networks, you may need a TURN server
- Ensure both users are using supported browsers

### Port already in use
- Change the port in docker-compose.yml or use PORT environment variable
- Check if another application is using port 3000

## Security Considerations

For production deployment:
- Use HTTPS with valid SSL certificates
- Implement rate limiting
- Add authentication/authorization
- Validate and sanitize all inputs
- Use secure WebSocket (wss://)
- Implement room access controls

## License

MIT

## Contributing

Feel free to submit issues and enhancement requests!
