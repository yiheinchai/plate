import { useState } from "react";
import { useTranscript } from "../hooks/useTranscript";
import { useRecording } from "../hooks/useRecording";
import { useAppStore } from "../stores/appStore";
import RecordingControls from "../components/recording/RecordingControls";
import AudioSourcePicker from "../components/recording/AudioSourcePicker";
import WaveformVisualizer from "../components/recording/WaveformVisualizer";
import LiveTranscript from "../components/recording/LiveTranscript";

export default function RecordPage() {
  const { recordingStatus } = useAppStore();
  const { stopRecording } = useRecording();
  const { transcribeRecording, liveText, resetLiveText } = useTranscript();
  const [transcriptText, setTranscriptText] = useState("");
  const [isTranscribing, setIsTranscribing] = useState(false);
  const isRecording = recordingStatus !== "idle";

  const handleStop = async () => {
    try {
      const recording = await stopRecording();
      setIsTranscribing(true);
      setTranscriptText("");
      try {
        const transcript = await transcribeRecording(recording.id);
        setTranscriptText(transcript.full_text);
      } catch (err) {
        console.error("Auto-transcription failed:", err);
        setTranscriptText(
          "[Transcription failed — you can retry from the Library page]"
        );
      } finally {
        setIsTranscribing(false);
      }
    } catch (err) {
      console.error("Failed to stop recording:", err);
    }
  };

  const handleNewRecording = () => {
    setTranscriptText("");
    resetLiveText();
  };

  const displayText = transcriptText || liveText;

  return (
    <div className="flex flex-col h-full">
      {/* Controls area — vertically centered */}
      <div className="flex flex-col items-center justify-center flex-1 gap-8 min-h-0">
        <AudioSourcePicker />
        <RecordingControls
          onStop={handleStop}
          onStart={handleNewRecording}
        />
        <div className="w-full max-w-sm px-4">
          <WaveformVisualizer />
        </div>
      </div>

      {/* Transcript area */}
      <div className="w-full shrink-0 px-2 pb-2">
        <div className="max-w-2xl mx-auto">
          <LiveTranscript
            text={displayText}
            isRecording={isRecording}
            isTranscribing={isTranscribing}
          />
        </div>
      </div>
    </div>
  );
}
