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
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-medium transition-all cursor-pointer shrink-0 ${
        disabled || isGenerating
          ? "bg-accent/20 text-accent/40 cursor-not-allowed"
          : "bg-accent/15 text-accent hover:bg-accent/25 active:scale-[0.97] border border-accent/20"
      }`}
    >
      {isGenerating ? (
        <>
          <Loader2 size={14} className="animate-spin" />
          <span>Generating...</span>
        </>
      ) : (
        <>
          <Sparkles size={14} />
          <span>Generate Notes</span>
        </>
      )}
    </button>
  );
}
