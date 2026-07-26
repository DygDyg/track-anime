"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { QrLoginApprovalDialog } from "@/components/auth/QrLoginApprovalDialog";

function QrApprovalPageInner() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code") ?? "";
  return <QrLoginApprovalDialog code={code} modal={false} />;
}

export default function QrApprovalPage() {
  return (
    <Suspense fallback={<main className="mx-auto flex min-h-screen max-w-md items-center px-4 text-center text-muted">Загрузка…</main>}>
      <QrApprovalPageInner />
    </Suspense>
  );
}
