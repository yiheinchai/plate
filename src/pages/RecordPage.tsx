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
  const { recordingStatus, recordingWarning, setRecordingWarning, continuingRecordingId, continuingRecordingTitle } = useAppStore();
  const { stopRecording } = useRecording();
  const { liveText, resetLiveText } = useTranscript();
  const isRecording = recordingStatus !== "idle";

  const handleStop = async () => {
    try {
      const recording = await stopRecording();
      navigate("/library", {
        state: { selectRecordingId: recording.id, autoTranscribe: !continuingRecordingId },
      });
    } catch (err) {
      console.error("Failed to stop recording:", err);
    }
  };

  const handleNewRecording = () => {
    resetLiveText();
    setRecordingWarning(null);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Continuing banner */}
      {continuingRecordingId && isRecording && (
        <div className="mx-auto max-w-md px-4 py-1.5 mt-2 rounded bg-accent/10 border border-accent/30 text-accent text-xs text-center">
          Continuing: {continuingRecordingTitle || "previous recording"}
        </div>
      )}

      {/* Controls — centered */}
      <div className="flex flex-col items-center justify-center flex-1 gap-6 min-h-0">
        <AudioSourcePicker />
        <RecordingControls onStop={handleStop} onStart={handleNewRecording} />
        <div className="w-full max-w-xs">
          <WaveformVisualizer />
        </div>
      </div>

      {/* Warning banner */}
      {recordingWarning && (
        <div className="mx-auto max-w-md px-4 py-2 mb-2 rounded bg-warning/10 border border-warning/30 text-warning text-xs text-center">
          {recordingWarning}
          <button
            onClick={() => setRecordingWarning(null)}
            className="ml-2 underline opacity-70 hover:opacity-100 cursor-pointer"
          >
            dismiss
          </button>
        </div>
      )}

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
