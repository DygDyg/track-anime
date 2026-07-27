"use client";

import { useCallback, useEffect, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { useSiteSettings } from "@/components/SiteSettingsProvider";
import type { AnimePageDto } from "@/lib/anime-page";
import {
  buildAnimeShareText,
  buildVkShareUrl,
  type AnimeShareCopyFormat,
} from "@/lib/anime-share-copy";
import { playCopySound } from "@/lib/copy-feedback";
import { emitCompanionReaction } from "@/lib/companion/companion-bus";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

type ShareAction = { type: "copy"; format: AnimeShareCopyFormat; label: string };

const ACTIONS: ShareAction[] = [
  { type: "copy", format: "plain", label: "Копировать" },
  { type: "copy", format: "vk", label: "VK" },
  { type: "copy", format: "discord", label: "Discord" },
  { type: "copy", format: "telegram", label: "Telegram" },
];

const TOAST_MS = 2600;

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" strokeLinecap="round" />
    </svg>
  );
}

function VkIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
      <path d="M12.785 16.241s.288-.032.436-.194c.136-.148.132-.427.132-.427s-.02-1.304.587-1.496c.598-.188 1.366 1.258 2.182 1.813.616.422 1.084.33 1.084.33l2.177-.03s1.138-.071.598-.967c-.044-.073-.314-.658-1.618-1.86-1.366-1.258-1.184-.105.462-3.217.998-1.77 1.397-2.85 1.272-3.314-.118-.436-.84-.321-.84-.321l-2.468.015s-.183-.025-.318.056c-.132.079-.216.262-.216.262s-.387 1.028-.903 1.903c-1.089 1.854-1.525 1.952-1.703 1.837-.414-.27-.31-1.085-.31-1.659 0-1.804.272-2.556-.53-2.75-.266-.064-.462-.106-1.143-.113-.874-.009-1.613.003-2.03.208-.279.136-.494.44-.363.458.162.022.529.099.723.363.251.345.242 1.12.242 1.12s.145 2.134-.337 2.398c-.331.18-.784-.187-1.757-1.867-.498-.854-.874-1.798-.874-1.798s-.072-.177-.201-.272c-.156-.115-.374-.151-.374-.151l-2.345.015s-.352.01-.481.162c-.115.136-.009.417-.009.417s1.816 4.259 3.872 6.405c1.885 1.967 4.033 1.838 4.033 1.838h.967z" />
    </svg>
  );
}

function DiscordIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037 12.3 12.3 0 0 0-.608 1.25 18.7 18.7 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.864-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.419 0 1.334-.956 2.419-2.157 2.419zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.419 0 1.334-.946 2.419-2.157 2.419z" />
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}

function ActionIcon({ action }: { action: ShareAction }) {
  if (action.format === "vk") return <VkIcon />;
  if (action.format === "discord") return <DiscordIcon />;
  if (action.format === "telegram") return <TelegramIcon />;
  return <CopyIcon />;
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

function CopyToast({ message }: { message: string }) {
  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className="copy-toast pointer-events-none fixed bottom-6 left-1/2 z-[120] -translate-x-1/2"
    >
      <div className="flex items-center gap-2 rounded-full border border-border bg-card/95 px-4 py-2.5 text-sm font-medium text-foreground shadow-xl shadow-black/40 backdrop-blur-sm">
        <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-accent" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
          <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {message}
      </div>
    </div>,
    document.body,
  );
}

export function AnimeShareButtons({ anime }: { anime: AnimePageDto }) {
  const { settings } = useSiteSettings();
  const [toast, setToast] = useState<string | null>(null);
  const [copyingFormat, setCopyingFormat] = useState<AnimeShareCopyFormat | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const showCopyFeedback = useCallback(
    (format: AnimeShareCopyFormat) => {
      const formatLabel =
        format === "plain"
          ? "обычном"
          : format === "discord"
            ? "Discord"
            : format === "telegram"
              ? "Telegram"
              : "VK";
      setToast(`Скопировано в буфер обмена (${formatLabel} формат)`);
      if (!settings.reduceMotion) {
        playCopySound();
      }
      emitCompanionReaction("celebrate");
    },
    [settings.reduceMotion],
  );

  const handleAction = useCallback(
    async (action: ShareAction, event: MouseEvent<HTMLButtonElement>) => {
      const origin = window.location.origin;

      if (action.format === "vk" && (event.ctrlKey || event.metaKey)) {
        window.open(buildVkShareUrl(anime, origin), "_blank", "noopener,noreferrer");
        return;
      }

      try {
        setCopyingFormat(action.format);
        const text = buildAnimeShareText(anime, origin, action.format);
        await copyText(text);
        showCopyFeedback(action.format);
      } catch {
        setToast("Не удалось скопировать");
        emitCompanionReaction("error");
      } finally {
        setCopyingFormat(null);
      }
    },
    [anime, showCopyFeedback],
  );

  const actionTitle = (action: ShareAction) => {
    if (action.format === "plain") return "Скопировать описание";
    if (action.format === "vk") return "Скопировать для VK (Ctrl+клик — поделиться ссылкой)";
    if (action.format === "discord") return "Скопировать для Discord";
    return "Скопировать для Telegram";
  };

  return (
    <>
      <div className="mt-2 w-full">
        <div className="grid grid-cols-4 gap-1.5">
          {ACTIONS.map((action) => (
            <button
              key={action.label}
              type="button"
              title={actionTitle(action)}
              aria-label={action.label}
              disabled={copyingFormat != null}
              aria-busy={copyingFormat === action.format || undefined}
              onClick={(event) => void handleAction(action, event)}
              className={[
                "flex aspect-square items-center justify-center rounded-lg border border-border bg-background/80 text-foreground transition hover:border-accent/45 hover:bg-accent/10 hover:text-accent",
                copyingFormat != null ? "cursor-wait opacity-70" : "",
              ].join(" ")}
            >
              {copyingFormat === action.format ? <LoadingSpinner size="sm" /> : <ActionIcon action={action} />}
            </button>
          ))}
        </div>
      </div>
      {mounted && toast ? <CopyToast message={toast} /> : null}
    </>
  );
}
