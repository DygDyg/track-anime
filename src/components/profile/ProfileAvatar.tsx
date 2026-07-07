import { AvatarWithDecoration } from "@/components/profile/AvatarWithDecoration";

type ProfileAvatarProps = {
  nickname: string;
  avatar: string | null;
  decorationId?: string | null;
  decorationScale?: number;
};

export function ProfileAvatar({
  nickname,
  avatar,
  decorationId = null,
  decorationScale,
}: ProfileAvatarProps) {
  return (
    <div className="group relative isolate mx-auto shrink-0 sm:mx-0">
      <div
        aria-hidden
        className="absolute -inset-3 rounded-full bg-gradient-to-br from-accent via-accent/60 to-accent/20 opacity-70 blur-md"
      />

      <div className="relative rounded-full ring-2 ring-accent/45 ring-offset-2 ring-offset-card">
        <AvatarWithDecoration
          avatar={avatar}
          nickname={nickname}
          decorationId={decorationId}
          decorationScale={decorationScale}
          size="profile"
        />
      </div>
    </div>
  );
}
