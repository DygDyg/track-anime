import { adminClass } from "@/components/admin/admin-styles";

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className={adminClass.panel}>
      <p className={adminClass.statLabel}>{label}</p>
      <p className={adminClass.statValue}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
