import {
  hashTitleSeed,
  titleCoverInitial,
  titleCoverLines,
  titleCoverPalette,
  titleCoverPatternVariant,
} from "@/lib/title-cover";

type Props = {
  title: string;
  className?: string;
  compact?: boolean;
};

function TitleCoverPatterns({
  variant,
  accent,
  accentSoft,
  shadow,
  idPrefix,
}: {
  variant: 0 | 1 | 2;
  accent: string;
  accentSoft: string;
  shadow: string;
  idPrefix: string;
}) {
  const ringStroke = accentSoft;
  const deepStroke = shadow;
  const glowId = `${idPrefix}-glow`;
  const ringId = `${idPrefix}-ring`;
  const diamondId = `${idPrefix}-diamond`;
  const orbitId = `${idPrefix}-orbit`;

  if (variant === 0) {
    return (
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 240 360"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden
      >
        <defs>
          <radialGradient id={glowId} cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor={accent} stopOpacity="0.28" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </radialGradient>
          <linearGradient id={ringId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={accent} stopOpacity="0.55" />
            <stop offset="100%" stopColor={accent} stopOpacity="0.08" />
          </linearGradient>
        </defs>
        <ellipse cx="120" cy="300" rx="92" ry="28" fill={deepStroke} opacity="0.45" />
        <circle cx="168" cy="72" r="54" fill={`url(#${glowId})`} />
        <circle cx="168" cy="72" r="48" fill="none" stroke={`url(#${ringId})`} strokeWidth="3" opacity="0.9" />
        <circle cx="168" cy="72" r="36" fill="none" stroke={ringStroke} strokeWidth="2" />
        <circle cx="168" cy="72" r="24" fill="none" stroke={accent} strokeWidth="1.5" opacity="0.35" />
        <path
          d="M-12 210 C 40 170, 90 250, 140 210 S 230 150, 260 190"
          fill="none"
          stroke={ringStroke}
          strokeWidth="10"
          strokeLinecap="round"
          opacity="0.55"
        />
        <path
          d="M20 260 C 70 220, 120 290, 170 250"
          fill="none"
          stroke={accent}
          strokeWidth="4"
          strokeLinecap="round"
          opacity="0.22"
        />
      </svg>
    );
  }

  if (variant === 1) {
    return (
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 240 360"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden
      >
        <defs>
          <linearGradient id={diamondId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={accent} stopOpacity="0.5" />
            <stop offset="100%" stopColor={accent} stopOpacity="0.05" />
          </linearGradient>
        </defs>
        <polygon
          points="120,24 176,88 120,152 64,88"
          fill={`url(#${diamondId})`}
          stroke={accent}
          strokeWidth="1.5"
          opacity="0.75"
        />
        <polygon
          points="120,44 156,88 120,132 84,88"
          fill="none"
          stroke={accentSoft}
          strokeWidth="2"
        />
        <ellipse cx="120" cy="300" rx="88" ry="24" fill={deepStroke} opacity="0.4" />
        <rect
          x="18"
          y="198"
          width="72"
          height="72"
          rx="14"
          transform="rotate(-18 54 234)"
          fill={accentSoft}
          stroke={accent}
          strokeWidth="1.5"
          opacity="0.35"
        />
        <rect
          x="150"
          y="228"
          width="58"
          height="58"
          rx="12"
          transform="rotate(24 179 257)"
          fill="none"
          stroke={ringStroke}
          strokeWidth="3"
          opacity="0.65"
        />
        <path
          d="M0 120 L240 80"
          stroke={accent}
          strokeWidth="2"
          opacity="0.12"
        />
        <path
          d="M0 160 L240 120"
          stroke={accent}
          strokeWidth="2"
          opacity="0.1"
        />
      </svg>
    );
  }

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 240 360"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      <defs>
        <radialGradient id={orbitId} cx="50%" cy="50%" r="50%">
          <stop offset="70%" stopColor={accent} stopOpacity="0" />
          <stop offset="100%" stopColor={accent} stopOpacity="0.35" />
        </radialGradient>
      </defs>
      <ellipse cx="120" cy="308" rx="96" ry="26" fill={deepStroke} opacity="0.42" />
      <circle cx="52" cy="92" r="40" fill={`url(#${orbitId})`} />
      <circle cx="52" cy="92" r="34" fill="none" stroke={ringStroke} strokeWidth="3" />
      <circle cx="52" cy="92" r="22" fill="none" stroke={accent} strokeWidth="1.5" opacity="0.3" />
      <path
        d="M188 40 L220 96 L188 152 L156 96 Z"
        fill={accentSoft}
        stroke={accent}
        strokeWidth="1.5"
        opacity="0.45"
      />
      <path
        d="M188 58 L204 96 L188 134 L172 96 Z"
        fill="none"
        stroke={accent}
        strokeWidth="1.5"
        opacity="0.35"
      />
      <path
        d="M8 280 Q 80 240, 120 268 T 232 248"
        fill="none"
        stroke={ringStroke}
        strokeWidth="8"
        strokeLinecap="round"
        opacity="0.5"
      />
      <path
        d="M24 318 Q 96 278, 136 306 T 248 286"
        fill="none"
        stroke={accent}
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.18"
      />
    </svg>
  );
}

export function TitleCover({ title, className = "", compact = false }: Props) {
  const palette = titleCoverPalette(title);
  const lines = titleCoverLines(title, compact ? 3 : 4, compact);
  const initial = titleCoverInitial(title);
  const variant = titleCoverPatternVariant(title);
  const idPrefix = `tc-${hashTitleSeed(title)}`;

  return (
    <div
      className={[
        "relative flex h-full w-full select-none flex-col items-center justify-center overflow-hidden text-center",
        compact ? "p-2.5" : "p-4",
        className,
      ].join(" ")}
      style={{ background: palette.background }}
      aria-hidden={title ? undefined : true}
    >
      <TitleCoverPatterns
        variant={variant}
        accent={palette.accent}
        accentSoft={palette.accentSoft}
        shadow={palette.shadow}
        idPrefix={idPrefix}
      />

      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 15%, rgba(255,255,255,0.16) 0, transparent 42%), radial-gradient(circle at 80% 85%, rgba(0,0,0,0.22) 0, transparent 48%)",
        }}
      />

      <span
        className={[
          "relative z-[1] mb-2.5 flex items-center justify-center rounded-full border border-white/20 font-bold text-white shadow-[0_8px_20px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.25)] backdrop-blur-[2px]",
          compact ? "h-10 w-10 text-base" : "h-14 w-14 text-xl sm:text-2xl",
        ].join(" ")}
        style={{
          color: palette.accent,
          background: "linear-gradient(180deg, rgba(255,255,255,0.14) 0%, rgba(0,0,0,0.28) 100%)",
        }}
      >
        {initial}
      </span>

      <div
        className={[
          "relative z-[1] max-w-full font-bold leading-tight tracking-tight text-white",
          "drop-shadow-[0_2px_4px_rgba(0,0,0,0.55)]",
          compact ? "text-sm" : "text-base sm:text-lg md:text-xl",
        ].join(" ")}
      >
        {lines.map((line) => (
          <p key={line} className="line-clamp-2 break-words px-1">
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}
