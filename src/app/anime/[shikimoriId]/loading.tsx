import { BrandLoading } from "@/components/ui/BrandLoading";

export default function AnimePageLoading() {
  return (
    <div className="relative min-h-[calc(100dvh-3.5rem)] sm:min-h-[calc(100dvh-4rem)]" aria-busy="true">
      <div className="absolute inset-0 bg-background/80" />
      <div className="relative z-10 flex min-h-[calc(100dvh-3.5rem)] items-center justify-center px-4 sm:min-h-[calc(100dvh-4rem)]">
        <BrandLoading />
      </div>
    </div>
  );
}
