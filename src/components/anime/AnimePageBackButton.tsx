"use client";

import { useRouter } from "next/navigation";
import { canReturnInApp } from "@/lib/navigation-return";

type Props = {
  className?: string;
};

export function AnimePageBackButton({ className }: Props) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        if (canReturnInApp()) {
          router.back();
          return;
        }
        router.push("/");
      }}
      className={className}
    >
      ← Назад
    </button>
  );
}
