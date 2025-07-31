import React, { useState, useRef, useEffect } from "react";
import { uploadMixedAudioToIndexedCP, isIndexedCPAvailable } from './indexedcp-client';

export default function MixerPanel({
  onStart,
  onStop,
  mixedAudioStream,
  isTranscribing,
  roomId,
  sessionId,
  callEnded,
  onRecordingStart,
  onRecordingStop,
}) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const recordingStartTimeRef = useRef(null);
  const durationIntervalRef = useRef(null);
  // const maxRecordingDurationRef = useRef(null); // Not currently used

  // Maximum recording duration (6 hours = 21600 seconds)
  const MAX_RECORDING_DURATION = 6 * 60 * 60;

  // Effect to handle call end during recording
  useEffect(() => {
    if (callEnded && isRecording) {
      console.log('Call ended, stopping recording...');
      stopRecording();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callEnded, isRecording]);

  // Update recording duration every second
  useEffect(() => {
    if (isRecording) {
      durationIntervalRef.current = setInterval(() => {
        if (recordingStartTimeRef.current) {
          const elapsed = Math.floor((Date.now() - recordingStartTimeRef.current) / 1000);
          setRecordingDuration(elapsed);
          
          // Check if maximum recording duration exceeded
          if (elapsed >= MAX_RECORDING_DURATION) {
            console.log(`Maximum recording duration (${MAX_RECORDING_DURATION/3600} hours) reached, stopping recording...`);
            stopRecording();
          }
        }
      }, 1000);
    } else {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
    }

    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording]);

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      if (isRecording && recorderRef.current) {
        console.log('Component unmounting during recording, stopping...');
        try {
          if (recorderRef.current.state === 'recording') {
            recorderRef.current.stop();
          }
        } catch (e) {
          console.error('Error stopping recording on unmount:', e);
        }
      }
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formatDuration = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const startRecording = () => {
    if (!mixedAudioStream) {
      console.warn("No mixed audio stream to record.");
      return;
    }

    if (isRecording) {
      console.warn("Recording is already in progress.");
      return;
    }

    try {
      setIsRecording(true);
      setRecordingDuration(0);
      recordingStartTimeRef.current = Date.now();
      chunksRef.current = [];

      // Create MediaRecorder instance
      recorderRef.current = new MediaRecorder(mixedAudioStream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      recorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorderRef.current.onstop = async () => {
        await handleRecordingComplete();
      };

      recorderRef.current.onerror = (e) => {
        console.error('MediaRecorder error:', e.error);
        alert(`Recording error: ${e.error?.message || 'Unknown error'}. Recording has been stopped.`);
        setIsRecording(false);
        if (onRecordingStop) onRecordingStop();
      };

      // Start recording (no timeout - will continue until manually stopped or call ends)
      recorderRef.current.start(1000); // Collect data every second for progressive saving if needed
      
      console.log('Started recording mixed audio stream...');
      if (onRecordingStart) onRecordingStart();

    } catch (error) {
      console.error('Failed to start recording:', error);
      alert(`Failed to start recording: ${error.message}`);
      setIsRecording(false);
      if (onRecordingStop) onRecordingStop();
    }
  };

  const stopRecording = () => {
    if (!isRecording || !recorderRef.current) {
      console.warn("No active recording to stop.");
      return;
    }

    try {
      if (recorderRef.current.state === 'recording') {
        recorderRef.current.stop();
      }
      console.log('Stopped recording mixed audio stream...');
    } catch (error) {
      console.error('Error stopping recording:', error);
      setIsRecording(false);
      if (onRecordingStop) onRecordingStop();
    }
  };

  const handleRecordingComplete = async () => {
    if (chunksRef.current.length === 0) {
      console.warn('No audio data recorded');
      setIsRecording(false);
      if (onRecordingStop) onRecordingStop();
      return;
    }

    const blob = new Blob(chunksRef.current, { type: "audio/webm" });
    const url = URL.createObjectURL(blob);
    
    // Upload to IndexedCP if available and we have roomId/sessionId
    if (roomId && sessionId && isIndexedCPAvailable()) {
      console.log('Uploading mixed audio to IndexedCP...');
      try {
        const uploadSuccess = await uploadMixedAudioToIndexedCP(roomId, sessionId, blob, 'webm');
        if (uploadSuccess) {
          console.log('✅ Mixed audio uploaded to IndexedCP successfully');
        } else {
          console.log('⚠️ Mixed audio upload to IndexedCP failed, but continuing normally');
        }
      } catch (error) {
        console.error('Mixed audio upload error:', error.message);
        // Non-disruptive: continue with local download even if upload fails
      }
    } else {
      console.log('IndexedCP not available or missing room/session info, skipping upload');
    }
    
    // Create download link for the audio file directly (existing functionality)
    const downloadLink = document.createElement("a");
    downloadLink.href = url;
    downloadLink.download = `mixed_audio_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.webm`;
    downloadLink.style.display = 'none';
    
    // Add to DOM, click, then remove
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    
    // Clean up the URL
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    
    setIsRecording(false);
    if (onRecordingStop) onRecordingStop();
  };

  return (
    <div className="p-4 bg-gray-100 rounded shadow-md">
      <h2 className="text-xl font-semibold mb-4">🎛️ Audio Mixer Panel</h2>

      <div className="space-x-2">
        <button
          onClick={onStart}
          className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
        >
          Start Transcription
        </button>

        <button
          onClick={onStop}
          className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
        >
          Stop Transcription
        </button>

        <button
          onClick={startRecording}
          disabled={isRecording || !mixedAudioStream}
          className={`px-4 py-2 rounded text-white ${
            isRecording || !mixedAudioStream 
              ? 'bg-gray-400 cursor-not-allowed' 
              : 'bg-blue-500 hover:bg-blue-600'
          }`}
        >
          {isRecording ? "Recording..." : "Start Recording"}
        </button>

        <button
          onClick={stopRecording}
          disabled={!isRecording}
          className={`px-4 py-2 rounded text-white ${
            !isRecording 
              ? 'bg-gray-400 cursor-not-allowed' 
              : 'bg-red-500 hover:bg-red-600'
          }`}
        >
          Stop Recording
        </button>
      </div>

      {isRecording && (
        <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded">
          <p className="text-blue-800 font-medium">🔴 Recording in progress...</p>
          <p className="text-blue-600 text-sm">Duration: {formatDuration(recordingDuration)}</p>
          <p className="text-blue-600 text-xs mt-1">
            Recording will continue until call ends or manually stopped
            {recordingDuration > MAX_RECORDING_DURATION * 0.9 && 
              ` (Max: ${formatDuration(MAX_RECORDING_DURATION)})`
            }
          </p>
          {recordingDuration > MAX_RECORDING_DURATION * 0.9 && (
            <p className="text-orange-600 text-xs mt-1 font-medium">
              ⚠️ Approaching maximum recording duration
            </p>
          )}
        </div>
      )}

      {callEnded && (
        <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded">
          <p className="text-yellow-800 font-medium">📞 Call has ended</p>
          <p className="text-yellow-600 text-sm">Any active recording has been automatically stopped and saved</p>
        </div>
      )}

      {!mixedAudioStream && (
        <p className="mt-2 text-yellow-600 text-sm">⚠️ Start transcription first to enable recording</p>
      )}

      {isTranscribing && (
        <p className="mt-2 text-green-600">✅ Transcription in progress...</p>
      )}
    </div>
  );
}
