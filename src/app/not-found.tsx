import type { Metadata } from "next";
import Link from "next/link";
import { buildSitePageMetadata } from "@/lib/site-metadata";

export const metadata: Metadata = buildSitePageMetadata({
  title: "Страница не найдена",
  description: "Такой страницы в Track Anime нет или она была перемещена.",
  canonicalPath: "/404",
});

export default function NotFound() {
  return (
    <section className="not-found-scene" aria-labelledby="not-found-title">
      <video
        className="not-found-bg-video"
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        aria-hidden="true"
      >
        <source src="/404.webm" type="video/webm" />
      </video>

      <div className="not-found-vignette" aria-hidden="true" />

      <div className="not-found-stage">
        <span className="not-found-code not-found-code-left" aria-hidden="true">
          404
        </span>

        <video
          className="not-found-center-video"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          aria-hidden="true"
        >
          <source src="/404.webm" type="video/webm" />
        </video>

        <span className="not-found-code not-found-code-right" aria-hidden="true">
          404
        </span>
      </div>

      <div className="not-found-content">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">Track Anime</p>
        <h1 id="not-found-title" className="mt-3 text-3xl font-bold text-white sm:text-5xl">
          Страница не найдена
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-6 text-white/78 sm:text-base">
          Похоже, ссылка устарела или адрес был набран с ошибкой. Можно вернуться на главную и найти
          нужное аниме через поиск.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link className="site-btn site-btn-primary sm:w-auto" href="/">
            На главную
          </Link>
          <Link className="site-btn site-btn-secondary sm:w-auto" href="/search">
            Открыть поиск
          </Link>
        </div>
      </div>
    </section>
  );
}
