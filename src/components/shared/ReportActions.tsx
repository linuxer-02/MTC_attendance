import { Copy, Share2 } from "lucide-react";

/** Copy + Share button pair shared by the student and staff report screens. */
export function ReportActions({ onCopy, onShare }: { onCopy: () => void; onShare: () => void }) {
  return (
    <div className="flex gap-2">
      <button
        onClick={onCopy}
        className="flex items-center gap-1.5 text-sm rounded-xl border bg-card px-3 py-1.5 hover:bg-muted transition-colors btn-press"
      >
        <Copy className="h-3.5 w-3.5" />
        Copy
      </button>
      <button
        onClick={onShare}
        className="flex items-center gap-1.5 text-sm rounded-xl gradient-primary text-primary-foreground px-3 py-1.5 shadow-sm btn-press"
      >
        <Share2 className="h-3.5 w-3.5" />
        Share
      </button>
    </div>
  );
}

/** The collapsible raw-text block both report screens render under the cards. */
export function RawTextDetails({ text }: { text: string }) {
  if (!text) return null;
  return (
    <details className="mt-3">
      <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
        View raw text (for copy)
      </summary>
      <pre className="mt-2 whitespace-pre-wrap text-xs rounded-xl border bg-card p-4 font-mono overflow-x-auto">
        {text}
      </pre>
    </details>
  );
}
