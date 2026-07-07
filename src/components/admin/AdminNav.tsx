"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { adminClass } from "@/components/admin/admin-styles";

const items = [
  { href: "/admin", label: "Обзор", exact: true },
  { href: "/admin/todo", label: "To-do" },
  { href: "/admin/import", label: "Импорт" },
  { href: "/admin/covers", label: "Обложки" },
  { href: "/admin/shikimori", label: "Shikimori" },
  { href: "/admin/discord", label: "Discord" },
  { href: "/admin/notifications", label: "Уведомления" },
  { href: "/admin/site-settings", label: "Настройки сайта" },
  { href: "/admin/intro-offsets", label: "Интро озвучек" },
  { href: "/admin/watch-history", label: "История" },
  { href: "/admin/data", label: "Данные" },
  { href: "/admin/db", label: "База" },
  { href: "/admin/users", label: "Пользователи" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-2">
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={active ? adminClass.navLinkActive : adminClass.navLink}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
