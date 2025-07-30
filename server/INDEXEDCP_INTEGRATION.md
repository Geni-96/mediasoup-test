# IndexedCP Integration Documentation

## Overview
This implementation adds IndexedCP integration to the mediasoup-based video conferencing system for uploading mixed audio files and speaker annotation logs as separate entries. The integration is **completely non-disruptive** - all existing functionality continues to work exactly as before, with IndexedCP uploads as an optional addition.

## Features Added

### 1. Automatic Annotation Upload
- **Location**: `writeSpeakerLogToFile()` function in `server.js`
- **Behavior**: After writing speaker logs to local files (existing functionality), the system now also uploads the same data to IndexedCP
- **Naming**: `${roomId}-${sessionId}-annotations.json`
- **Non-disruptive**: If IndexedCP fails, local file writing continues normally

### 2. Mixed Audio Upload
- **New Socket Event**: `upload-mixed-audio`
- **Purpose**: Receives mixed audio files from the frontend and uploads them to IndexedCP
- **Naming**: `${roomId}-${sessionId}-audio.webm` (or other format)
- **Response**: Always responds to client, whether upload succeeds or fails

### 3. Optional Metadata Upload
- **Includes**: Participant count, session timestamps, room information
- **Naming**: `${roomId}-${sessionId}-metadata.json`

## Files Modified/Added

### New Files
- `server/indexedcp-client.js` - IndexedCP client configuration and upload functions
- `server/.env.example` - Environment variable documentation

### Modified Files
- `server/server.js` - Added IndexedCP integration points
- `server/package.json` - Added indexedcp dependency

## Configuration

### Environment Variables (Optional)
```bash
# IndexedCP server URL (default: http://localhost:8080)
INDEXEDCP_SERVER=http://your-server.com

# IndexedCP API key (will prompt if not provided)
INDEXEDCP_API_KEY=your-api-key

# Timeout in milliseconds (default: 30000)
INDEXEDCP_TIMEOUT=30000
```

### Copy environment template:
```bash
cp .env.example .env
# Edit .env with your values
```

## API Reference

### Backend Functions

#### `initializeIndexedCP()`
- Initializes the IndexedCP client at server startup
- Returns: `Promise<boolean>` - success status
- Non-blocking: server continues if initialization fails

#### `uploadAnnotationsToIndexedCP(roomId, sessionId, annotationData)`
- Uploads speaker diarization logs to IndexedCP
- Called automatically after local file writing
- Returns: `Promise<boolean>` - success status

#### `uploadAudioToIndexedCP(roomId, sessionId, audioBuffer, fileExtension)`
- Uploads mixed audio files to IndexedCP
- Called via socket event handler
- Returns: `Promise<boolean>` - success status

#### `uploadMetadataToIndexedCP(roomId, sessionId, metadata)`
- Uploads session metadata to IndexedCP
- Optional, called with audio uploads
- Returns: `Promise<boolean>` - success status

### Frontend Integration

#### New Socket Event: `upload-mixed-audio`
```javascript
// Frontend usage example
socket.emit('upload-mixed-audio', {
  audioData: audioBuffer, // Buffer or base64 string
  fileExtension: 'webm',  // File format
  metadata: {             // Optional
    participantCount: 3,
    duration: 1800,
    // ... other metadata
  }
}, (response) => {
  console.log('Upload response:', response);
  // response.success: boolean
  // response.message: string
});
```

## Integration Points

### 1. Existing `writeSpeakerLogToFile()` Function
**Before (unchanged):**
```javascript
fs.writeFileSync(roomLogPath, JSON.stringify(logData, null, 2));
console.log(`Speaker logs written for room ${roomId}`);
```

**After (added):**
```javascript
fs.writeFileSync(roomLogPath, JSON.stringify(logData, null, 2));
console.log(`Speaker logs written for room ${roomId}`);

// ADD: Upload to IndexedCP (non-disruptive)
uploadAnnotationsToIndexedCP(roomId, sessionId, logData).catch(error => {
  console.error('IndexedCP annotation upload failed, continuing normally');
});
```

### 2. New Socket Event Handler
```javascript
socket.on('upload-mixed-audio', async ({ audioData, fileExtension, metadata }, callback) => {
  // Convert audio data to buffer
  // Upload to IndexedCP
  // Respond to client with success/failure
});
```

## Error Handling & Non-Disruptive Design

### Graceful Degradation
- **IndexedCP unavailable**: System works normally, logs warnings
- **Upload failures**: Local functionality continues, errors logged
- **Network issues**: Uploads retry (built into IndexedCP), but don't block system
- **Configuration missing**: System continues without IndexedCP

### Error Patterns
```javascript
try {
  await uploadToIndexedCP(data);
} catch (error) {
  console.error('IndexedCP upload failed:', error.message);
  // Continue normal operation - DO NOT throw
}
```

## File Naming Convention

All uploads follow consistent naming:
- **Annotations**: `${roomId}-${sessionId}-annotations.json`
- **Audio**: `${roomId}-${sessionId}-audio.${extension}`
- **Metadata**: `${roomId}-${sessionId}-metadata.json`

This allows external transcription services to easily query and retrieve related files.

## Testing

### Manual Testing Steps
1. **Without IndexedCP**: Verify all existing functionality works
2. **With IndexedCP**: 
   - Start server, check initialization logs
   - Join meeting, verify annotation uploads
   - End meeting, check upload logs
   - Send audio via socket event

### Production Deployment
1. Install dependencies: `npm install`
2. Configure environment variables in `.env`
3. Start server normally - IndexedCP integration is automatic

## Troubleshooting

### Common Issues

**Q: "IndexedCP not initialized" messages**
A: Normal behavior when INDEXEDCP_SERVER is not configured. System continues working.

**Q: "Failed to upload to IndexedCP"**
A: Check server URL, API key, and network connectivity. System continues working normally.

**Q: "Upload complete" but files not visible**
A: Verify IndexedCP server is running and accessible at configured URL.

### Debug Mode
Set environment variable for verbose logging:
```bash
DEBUG=indexedcp* npm start
```

## Success Criteria ✅

- [x] All existing mediasoup functionality works exactly as before
- [x] Local file logging continues to work unchanged
- [x] Speaker diarization works as before
- [x] Files upload to IndexedCP when configured
- [x] System continues normally when IndexedCP is unavailable
- [x] Non-disruptive error handling throughout
- [x] Consistent naming convention implemented
- [x] Socket event for audio upload added
- [x] Environment configuration documented

## Architecture Summary

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend      │───▶│   Backend        │───▶│   IndexedCP     │
│                 │    │                  │    │   Server        │
│ • Mixed Audio   │    │ • Local Files    │    │ • Audio Files   │
│ • UI Events     │    │ • Speaker Logs   │    │ • Annotations   │
│                 │    │ • Socket Events  │    │ • Metadata      │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                               │
                               ▼
                       ┌──────────────────┐
                       │   Local Storage  │
                       │                  │
                       │ • logs/*.json    │
                       │ • (unchanged)    │
                       └──────────────────┘
```

This integration provides a seamless bridge between the existing mediasoup system and IndexedCP, enabling external transcription services to access both audio and speaker annotation data through a consistent interface.
