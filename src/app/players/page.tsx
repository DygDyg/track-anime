import { redirect } from "next/navigation";

type Props = {
  searchParams: Promise<{ q?: string }>;
};

export default async function PlayersRedirectPage({ searchParams }: Props) {
  const { q } = await searchParams;
  const params = new URLSearchParams();
  if (q?.trim()) params.set("q", q.trim());
  const query = params.toString();
  redirect(query ? `/user?${query}` : "/user");
}
