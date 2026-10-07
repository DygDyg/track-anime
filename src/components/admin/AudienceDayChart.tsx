import { adminClass } from "@/components/admin/admin-styles";
import type { AudienceDayPoint } from "@/lib/admin/audience-stats";

const CHART_HEIGHT_PX = 160;
const VALUE_LABEL_RESERVE_PX = 16;
const MIN_SEGMENT_LABEL_PX = 14;

function SegmentValue({ value, visible }: { value: number; visible: boolean }) {
  if (!visible || value <= 0) return null;
  return (
    <span className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-[9px] font-medium leading-none text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.55)]">
      {value}
    </span>
  );
}

export function AudienceDayChart({ days }: { days: AudienceDayPoint[] }) {
  const max = Math.max(1, ...days.map((d) => d.identities));

  return (
    <div className={adminClass.panel}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className={adminClass.statLabel}>Уникальные посетители по дням (UTC)</p>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-[var(--accent)]" aria-hidden />
            С аккаунтом
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: "color-mix(in srgb, var(--muted) 55%, transparent)" }}
              aria-hidden
            />
            Гости
          </span>
        </div>
      </div>

      <div
        className="mt-4 flex items-end gap-1"
        style={{ height: CHART_HEIGHT_PX + VALUE_LABEL_RESERVE_PX }}
      >
        {days.map((d) => {
          let registeredPx = Math.round((d.registered / max) * CHART_HEIGHT_PX);
          let guestsPx = Math.round((d.guests / max) * CHART_HEIGHT_PX);
          const totalPx = registeredPx + guestsPx;
          if (d.identities > 0 && totalPx < 4) {
            const scale = 4 / Math.max(1, totalPx);
            registeredPx = Math.max(d.registered > 0 ? 2 : 0, Math.round(registeredPx * scale));
            guestsPx = Math.max(d.guests > 0 ? 2 : 0, Math.round(guestsPx * scale));
          }

          return (
            <div
              key={d.day}
              className="group relative flex min-w-0 flex-1 flex-col items-center justify-end"
              style={{ height: CHART_HEIGHT_PX + VALUE_LABEL_RESERVE_PX }}
              title={`${d.day}: всего ${d.identities} (с аккаунтом ${d.registered}, гости ${d.guests}), хитов ${d.hits}`}
            >
              {d.identities > 0 ? (
                <span className="mb-0.5 text-[9px] font-medium leading-none tabular-nums text-foreground">
                  {d.identities}
                </span>
              ) : (
                <span className="mb-0.5 h-[9px]" aria-hidden />
              )}
              <div className="flex w-full flex-col justify-end overflow-hidden rounded-full">
                {guestsPx > 0 ? (
                  <div
                    className="relative w-full"
                    style={{
                      height: guestsPx,
                      backgroundColor: "color-mix(in srgb, var(--muted) 55%, transparent)",
                    }}
                  >
                    <SegmentValue value={d.guests} visible={guestsPx >= MIN_SEGMENT_LABEL_PX} />
                  </div>
                ) : null}
                {registeredPx > 0 ? (
                  <div
                    className="relative w-full"
                    style={{ height: registeredPx, backgroundColor: "var(--accent)" }}
                  >
                    <SegmentValue
                      value={d.registered}
                      visible={registeredPx >= MIN_SEGMENT_LABEL_PX}
                    />
                  </div>
                ) : null}
              </div>
              <span className="absolute -bottom-4 hidden text-[9px] text-muted sm:block">
                {d.day.slice(8)}
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-6 text-xs text-muted">
        Число сверху — всего уникальных; в сегментах — с аккаунтом / гости, если хватает высоты.
        Наведите — детали дня.
      </p>
    </div>
  );
}
