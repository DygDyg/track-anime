"use client";

import { useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  useUserListStatus,
  useUserListStatusActions,
} from "@/components/favorites/UserListStatusProvider";
import {
  animeScoreAccentColor,
  animeScoreBadgeStyle,
  compareUserToCommunityScore,
  labelUserAnimeScore,
} from "@/lib/anime-score";

const SCORES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

type Props = {
  shikimoriId: number;
  communityScore?: number | null;
};

export function AnimeUserScoreVote({ shikimoriId, communityScore = null }: Props) {
  const { user, loading: authLoading, login } = useAuth();
  const { loading: listsLoading, updateList, isUpdating } = useUserListStatusActions();
  const listInfo = useUserListStatus(shikimoriId);
  const [error, setError] = useState<string | null>(null);
  const [hoverScore, setHoverScore] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const currentScore = listInfo?.userScore ?? null;
  const pending = saving || isUpdating(shikimoriId);
  const previewScore = hoverScore ?? currentScore;
  const previewLabel = labelUserAnimeScore(previewScore);
  const previewStyle = previewScore != null ? animeScoreBadgeStyle(previewScore) : null;
  const comparison =
    currentScore != null && communityScore != null && Number.isFinite(communityScore)
      ? compareUserToCommunityScore(currentScore, communityScore)
      : null;

  async function runScoreUpdate(score: number) {
    if (!user || savingRef.current || isUpdating(shikimoriId)) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    setHoverScore(null);
    try {
      await updateList(shikimoriId, { score });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить оценку");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function setScore(next: number) {
    await runScoreUpdate(currentScore === next ? 0 : next);
  }

  async function clearScore() {
    if (currentScore == null) return;
    await runScoreUpdate(0);
  }

  if (authLoading || listsLoading) {
    return (
      <div className="mt-3 border-t border-border/70 pt-3">
        <div className="h-14 animate-pulse rounded-lg bg-surface-dim" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mt-3 border-t border-border/70 pt-3">
        <p className="text-[11px] text-muted">
          Войдите, чтобы оценить.{" "}
          <button
            type="button"
            onClick={login}
            className="font-medium text-accent transition hover:underline"
          >
            Войти
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className="mt-3 border-t border-border/70 pt-3" aria-busy={pending}>
      <div className="mb-2 flex items-center gap-2.5">
        <button
          type="button"
          disabled={pending || currentScore == null}
          onClick={() => void clearScore()}
          title={currentScore != null ? "Сбросить оценку" : undefined}
          aria-label={
            currentScore != null
              ? `Ваша оценка ${currentScore}, нажмите чтобы сбросить`
              : "Оценка не выставлена"
          }
          className={[
            "flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl border text-center transition",
            "disabled:cursor-default",
            previewScore != null
              ? "border-transparent shadow-sm"
              : "border-border border-dashed bg-background/60 text-muted",
            currentScore != null
              ? "cursor-pointer hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
              : "",
            pending ? "animate-pulse" : "",
          ].join(" ")}
          style={previewStyle ?? undefined}
        >
          {previewScore != null ? (
            <span className="text-2xl font-bold leading-none tabular-nums">{previewScore}</span>
          ) : (
            <span className="text-xl font-semibold leading-none tabular-nums">—</span>
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-xs font-medium text-foreground">
              {pending ? "Сохранение…" : (previewLabel ?? "Ваша оценка")}
            </p>
            {!pending && comparison ? (
              <p
                className={[
                  "shrink-0 text-[11px] tabular-nums",
                  comparison.delta > 0.14
                    ? "text-emerald-400"
                    : comparison.delta < -0.14
                      ? "text-amber-400"
                      : "text-muted",
                ].join(" ")}
                title={
                  communityScore != null
                    ? `${comparison.label} (средняя ${communityScore.toFixed(1)})`
                    : comparison.label
                }
              >
                {comparison.delta > 0.14
                  ? `+${comparison.delta.toFixed(1)}`
                  : comparison.delta < -0.14
                    ? comparison.delta.toFixed(1)
                    : "="}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="relative">
        <div
          className={[
            "flex overflow-hidden rounded-xl border border-border bg-background/40",
            pending ? "pointer-events-none opacity-55" : "",
          ].join(" ")}
          onMouseLeave={() => {
            if (!pending) setHoverScore(null);
          }}
          role="radiogroup"
          aria-label="Оценка от 1 до 10"
          aria-disabled={pending}
        >
          {SCORES.map((score, index) => {
            const selected = currentScore === score;
            const filled = currentScore != null && score <= currentScore;
            const hovered = !pending && hoverScore != null && score <= hoverScore;
            const active = selected || filled || hovered;
            const style = active ? animeScoreBadgeStyle(score) : undefined;
            const label = labelUserAnimeScore(score);
            const isTen = score === 10;

            return (
              <button
                key={score}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={pending}
                onClick={() => void setScore(score)}
                onMouseEnter={() => {
                  if (!pending) setHoverScore(score);
                }}
                onFocus={() => {
                  if (!pending) setHoverScore(score);
                }}
                onBlur={() => setHoverScore(null)}
                aria-label={`${score} — ${label}${selected ? " (сбросить)" : ""}`}
                title={`${score} — ${label}`}
                className={[
                  "relative h-10 min-w-0 px-0.5 text-[13px] font-bold tabular-nums leading-none transition",
                  isTen ? "flex-[1.35]" : "flex-1",
                  "focus-visible:z-[1] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent",
                  "disabled:cursor-wait",
                  index > 0 ? "border-l border-black/10 dark:border-white/10" : "",
                  selected ? "z-[1] ring-1 ring-inset ring-white/40" : "",
                  !active ? "bg-transparent text-muted/80 hover:bg-surface-dim hover:text-foreground" : "",
                ].join(" ")}
                style={style}
              >
                {score}
              </button>
            );
          })}
        </div>

        {pending ? (
          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-background/55 backdrop-blur-[1px]"
            aria-live="polite"
          >
            <span className="rounded-md bg-card/90 px-2.5 py-1 text-[11px] font-medium text-muted shadow-sm">
              Сохранение…
            </span>
          </div>
        ) : null}
      </div>

      <div className="mt-1 flex justify-between px-0.5 text-[10px] leading-none text-muted/80">
        <span className="inline-flex items-center gap-1">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: animeScoreAccentColor(1) }}
            aria-hidden
          />
          1
        </span>
        <span className="inline-flex items-center gap-1">
          10
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: animeScoreAccentColor(10) }}
            aria-hidden
          />
        </span>
      </div>

      {error ? <p className="mt-1.5 text-[11px] text-red-400">{error}</p> : null}
    </div>
  );
}
