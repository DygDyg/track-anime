"use client";

import { ListStatusBadge } from "@/components/favorites/ListStatusBadge";
import { useUserListStatus } from "@/components/favorites/UserListStatusProvider";
import type { ComponentProps } from "react";

type ListStatusBadgeProps = ComponentProps<typeof ListStatusBadge>;

export function AnimePageListBadge({
  shikimoriId,
  ...props
}: Omit<ListStatusBadgeProps, "info"> & { shikimoriId: number }) {
  const listInfo = useUserListStatus(shikimoriId);
  return <ListStatusBadge info={listInfo} {...props} />;
}
