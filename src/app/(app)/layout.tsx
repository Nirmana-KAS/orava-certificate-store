import { LiveUpdates } from "@/components/layout/live-updates";
import { LocationCheck } from "@/components/layout/location-check";

// Staff and upload pages: each checks who may see it itself. This only keeps them up to date.
export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <LiveUpdates />
      <LocationCheck />
    </>
  );
}
