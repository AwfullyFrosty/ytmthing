# YTMThing - YouTube Music DeskThing Interface

A DeskThing application that provides a sleek interface for controlling YouTube Music through YTMDesktop, designed specifically for car dashboard displays and small screens.

THIS IS STILL IN EARLY DEVELOPMENT

## Features

### 🎵 **Complete YouTube Music Control**
- **Playback Control**: Play, pause, skip tracks, previous track
- **Repeat**: Toggle Cycle through repeat modes (off/single/all)  
- **Volume Control**: Volume up/down, mute/unmute, set specific volume (Uses wheel for control)
- **Like/Dislike**: Toggle like/dislike for current track
- **Seek Control**: Seek to specific positions in tracks (Uses click on the song progress bar)

### 🖼️ **Smart Artwork Display**
- **Intelligent Thumbnail Selection**: Automatically chooses optimal image sizes (200-400px) for reliability
- **Multi-Source Fallback**: Tries queue thumbnails → video thumbnails → counterpart thumbnails
- **Rate Limit Handling**: Automatic retry with smaller sizes when Google Images rate limits occur
- **Graceful Degradation**: Clean "No Artwork" fallback when images fail to load

### 🎛️ **Optimized Interface**
- **Car-Friendly Design**: Large, touch-friendly buttons optimized for 800x480 displays
- **Real-Time Updates**: Live track info, play state, repeat status
- **Visual Feedback**: Clear active state indicators for repeat modes
- **Responsive Layout**: Left panel artwork + right panel controls and track info

### 🎛️ **Setting/Custimization Options**

<img width="2860" height="1133" alt="image" src="https://github.com/user-attachments/assets/753e6b69-0ba1-48fa-99de-57062c9f8847" />

- **Color Presets**: There is a large list of pre-created color profiles to allow for your personal customization
- **Custom Colors**: In the presets there is a cuztome color profile which allow the user to set the colors they desire
- **Volume Stepping**: Allows the user to set the steps in which volume changes for more fine control (The lower you go the laggier it can be due to rate limits)

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
- **Windows**: Currently only created for windows so i'm unsure how this will work on Mac or Linux

### **Network**
- **Local Connection**: Connects to `127.0.0.1:9863` for maximum reliability
- **WebSocket Support**: Required for real-time YTMDesktop communication

## Installation & Setup

### **1. YTMDesktop Configuration**
1. Download and install [YTMDesktop](https://github.com/ytmdesktop/ytmdesktop)
2. Enable the Companion API in YTMDesktop settings
<img width="585" height="412" alt="image" src="https://github.com/user-attachments/assets/768aff95-3ced-45cd-89c9-eb29503cf9fb" />

(Make sure to enable companion auth before trying the setup. This is a onetime setup option)
3. Ensure it's running on the default port (9863) (current versions dont let you select port)

### **2. Deploy to DeskThing**
1. Package the application according to DeskThing deployment guidelines
2. Install on your DeskThing device
3. Start the application

### **3. First Run Authentication**
1. YTMThing will display an authentication code
2. Approve the code in YTMDesktop when prompted  
3. Token will be saved for future sessions
4. Connection established - ready to use!
5. Might show connecting but that will disapper once music starts playing


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

## Technical Details
### **Shuffle State Management**
Since YTMDesktop's API doesn't reliably expose shuffle state, YTMThing doesn't have a suffle feature. In future YTMDesktop's API updates state will be tracked and will update when thats available.

## License

This project is designed for personal use with YTMDesktop and DeskThing. Please respect YouTube Music's terms of service.
