"use client";

import Link from "next/link";
import { useState } from "react";
import { NotificationChannelBadges } from "@/components/admin/NotificationChannelIcons";
import { adminClass } from "@/components/admin/admin-styles";
import type { AdminUserRow } from "@/lib/admin/stats";
import { userProfilePath } from "@/lib/public-user";

type UserRow = AdminUserRow;

type SortKey =
  | "nickname"
  | "shikimoriId"
  | "sessions"
  | "listEntries"
  | "createdAt"
  | "lastLoginAt"
  | "isAdmin";

type SortDir = "asc" | "desc";

function formatAdminDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function compareUsers(a: UserRow, b: UserRow, key: SortKey, dir: SortDir): number {
  const sign = dir === "asc" ? 1 : -1;
  switch (key) {
    case "nickname":
      return sign * a.nickname.localeCompare(b.nickname, "ru", { sensitivity: "base" });
    case "shikimoriId":
      return sign * (a.shikimoriId - b.shikimoriId);
    case "sessions":
      return sign * (a.sessions - b.sessions);
    case "listEntries":
      return sign * (a.listEntries - b.listEntries);
    case "createdAt":
      return sign * (Date.parse(a.createdAt) - Date.parse(b.createdAt));
    case "lastLoginAt": {
      const aTs = a.lastLoginAt ? Date.parse(a.lastLoginAt) : 0;
      const bTs = b.lastLoginAt ? Date.parse(b.lastLoginAt) : 0;
      return sign * (aTs - bTs);
    }
    case "isAdmin":
      return sign * (Number(a.isAdmin) - Number(b.isAdmin));
    default:
      return 0;
  }
}

function SortHeader({
  label,
  column,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  column: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const active = sortKey === column;
  const marker = active ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  return (
    <th className="px-4 py-3">
      <button
        type="button"
        onClick={() => onSort(column)}
        className={[
          "inline-flex items-center gap-0.5 font-medium transition hover:text-foreground",
          active ? "text-foreground" : "text-inherit",
        ].join(" ")}
        aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
      >
        {label}
        <span className="tabular-nums text-muted" aria-hidden>
          {marker || " ↕"}
        </span>
      </button>
    </th>
  );
}

export function AdminUsersTable({ initialUsers }: { initialUsers: UserRow[] }) {
  const [users, setUsers] = useState(initialUsers);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sortedUsers = [...users].sort((a, b) => compareUsers(a, b, sortKey, sortDir));

  function onSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "nickname" ? "asc" : "desc");
  }

  async function toggleAdmin(userId: string, nextValue: boolean) {
    setBusyId(userId);
    setError(null);

    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, isAdmin: nextValue }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Не удалось обновить пользователя");
        return;
      }

      setUsers((prev) =>
        prev.map((user) => (user.id === userId ? { ...user, isAdmin: nextValue } : user)),
      );
    } catch {
      setError("Ошибка сети");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      {error ? <p className={`mb-4 ${adminClass.alertError}`}>{error}</p> : null}

      <div className={`overflow-x-auto ${adminClass.panel} !p-0`}>
        <table className="min-w-full text-left text-sm">
          <thead className={adminClass.tableHead}>
            <tr>
              <SortHeader label="Пользователь" column="nickname" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <SortHeader label="Shikimori ID" column="shikimoriId" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <SortHeader label="Сессии" column="sessions" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <SortHeader label="Список" column="listEntries" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <SortHeader label="Регистрация" column="createdAt" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <SortHeader label="Последний визит" column="lastLoginAt" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <th className="px-4 py-3">Профиль</th>
              <SortHeader label="Админ" column="isAdmin" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            </tr>
          </thead>
          <tbody>
            {sortedUsers.map((user) => (
              <tr key={user.id} className={adminClass.tableRow}>
                <td className="px-4 py-3 font-semibold text-foreground">
                  <span className="inline-flex flex-wrap items-center gap-y-1">
                    {user.nickname}
                    <NotificationChannelBadges channels={user.notificationChannels} />
                  </span>
                </td>
                <td className="px-4 py-3 tabular-nums text-muted">{user.shikimoriId}</td>
                <td className="px-4 py-3 tabular-nums text-muted">{user.sessions}</td>
                <td className="px-4 py-3 tabular-nums text-muted">{user.listEntries}</td>
                <td className="px-4 py-3 text-muted">
                  {new Date(user.createdAt).toLocaleDateString("ru-RU")}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-muted">
                  {formatAdminDateTime(user.lastLoginAt)}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={userProfilePath(user.shikimoriId)}
                    className={adminClass.btnSecondary}
                  >
                    Профиль
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    disabled={busyId === user.id}
                    onClick={() => void toggleAdmin(user.id, !user.isAdmin)}
                    className={user.isAdmin ? adminClass.btnSmOn : adminClass.btnSmOff}
                  >
                    {busyId === user.id ? "…" : user.isAdmin ? "Да" : "Нет"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
