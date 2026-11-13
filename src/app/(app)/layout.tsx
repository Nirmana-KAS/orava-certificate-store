import { LiveUpdates } from "@/components/layout/live-updates";
import { LocationCheck } from "@/components/layout/location-check";
import { StaffSwitchBanner } from "@/components/layout/switch-banner";

// Staff and upload pages: each checks who may see it itself. This only keeps them up to date.
export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <StaffSwitchBanner />
      {children}
      <LiveUpdates />
      <LocationCheck />
    </>
  );
}
