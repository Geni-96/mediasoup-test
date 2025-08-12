const parseList = (val, def = []) =>
  (val ? String(val).split(',').map(s => s.trim()).filter(Boolean) : def);

const Config = {
  socket: {
    url: process.env.REACT_APP_SOCKET_URL || 'http://localhost:5001',
    transports: parseList(process.env.REACT_APP_SOCKET_TRANSPORTS, ['websocket', 'polling']),
    withCredentials: (process.env.REACT_APP_SOCKET_WITH_CREDENTIALS ?? 'true') === 'true'
  },
  mediaConstraints: {
    video: true,
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    }
  },
  webrtc: {
    videoEncodings: [
      { rid: 'r0', maxBitrate: Number(process.env.REACT_APP_VID_BR0 || 100000) },
      { rid: 'r1', maxBitrate: Number(process.env.REACT_APP_VID_BR1 || 300000) },
      { rid: 'r2', maxBitrate: Number(process.env.REACT_APP_VID_BR2 || 900000) }
    ],
    startBitrateKbps: Number(process.env.REACT_APP_VID_START_KBPS || 1000)
  },
  recorder: {
    chunkIntervalMs: Number(process.env.REACT_APP_REC_CHUNK_MS || 1000),
    mimeType: process.env.REACT_APP_REC_MIME || 'audio/webm;codecs=opus'
  },
  links: {
    transcriptionsBase: process.env.REACT_APP_TRANSCRIPT_BASE_URL || 'https://ai.bluehive.com/session'
  }
};

export default Config;