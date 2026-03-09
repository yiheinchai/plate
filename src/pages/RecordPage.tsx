import { useNavigate } from "react-router-dom";
import { useRecording } from "../hooks/useRecording";
import { useAppStore } from "../stores/appStore";
import RecordingControls from "../components/recording/RecordingControls";
import AudioSourcePicker from "../components/recording/AudioSourcePicker";
import WaveformVisualizer from "../components/recording/WaveformVisualizer";
import LiveTranscript from "../components/recording/LiveTranscript";
import { useTranscript } from "../hooks/useTranscript";

export default function RecordPage() {
  const navigate = useNavigate();
  const { recordingStatus } = useAppStore();
  const { stopRecording } = useRecording();
  const { liveText, resetLiveText } = useTranscript();
  const isRecording = recordingStatus !== "idle";

  const handleStop = async () => {
    try {
      const recording = await stopRecording();
      // Navigate to Library immediately — transcription happens there
      navigate("/library", {
        state: { selectRecordingId: recording.id, autoTranscribe: true },
      });
    } catch (err) {
      console.error("Failed to stop recording:", err);
    }
  };

  const handleNewRecording = () => {
    resetLiveText();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Controls — centered */}
      <div className="flex flex-col items-center justify-center flex-1 gap-6 min-h-0">
        <AudioSourcePicker />
        <RecordingControls onStop={handleStop} onStart={handleNewRecording} />
        <div className="w-full max-w-xs">
          <WaveformVisualizer />
        </div>
      </div>

      {/* Transcript panel */}
      <div className="w-full shrink-0 border-t border-border-subtle">
        <div className="max-w-2xl mx-auto">
          <LiveTranscript
            text={liveText}
            isRecording={isRecording}
          />
        </div>
      </div>
    </div>
  );
}
