import React, { useState } from "react";

export default function MixerPanel({
  onStart,
  onStop,
  mixedAudioStream,
  isTranscribing,
}) {
  const [isRecording, setIsRecording] = useState(false);

  const recordMixedStream = () => {
  if (!mixedAudioStream) {
    console.warn("No mixed audio stream to record.");
    return;
  }

  setIsRecording(true);
  const recorder = new MediaRecorder(mixedAudioStream, {
    mimeType: 'audio/webm;codecs=opus' // Specify audio codec
  });
  const chunks = [];

  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: "audio/webm" });
    const url = URL.createObjectURL(blob);
    
    // Create download link for the audio file directly
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
  };

  recorder.start();
  setTimeout(() => recorder.stop(), 60000);
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
          onClick={recordMixedStream}
          disabled={isRecording}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          {isRecording ? "Recording..." : "Record Mixed Audio"}
        </button>
      </div>

      {isTranscribing && (
        <p className="mt-2 text-green-600">✅ Transcription in progress...</p>
      )}
    </div>
  );
}
