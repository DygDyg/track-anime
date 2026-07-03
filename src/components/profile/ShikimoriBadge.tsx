export function ShikimoriBadge({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <img
      src="https://shikimori.io/favicons/favicon-32x32.png"
      alt=""
      title="Друг на Shikimori"
      className={`shrink-0 rounded-sm ${className}`}
    />
  );
}
