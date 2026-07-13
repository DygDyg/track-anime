"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { adminClass } from "@/components/admin/admin-styles";

const sections = [
  {
    title: "Главное",
    items: [
      { href: "/admin", label: "Обзор", exact: true },
      { href: "/admin/todo", label: "To-do" },
    ],
  },
  {
    title: "Контент",
    items: [
      { href: "/admin/import", label: "Импорт" },
      { href: "/admin/covers", label: "Обложки" },
      { href: "/admin/data", label: "Данные" },
    ],
  },
  {
    title: "Интеграции",
    items: [
      { href: "/admin/shikimori", label: "Shikimori" },
      { href: "/admin/discord", label: "Discord" },
      { href: "/admin/notifications", label: "Уведомления" },
    ],
  },
  {
    title: "Настройки",
    items: [
      { href: "/admin/brand", label: "Бренд" },
      { href: "/admin/search", label: "Поиск" },
      { href: "/admin/site-settings", label: "Настройки сайта" },
      { href: "/admin/watch-party", label: "Совместный просмотр" },
      { href: "/admin/intro-offsets", label: "Интро озвучек" },
      { href: "/admin/watch-history", label: "История" },
    ],
  },
  {
    title: "Система",
    items: [
      { href: "/admin/db", label: "База" },
      { href: "/admin/users", label: "Пользователи" },
    ],
  },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-4" aria-label="Разделы админ-панели">
      {sections.map((section) => (
        <div key={section.title} className="admin-nav-section">
          <p className="admin-nav-section-title">{section.title}</p>
          <div className="flex flex-col gap-2">
            {section.items.map((item) => {
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
          </div>
        </div>
      ))}
    </nav>
  );
}
