import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { userFavoritesPath } from "@/lib/public-user";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ tab?: string; sort?: string }>;
};

/** Legacy alias — канон списков: `/user/{shikimoriId}/favorites`. */
export default async function FavoritesPage({ searchParams }: Props) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const { tab, sort } = await searchParams;
  const base = userFavoritesPath(session.user.shikimoriId);
  const params = new URLSearchParams();
  if (tab) params.set("tab", tab);
  if (sort) params.set("sort", sort);
  const query = params.toString();
  redirect(query ? `${base}?${query}` : base);
}
