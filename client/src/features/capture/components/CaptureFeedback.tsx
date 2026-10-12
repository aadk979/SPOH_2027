export function CaptureFeedback({ feedback }: { feedback: string | null }) {
  return feedback ? <p role="status" className="text-caption">{feedback}</p> : null;
}
