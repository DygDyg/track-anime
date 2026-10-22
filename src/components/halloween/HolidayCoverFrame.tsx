/** Overlay on anime posters; visible only under html[data-holiday="halloween"]. */
export function HolidayCoverFrame({
  variant = "card",
  className = "",
}: {
  variant?: "card" | "page";
  className?: string;
}) {
  return (
    <span
      className={[
        "holiday-cover-frame",
        variant === "page" ? "holiday-cover-frame--page" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-hidden
    />
  );
}
