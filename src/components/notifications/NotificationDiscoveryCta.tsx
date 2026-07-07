"use client";

type NotificationDiscoveryCtaProps = {
  onConfigure: () => void;
  onDismiss: () => void;
  className?: string;
};

export function NotificationDiscoveryCta({
  onConfigure,
  onDismiss,
  className = "",
}: NotificationDiscoveryCtaProps) {
  return (
    <div
      className={[
        "rounded-lg border border-accent/25 bg-accent/5 px-3 py-2.5 sm:px-4 sm:py-3",
        className,
      ].join(" ")}
    >
      <p className="text-sm text-foreground">
        <span className="font-medium">Новые серии из вашей истории.</span>{" "}
        <span className="text-muted">
          Сообщим, когда выйдет продолжение в той же озвучке — в браузере, Telegram, VK или Discord.
        </span>
      </p>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onConfigure}
          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent/90 sm:text-sm"
        >
          Настроить
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-lg px-3 py-1.5 text-xs text-muted transition hover:text-foreground sm:text-sm"
        >
          Не показывать
        </button>
      </div>
    </div>
  );
}
