import { useState, useRef, useEffect } from "react";
import { 
  uploadMixedAudioToIndexedCP, 
  isIndexedCPAvailable,
  startRealTimeAudioStreaming,
  stopRealTimeAudioStreaming
} from './indexedcp-client';

export const useAudioRecording = ({ 
  mixedAudioStream, 
  roomId, 
  sessionId, 
  callEnded,
  onRecordingStart,
  onRecordingStop 
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const recordingStartTimeRef = useRef(null);
  const durationIntervalRef = useRef(null);
  const streamControllerRef = useRef(null);
  const [isStreaming, setIsStreaming] = useState(false);

  // Maximum recording duration (6 hours = 21600 seconds)
  const MAX_RECORDING_DURATION = 6 * 60 * 60;

  // Effect to handle call end during recording or streaming
  useEffect(() => {
    if (callEnded) {
      if (isRecording) {
        console.log('Call ended, stopping recording...');
        stopRecording();
      }
      if (isStreaming) {
        console.log('Call ended, stopping streaming...');
        stopStreaming();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callEnded, isRecording, isStreaming]);

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
      if (isStreaming && streamControllerRef.current) {
        console.log('Component unmounting during streaming, stopping...');
        try {
          stopRealTimeAudioStreaming(streamControllerRef.current);
        } catch (e) {
          console.error('Error stopping streaming on unmount:', e);
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

  const startStreaming = async () => {
    if (!mixedAudioStream) {
      console.warn("No mixed audio stream to stream.");
      return false;
    }

    if (isStreaming) {
      console.warn("Streaming is already in progress.");
      return false;
    }

    if (!roomId || !sessionId) {
      console.warn("Missing roomId or sessionId for streaming.");
      return false;
    }

    if (!isIndexedCPAvailable()) {
      console.warn("IndexedCP not available for streaming.");
      return false;
    }

    try {
      console.log('Starting real-time audio streaming to IndexedCP...');
      
      const streamController = await startRealTimeAudioStreaming(
        mixedAudioStream, 
        roomId, 
        sessionId,
        {
          chunkDuration: 2000, // 2 second chunks
          mimeType: 'audio/webm;codecs=opus'
        }
      );

      if (streamController) {
        streamControllerRef.current = streamController;
        setIsStreaming(true);
        console.log('✅ Real-time audio streaming started successfully');
        return true;
      } else {
        console.warn('⚠️ Failed to start real-time audio streaming');
        return false;
      }
    } catch (error) {
      console.error('Failed to start streaming:', error);
      return false;
    }
  };

  const stopStreaming = async () => {
    if (!isStreaming || !streamControllerRef.current) {
      console.warn("No active streaming to stop.");
      return;
    }

    try {
      console.log('Stopping real-time audio streaming...');
      const success = await stopRealTimeAudioStreaming(streamControllerRef.current);
      
      if (success) {
        console.log('✅ Real-time audio streaming stopped successfully');
      } else {
        console.warn('⚠️ Issues stopping real-time audio streaming');
      }
      
      streamControllerRef.current = null;
      setIsStreaming(false);
    } catch (error) {
      console.error('Error stopping streaming:', error);
      // Force cleanup even if error occurred
      streamControllerRef.current = null;
      setIsStreaming(false);
    }
  };

  const startRecording = () => {
    if (!mixedAudioStream) {
      console.warn("No mixed audio stream to record.");
      return false;
    }

    if (isRecording) {
      console.warn("Recording is already in progress.");
      return false;
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
      return true;

    } catch (error) {
      console.error('Failed to start recording:', error);
      alert(`Failed to start recording: ${error.message}`);
      setIsRecording(false);
      if (onRecordingStop) onRecordingStop();
      return false;
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

  // Combined toggle function for both transcription and recording
  const toggleRecording = async () => {
    if (isRecording) {
      // Stop both recording and streaming
      stopRecording();
      if (isStreaming) {
        await stopStreaming();
      }
      return false; // Now inactive
    } else {
      // Start both recording and streaming
      const recordingStarted = startRecording();
      
      if (recordingStarted && isIndexedCPAvailable()) {
        await startStreaming();
      }
      
      return recordingStarted; // Return active state
    }
  };

  return {
    isRecording,
    isStreaming,
    recordingDuration,
    formatDuration,
    toggleRecording,
    startRecording,
    stopRecording,
    startStreaming,
    stopStreaming
  };
};
