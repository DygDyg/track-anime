type SpinnerSize = "xs" | "sm" | "md";

const SIZE_CLASS: Record<SpinnerSize, string> = {
  xs: "h-3 w-3 border-[1.5px]",
  sm: "h-3.5 w-3.5 border-2",
  md: "h-4 w-4 border-2",
};

export function LoadingSpinner({
  size = "sm",
  className = "",
}: {
  size?: SpinnerSize;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={[
        "inline-block shrink-0 animate-spin rounded-full border-current border-r-transparent",
        SIZE_CLASS[size],
        className,
      ].join(" ")}
    />
  );
}
