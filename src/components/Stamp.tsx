export function Stamp({ code, className = "" }: { code: string; className?: string }) {
  return <span className={`stamp ${className}`}>{code}</span>;
}
