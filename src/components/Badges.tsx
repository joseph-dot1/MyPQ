export function PremiumBadge() {
  return (
    <span className="inline-block rounded px-1.5 py-0.5 text-xs font-semibold bg-highlight text-ink-deep">
      Premium
    </span>
  );
}

export function FreeBadge() {
  return (
    <span className="inline-block rounded px-1.5 py-0.5 text-xs font-semibold border border-paper-line text-ink-deep/70">
      Free
    </span>
  );
}

export function DeducedBadge() {
  return (
    <span className="inline-block rounded px-1.5 py-0.5 text-xs border border-paper-line bg-white text-ink-deep/70">
      Deduced from course material — verify with your lecturer
    </span>
  );
}
