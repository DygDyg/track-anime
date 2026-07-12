import Link from "next/link";
import type { Metadata } from "next";
import { AdminNav } from "@/components/admin/AdminNav";
import { adminClass } from "@/components/admin/admin-styles";
import { requireAdmin } from "@/lib/auth/admin";
import "./admin.css";

export const metadata: Metadata = {
  title: {
    default: "Админка",
    template: "Админка: %s",
  },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();

  return (
    <div className="admin-root mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">Track Anime</p>
          <h1 className="text-2xl font-semibold text-foreground">Админ-панель</h1>
        </div>
        <Link href="/" className={adminClass.link}>
          На сайт
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <aside className={`${adminClass.sidebar} lg:sticky lg:top-20 lg:self-start`}>
          <AdminNav />
        </aside>
        <div>{children}</div>
      </div>
    </div>
  );
}
