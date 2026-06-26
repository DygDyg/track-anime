import { AdminUsersTable } from "@/components/admin/AdminUsersTable";
import { adminClass } from "@/components/admin/admin-styles";
import { getAdminUsers } from "@/lib/admin/stats";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const users = await getAdminUsers(100);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Первые 100 пользователей. Админов можно назначать вручную или через{" "}
        <code className={adminClass.code}>ADMIN_SHIKIMORI_IDS</code> в .env.
      </p>
      <AdminUsersTable initialUsers={users} />
    </div>
  );
}
