import Link from "next/link";
import { adminClass } from "@/components/admin/admin-styles";
import type { WatchPartyHistorySessionDto } from "@/lib/admin/watch-party-history";

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("ru-RU");
}

function formatDuration(createdAt: string, endedAt: string | null): string {
  const start = new Date(createdAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  const sec = Math.max(0, Math.floor((end - start) / 1000));
  if (sec < 60) return `${sec} с`;
  const mins = Math.floor(sec / 60);
  if (mins < 60) return `${mins} мин`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem ? `${hours} ч ${rem} мин` : `${hours} ч`;
}

function PermissionChips({ session }: { session: WatchPartyHistorySessionDto }) {
  const chips: { on: boolean; label: string }[] = [
    { on: session.siteEnabled, label: "сайт: вкл" },
    { on: session.siteAllowGuests, label: "гости" },
    { on: session.allowParticipantControls, label: "play/pause" },
    { on: session.allowParticipantSeeking, label: "seek" },
    { on: session.allowParticipantEpisodeSelection, label: "серии" },
    { on: session.allowParticipantTranslationSelection, label: "озвучки" },
    { on: session.syncTranslations, label: "sync озвучек" },
  ];

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <span
          key={chip.label}
          className={
            chip.on
              ? "rounded-md border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent"
              : "rounded-md border border-border px-1.5 py-0.5 text-[10px] text-muted"
          }
        >
          {chip.label}
          {chip.on ? "" : " · выкл"}
        </span>
      ))}
    </div>
  );
}

export function WatchPartyHistoryPanel({
  sessions,
}: {
  sessions: WatchPartyHistorySessionDto[];
}) {
  return (
    <section className={`${adminClass.panel} space-y-4`}>
      <div>
        <h3 className="text-base font-semibold text-foreground">История запусков</h3>
        <p className="mt-1 text-xs text-muted">
          Сессии пишутся WebSocket-сервером: тайтл, состав, создатель и права комнаты. Последние{" "}
          {sessions.length || 50}.
        </p>
      </div>

      {sessions.length === 0 ? (
        <p className="rounded-lg border border-border bg-background p-3 text-sm text-muted">
          Пока нет сохранённых сессий. История появится после следующего запуска совместного
          просмотра (нужен обновлённый watch-party сервер).
        </p>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <article
              key={session.id}
              className="rounded-lg border border-border bg-background p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Комната {session.roomKey}
                    {session.active ? (
                      <span className="ml-2 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-accent">
                        активна
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-1 text-sm text-foreground">
                    <Link
                      href={`/anime/${session.shikimoriId}`}
                      className={adminClass.textLink}
                    >
                      {session.animeTitle ?? `Shikimori ${session.shikimoriId}`}
                    </Link>
                    {" · "}
                    S{session.seasonNumber} · E{session.episodeNumber}
                    {session.translationTitle ? ` · ${session.translationTitle}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Создал: {session.creatorNickname}
                    {" · "}
                    {formatDateTime(session.createdAt)}
                    {" → "}
                    {session.endedAt ? formatDateTime(session.endedAt) : "сейчас"}
                    {" · "}
                    {formatDuration(session.createdAt, session.endedAt)}
                    {" · макс. "}
                    {session.maxParticipants} участн.
                  </p>
                </div>
              </div>

              <PermissionChips session={session} />

              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-left text-xs">
                  <thead className="text-muted">
                    <tr className="border-b border-border">
                      <th className="py-2 pr-3 font-medium">Участник</th>
                      <th className="py-2 pr-3 font-medium">Роль</th>
                      <th className="py-2 pr-3 font-medium">Вошёл</th>
                      <th className="py-2 pr-3 font-medium">Вышел</th>
                    </tr>
                  </thead>
                  <tbody>
                    {session.participants.map((p) => (
                      <tr
                        key={`${session.id}-${p.userId}-${p.joinedAt}`}
                        className="border-b border-border/60 last:border-0"
                      >
                        <td className="py-2 pr-3 text-foreground">{p.nickname}</td>
                        <td className="py-2 pr-3 text-muted">
                          {[
                            p.isCreator ? "создатель" : null,
                            p.wasMaster ? "мастер" : null,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "участник"}
                        </td>
                        <td className="py-2 pr-3 text-muted">{formatDateTime(p.joinedAt)}</td>
                        <td className="py-2 pr-3 text-muted">{formatDateTime(p.leftAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
