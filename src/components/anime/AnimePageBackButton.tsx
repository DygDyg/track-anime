"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useNavigationPendingSetter } from "@/components/NavigationProgress";
import { canReturnInApp } from "@/lib/navigation-return";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

type Props = {
  className?: string;
};

export function AnimePageBackButton({ className }: Props) {
  const router = useRouter();
  const setNavPending = useNavigationPendingSetter();
  const [pending, setPending] = useState(false);

  return (
    <button
      type="button"
      disabled={pending}
      aria-busy={pending || undefined}
      onClick={() => {
        if (pending) return;
        setPending(true);
        setNavPending(true);
        if (canReturnInApp()) {
          router.back();
          return;
        }
        router.push("/");
      }}
      className={[className, pending ? "cursor-wait opacity-80" : ""].filter(Boolean).join(" ")}
    >
      {pending ? (
        <span className="inline-flex items-center gap-1.5">
          <LoadingSpinner size="xs" />
          Назад…
        </span>
      ) : (
        "← Назад"
      )}
    </button>
  );
}
