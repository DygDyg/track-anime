/** Download / install outline icon (arrow into tray). */
export function PwaInstallIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden
    >
      <path d="M12 4v10" strokeLinecap="round" />
      <path d="M8.5 10.5 12 14l3.5-3.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 17.5h12" strokeLinecap="round" />
      <path d="M7.5 20h9" strokeLinecap="round" />
    </svg>
  );
}
