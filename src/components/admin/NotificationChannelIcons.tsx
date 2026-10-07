export type AdminNotificationChannelId =
  | "telegram"
  | "vk"
  | "discord"
  | "browser"
  | "fcm";

export function TelegramChannelIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}

export function VkChannelIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12.785 16.241s.288-.032.436-.194c.136-.148.132-.427.132-.427s-.02-1.304.587-1.496c.598-.19 1.367 1.26 2.18 1.816.615.42 1.082.328 1.082.328l2.172-.03s1.136-.07.598-.964c-.044-.073-.314-.66-1.616-1.866-1.363-1.262-1.18-.057.46-3.24.999-1.94 1.398-3.125 1.273-3.633-.12-.485-.858-.357-.858-.357h-2.46s-.183-.025-.318.056c-.13.078-.214.26-.214.26s-.383 1.02-.894 1.888c-1.078 1.83-1.51 1.928-1.687 1.815-.412-.264-.309-1.06-.309-1.626 0-1.767.268-2.501-.522-2.692-.262-.063-.455-.105-1.125-.112-.86-.01-1.586.003-2-.204-.316-.158-.512-.495-.377-.514.167-.023.39-.046.672-.046.714-.012 1.15.137 1.15.137s.383.026.522.353c.16.378.154 1.226.154 1.226s.092 2.33-.214 2.62c-.21.198-.498-.206-.498-.206s-.94-1.096-1.348-2.35c-.22-.67-.386-1.49-.386-1.49s-.032-.247-.224-.38c-.233-.16-.558-.21-.558-.21h-2.34s-.352.01-.481.163c-.115.136-.009.417-.009.417s1.795 4.2 3.826 6.31c1.862 1.936 3.977 1.81 3.977 1.81h.96z" />
    </svg>
  );
}

export function DiscordChannelIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

export function BrowserPushChannelIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function FcmChannelIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="7" y="2" width="10" height="20" rx="2" />
      <path d="M11 18h2" strokeLinecap="round" />
    </svg>
  );
}

const CHANNEL_META: Record<
  AdminNotificationChannelId,
  { label: string; className: string; Icon: typeof TelegramChannelIcon }
> = {
  telegram: { label: "Telegram", className: "text-[#2AABEE]", Icon: TelegramChannelIcon },
  vk: { label: "VK", className: "text-[#0077FF]", Icon: VkChannelIcon },
  discord: { label: "Discord", className: "text-[#5865F2]", Icon: DiscordChannelIcon },
  browser: { label: "Браузерный push", className: "text-amber-300", Icon: BrowserPushChannelIcon },
  fcm: { label: "Android FCM", className: "text-emerald-400", Icon: FcmChannelIcon },
};

/** Подпись канала с цветной иконкой (как в админке → Пользователи). */
export function NotificationChannelLabel({
  channel,
  label,
  iconClassName = "h-4 w-4",
}: {
  channel: AdminNotificationChannelId;
  label?: string;
  iconClassName?: string;
}) {
  const meta = CHANNEL_META[channel];
  const Icon = meta.Icon;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-flex shrink-0 ${meta.className}`}>
        <Icon className={iconClassName} />
      </span>
      {label ?? meta.label}
    </span>
  );
}

export function NotificationChannelBadges({
  channels,
}: {
  channels: AdminNotificationChannelId[];
}) {
  if (channels.length === 0) return null;

  return (
    <span className="ml-2 inline-flex items-center gap-1 align-middle">
      {channels.map((id) => {
        const meta = CHANNEL_META[id];
        const Icon = meta.Icon;
        return (
          <span
            key={id}
            title={meta.label}
            aria-label={meta.label}
            className={`inline-flex ${meta.className}`}
          >
            <Icon className="h-3.5 w-3.5" />
          </span>
        );
      })}
    </span>
  );
}
