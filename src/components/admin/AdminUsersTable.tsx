"use client";

import Link from "next/link";
import { useState } from "react";
import { adminClass } from "@/components/admin/admin-styles";
import { userProfilePath } from "@/lib/public-user";

type UserRow = {
  id: string;
  shikimoriId: number;
  nickname: string;
  isAdmin: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  sessions: number;
  listEntries: number;
};

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

export function AdminUsersTable({ initialUsers }: { initialUsers: UserRow[] }) {
  const [users, setUsers] = useState(initialUsers);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
              <th className="px-4 py-3">Пользователь</th>
              <th className="px-4 py-3">Shikimori ID</th>
              <th className="px-4 py-3">Сессии</th>
              <th className="px-4 py-3">Список</th>
              <th className="px-4 py-3">Регистрация</th>
              <th className="px-4 py-3">Последний вход</th>
              <th className="px-4 py-3">Профиль</th>
              <th className="px-4 py-3">Админ</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className={adminClass.tableRow}>
                <td className="px-4 py-3 font-semibold text-foreground">{user.nickname}</td>
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
