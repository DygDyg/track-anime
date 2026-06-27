import { shikimoriAvatarUrlLarge } from "@/lib/auth/shikimori-avatar";

type ProfileAvatarProps = {
  nickname: string;
  avatar: string | null;
};

export function ProfileAvatar({ nickname, avatar }: ProfileAvatarProps) {
  const avatarSrc = shikimoriAvatarUrlLarge(avatar);
  const initial = nickname.slice(0, 1).toUpperCase();

  return (
    <div className="group relative isolate mx-auto shrink-0 sm:mx-0">
      {avatarSrc ? (
        <img
          aria-hidden
          alt=""
          src={avatarSrc}
          className="pointer-events-none absolute inset-0 h-full w-full scale-110 rounded-[1.65rem] object-cover opacity-50 blur-2xl transition-opacity duration-300 group-hover:opacity-70"
        />
      ) : null}

      <div
        aria-hidden
        className="absolute -inset-2 rotate-6 rounded-[1.85rem] bg-gradient-to-br from-accent via-accent/60 to-accent/20 opacity-80 shadow-lg shadow-accent/25"
      />

      <div className="relative h-32 w-32 overflow-hidden rounded-[1.5rem] border-[3px] border-background bg-card shadow-2xl shadow-black/40 ring-2 ring-accent/45 sm:h-36 sm:w-36">
        {avatarSrc ? (
          <>
            <img
              alt=""
              src={avatarSrc}
              className="h-full w-full object-cover"
              decoding="async"
              loading="eager"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-white/15" />
          </>
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-accent/35 via-accent/15 to-transparent text-5xl font-bold text-accent sm:text-6xl">
            {initial}
          </span>
        )}
      </div>

      <div
        aria-hidden
        className="pointer-events-none absolute -left-1 top-3 h-6 w-6 border-l-2 border-t-2 border-accent/70"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-1 -right-1 h-6 w-6 border-b-2 border-r-2 border-accent/70"
      />
    </div>
  );
}
