import { useCallback } from "react";
import { toast } from "sonner";

/**
 * Copy-to-clipboard and Web Share for a generated report body. Both the student
 * Absentees report and the daily Staff Report shipped identical copies of this,
 * including the AbortError special-case (the user dismissing the share sheet is
 * not a failure and must not raise a toast).
 */
export function useCopyShare(text: string, title: string) {
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Copy failed");
    }
  }, [text]);

  const share = useCallback(async () => {
    if (!navigator.share) return copy();
    try {
      await navigator.share({ title, text });
      toast.success("Shared successfully");
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") toast.error("Share failed");
    }
  }, [text, title, copy]);

  return { copy, share };
}
