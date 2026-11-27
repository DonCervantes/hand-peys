/** Logo de marca: símbolo (dos cuartos de círculo, negro y arena) + "handle". */
export function BrandMark({ className = "h-7 w-auto" }: { className?: string }) {
  return (
    <svg viewBox="0 0 242 215" className={className} aria-hidden="true">
      <path d="M0 0H150A150 150 0 0 1 0 150Z" fill="#212121" />
      <path d="M92 215A150 150 0 0 1 242 65V215Z" fill="#c4a47a" />
    </svg>
  );
}

export function Wordmark({ className = "text-2xl" }: { className?: string }) {
  return <span className={`font-display font-normal lowercase leading-none tracking-[0.01em] ${className}`}>handle</span>;
}
