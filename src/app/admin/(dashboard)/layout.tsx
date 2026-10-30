import { AdminNav } from "@/components/admin/admin-nav";
import { requireAdmin } from "@/lib/server/session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 gap-8 px-4 pt-6 pb-10 sm:px-6 lg:px-8">
      <AdminNav />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
