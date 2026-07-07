import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { userProfilePath } from "@/lib/public-user";

export const dynamic = "force-dynamic";

/** Алиас для старых ссылок: /profile → /user/{shikimoriId} */
export default async function ProfilePage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  redirect(userProfilePath(session.user.shikimoriId));
}
