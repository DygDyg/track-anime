import { SiteChangelogPanel } from "@/components/admin/SiteChangelogPanel";
import { listSiteChangelogEntries } from "@/lib/site-changelog";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Changelog",
};

export default async function AdminChangelogPage() {
  const entries = await listSiteChangelogEntries();
  return <SiteChangelogPanel initialEntries={entries} />;
}
