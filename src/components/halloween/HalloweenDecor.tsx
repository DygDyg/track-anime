"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useSiteSettings } from "@/components/SiteSettingsProvider";
import {
  applyHolidayThemeAttribute,
  DEFAULT_HOLIDAY_WINDOWS,
  readHolidayPublicConfigFromWindow,
  resolveHolidayTheme,
} from "@/lib/holiday-theme";

const BAT_POINTS =
  "50,16 44,6 40,14 22,4 10,12 24,18 2,20 18,26 30,20 38,30 46,22 50,32 54,22 62,30 70,20 82,26 98,20 76,18 90,12 78,4 60,14 56,6";

const BAT_FLIGHTS = ["fly-lr", "fly-rl", "fly-diag-up", "fly-diag-down", "fly-arc"] as const;

type BatSpec = {
  id: number;
  flight: (typeof BAT_FLIGHTS)[number];
  width: number;
  opacity: number;
  duration: number;
  delay: number;
  batY: string;
  batDy: string;
  batTilt: string;
};

function buildBatSpecs(count: number): BatSpec[] {
  const specs: BatSpec[] = [];
  for (let n = 0; n < count; n += 1) {
    const duration = 14 + Math.random() * 16;
    specs.push({
      id: n,
      flight: BAT_FLIGHTS[n % BAT_FLIGHTS.length]!,
      width: 96 + Math.random() * 110,
      opacity: 0.7 + Math.random() * 0.25,
      duration,
      delay: -(Math.random() * duration),
      batY: `${(6 + Math.random() * 72).toFixed(1)}vh`,
      batDy: `${((Math.random() - 0.5) * 40).toFixed(1)}vh`,
      batTilt: `${((Math.random() - 0.5) * 16).toFixed(1)}deg`,
    });
  }
  return specs;
}

function Pumpkins() {
  return (
    <div className="holiday-halloween-art" aria-hidden="true">
      <svg className="holiday-pumpkin holiday-pumpkin-l" viewBox="0 0 80 80">
        <path
          fill="currentColor"
          d="M40 14c1 3 .2 5-1.4 6.6 6.6-.4 11.4 2.2 14 6.6 7 1.2 12 7 12 15.2C64.6 58 54.4 68 40 68S15.4 58 15.4 42.4c0-8.2 5-14 12-15.2 2.6-4.4 7.4-7 14-6.6C39.8 19 39 17 40 14z"
        />
        <path
          d="M40 8c1.6 0 2.4 2.6 1.6 5.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      <svg className="holiday-pumpkin holiday-pumpkin-r" viewBox="0 0 80 80">
        <path
          fill="currentColor"
          d="M40 14c1 3 .2 5-1.4 6.6 6.6-.4 11.4 2.2 14 6.6 7 1.2 12 7 12 15.2C64.6 58 54.4 68 40 68S15.4 58 15.4 42.4c0-8.2 5-14 12-15.2 2.6-4.4 7.4-7 14-6.6C39.8 19 39 17 40 14z"
        />
      </svg>
    </div>
  );
}

function Bats({ reduceMotion }: { reduceMotion: boolean }) {
  const bats = useMemo(() => buildBatSpecs(reduceMotion ? 3 : 14), [reduceMotion]);

  return (
    <div className="holiday-bats" aria-hidden="true">
      {bats.map((bat) => (
        <span
          key={bat.id}
          className={`holiday-sky-bat holiday-${bat.flight}`}
          style={{
            width: bat.width,
            opacity: bat.opacity,
            animationDuration: `${bat.duration.toFixed(1)}s`,
            animationDelay: `${bat.delay.toFixed(1)}s`,
            ["--bat-y" as string]: bat.batY,
            ["--bat-dy" as string]: bat.batDy,
            ["--bat-tilt" as string]: bat.batTilt,
          }}
        >
          <svg viewBox="0 0 100 40" aria-hidden="true">
            <polygon
              fill="currentColor"
              stroke="rgba(255,168,96,0.75)"
              strokeWidth="1.6"
              paintOrder="stroke fill"
              points={BAT_POINTS}
            />
          </svg>
        </span>
      ))}
    </div>
  );
}

/** Halloween palette décor: bats behind content + soft pumpkins. */
export function HalloweenDecor() {
  const { settings } = useSiteSettings();
  const { user } = useAuth();
  const [active, setActive] = useState(false);

  useEffect(() => {
    const holidayCfg = readHolidayPublicConfigFromWindow();
    const adminForce = user?.isAdmin ? settings.holidayAdminForceId : null;
    const theme = resolveHolidayTheme(
      settings.holidaysEnabled,
      new Date(),
      holidayCfg?.windows ?? DEFAULT_HOLIDAY_WINDOWS,
      holidayCfg?.enabled !== false,
      adminForce,
    );
    applyHolidayThemeAttribute(theme);
    setActive(theme === "halloween");
  }, [settings.holidaysEnabled, settings.holidayAdminForceId, user?.isAdmin]);

  if (!active) return null;

  return (
    <>
      <Bats reduceMotion={settings.reduceMotion} />
      <Pumpkins />
    </>
  );
}
