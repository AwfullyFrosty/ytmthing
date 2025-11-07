# YTMThing - YouTube Music DeskThing Interface

A DeskThing application that provides a sleek interface for controlling YouTube Music through YTMDesktop, designed specifically for car dashboard displays and small screens.

THIS IS STILL IN EARLY DEVELOPMENT

## Features

### 🎵 **Complete YouTube Music Control**
- **Playback Control**: Play, pause, skip tracks, previous track
- **Shuffle & Repeat**: Toggle shuffle mode and cycle through repeat modes (off/single/all)  
- **Volume Control**: Volume up/down, mute/unmute, set specific volume
- **Track Navigation**: Jump to specific queue positions, change videos
- **Like/Dislike**: Toggle like/dislike for current track
- **Seek Control**: Seek to specific positions in tracks

### 🖼️ **Smart Artwork Display**
- **Intelligent Thumbnail Selection**: Automatically chooses optimal image sizes (200-400px) for reliability
- **Multi-Source Fallback**: Tries queue thumbnails → video thumbnails → counterpart thumbnails
- **Rate Limit Handling**: Automatic retry with smaller sizes when Google Images rate limits occur
- **Graceful Degradation**: Clean "No Artwork" fallback when images fail to load

### 🎛️ **Optimized Interface**
- **Car-Friendly Design**: Large, touch-friendly buttons optimized for 800x480 displays
- **Real-Time Updates**: Live track info, play state, shuffle/repeat status
- **Visual Feedback**: Clear active state indicators for shuffle and repeat modes
- **Responsive Layout**: Left panel artwork + right panel controls and track info

## Architecture

### **Frontend (React + TypeScript)**
- **Real-time UI**: Receives state updates via DeskThing WebSocket connection
- **Event Handling**: Sends control commands back to server
- **Image Management**: Handles artwork loading with smart retry logic
- **State Management**: Tracks current track, play state, shuffle/repeat modes

### **Backend (Node.js + TypeScript)**  
- **YTMDesktop Integration**: Connects to YTMDesktop Companion API via Socket.IO
- **Authentication**: Handles YTMDesktop auth code flow with token persistence
- **Command Relay**: Translates DeskThing commands to YTMDesktop API calls
- **State Processing**: Processes raw YTMDesktop state into clean frontend format

### **Key Components**
```
┌─────────────────┐    WebSocket    ┌─────────────────┐    Socket.IO    ┌─────────────────┐
│   DeskThing     │ ◄─────────────► │   YTMThing      │ ◄─────────────► │   YTMDesktop    │
│   Frontend      │                 │   Server        │                 │   Companion     │
└─────────────────┘                 └─────────────────┘                 └─────────────────┘
```

## Requirements

### **Dependencies**
- **YTMDesktop**: Must be running with Companion API enabled on port 9863
- **DeskThing**: Compatible DeskThing environment for deployment
- **Node.js**: Version 16+ for server-side JavaScript execution

### **Network**
- **Local Connection**: Connects to `127.0.0.1:9863` for maximum reliability
- **WebSocket Support**: Required for real-time YTMDesktop communication

## Installation & Setup

### **1. YTMDesktop Configuration**
1. Download and install [YTMDesktop](https://github.com/ytmdesktop/ytmdesktop)
2. Enable the Companion API in YTMDesktop settings
3. Ensure it's running on the default port (9863)

### **2. Deploy to DeskThing**
1. Package the application according to DeskThing deployment guidelines
2. Install on your DeskThing device
3. Start the application

### **3. First Run Authentication**
1. YTMThing will display an authentication code
2. Approve the code in YTMDesktop when prompted  
3. Token will be saved for future sessions
4. Connection established - ready to use!

## Technical Details

### **Shuffle State Management**
Since YTMDesktop's API doesn't reliably expose shuffle state, YTMThing maintains its own internal shuffle tracking:
- Tracks shuffle state locally when toggle commands are sent
- Provides immediate UI feedback without waiting for API response
- Ensures consistent shuffle state display

### **Thumbnail Selection Algorithm**
```typescript
// Prioritizes medium-sized images for reliability
const mediumThumbnail = sorted.find(thumb => {
    const size = Math.max(thumb.width || 0, thumb.height || 0);
    return size >= 200 && size <= 400;
});
```

### **Error Handling & Resilience**
- **Authentication**: Automatic token refresh on 403 errors
- **Connection**: Automatic reconnection on socket disconnects  
- **Images**: Progressive fallback through multiple sizes and sources
- **Commands**: Error logging without blocking subsequent operations

### **Performance Optimizations**
- **Minimal Logging**: Reduced console output for production use
- **Smart Caching**: Token persistence to avoid repeated authentication
- **Efficient Updates**: Only sends state changes, not continuous polling
- **Memory Management**: Proper cleanup of event listeners and connections

## File Structure

```
ytmdthing/
├── server/
│   ├── index.ts          # Main server logic
│   └── ytm_token.json    # Cached auth token
├── src/
│   └── App.tsx           # React frontend
├── deskthing/
│   └── manifest.json     # DeskThing app configuration
└── README.md            # This file
```

## Troubleshooting

### **Connection Issues**
- Verify YTMDesktop is running and Companion API is enabled
- Check that port 9863 is not blocked by firewall
- Restart YTMDesktop if authentication fails
- Make sure music is actively playing

### **Artwork Not Loading**
- This is typically due to Google Images rate limiting
- The app automatically retries with smaller sizes
- If persistent, try switching tracks to reset rate limits

### **Commands Not Working**
- Ensure YTMDesktop has an active YouTube Music session (Music must be playing)
- Check server logs for authentication errors
- Re-approve authentication code if token expired

## Development

Built with modern web technologies:
- **Frontend**: React 18, TypeScript, Lucide React icons, TailwindCSS
- **Backend**: Node.js, TypeScript, Socket.IO client, Axios
- **Build**: Vite for fast development and optimized production builds

## License

This project is designed for personal use with YTMDesktop and DeskThing. Please respect YouTube Music's terms of service.
