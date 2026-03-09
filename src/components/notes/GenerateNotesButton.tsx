import { Sparkles, Loader2 } from "lucide-react";

interface GenerateNotesButtonProps {
  onClick: () => void;
  isGenerating: boolean;
  disabled?: boolean;
}

export default function GenerateNotesButton({
  onClick,
  isGenerating,
  disabled = false,
}: GenerateNotesButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || isGenerating}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
        disabled || isGenerating
          ? "bg-accent/30 text-white/40 cursor-not-allowed"
          : "bg-accent text-white hover:bg-accent-hover active:scale-[0.98]"
      }`}
    >
      {isGenerating ? (
        <>
          <Loader2 size={16} className="animate-spin" />
          Generating notes...
        </>
      ) : (
        <>
          <Sparkles size={16} />
          Generate Notes
        </>
      )}
    </button>
  );
}
