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
    <div className="flex flex-col items-center h-full max-w-xl mx-auto">
      {/* Top section: centered controls */}
      <div className="flex flex-col items-center justify-center flex-1 gap-10 pt-4">
        <AudioSourcePicker />
        <RecordingControls
          onStop={handleStop}
          onStart={handleNewRecording}
        />
        <div className="w-full px-4">
          <WaveformVisualizer />
        </div>
      </div>

      {/* Bottom section: transcript */}
      <div className="w-full pb-2 shrink-0">
        <LiveTranscript
          text={displayText}
          isRecording={isRecording}
          isTranscribing={isTranscribing}
        />
      </div>
    </div>
  );
}
