import { AdminNav } from "@/components/admin/admin-nav";
import { ProblemBanner } from "@/components/admin/problem-banner";
import { LiveUpdates } from "@/components/layout/live-updates";
import { LocationCheck } from "@/components/layout/location-check";
import { openIncidents } from "@/lib/server/health";
import { requireAdmin } from "@/lib/server/session";
import { COMPONENT_BY_ID } from "@/lib/system/map";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const incidents = await openIncidents().catch(() => []);
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 gap-8 px-4 pt-6 pb-10 sm:px-6 lg:px-8">
      <AdminNav />
      <div className="min-w-0 flex-1">
        <ProblemBanner
          parts={incidents.map((i) => COMPONENT_BY_ID[i.component]?.name ?? i.component)}
        />
        {children}
      </div>
      <LiveUpdates signInPath="/admin/login" />
      <LocationCheck />
    </div>
  );
}
