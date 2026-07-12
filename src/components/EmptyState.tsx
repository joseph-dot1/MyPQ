export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="card p-6 text-center my-6">
      <p className="text-ink-deep font-medium">{title}</p>
      {hint && <p className="text-sm text-ink-deep/60 mt-1">{hint}</p>}
    </div>
  );
}
