import Link from "next/link";
import { SITE_NAME } from "@/lib/site-brand";

export const metadata = {
  title: "Нет сети",
};

export default function OfflinePage() {
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-lg flex-col items-center justify-center px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold text-foreground">Нет подключения к интернету</h1>
      <p className="mt-3 text-sm text-muted">
        {SITE_NAME} работает как приложение, но для просмотра аниме и обновления списков нужен интернет.
      </p>
      <Link
        href="/"
        className="mt-8 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition hover:border-accent/40"
      >
        На главную
      </Link>
    </div>
  );
}
