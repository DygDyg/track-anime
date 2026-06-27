export function PwaInstallIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path d="M12 3v10" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 9l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M5 21h14a2 2 0 0 0 2-2v-1H3v1a2 2 0 0 0 2 2Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
