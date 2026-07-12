import { BrandLoading } from "@/components/ui/BrandLoading";

export default function HistoryLoading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4" aria-busy="true" aria-label="Загрузка истории">
      <BrandLoading />
    </div>
  );
}
