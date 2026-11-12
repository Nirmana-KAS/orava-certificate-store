"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Alert } from "@/components/ui/alert";

/** On every admin page (except the System Map itself) while a part of the system is down. */
export function ProblemBanner({ parts }: { parts: string[] }) {
  const pathname = usePathname();
  if (parts.length === 0 || pathname.startsWith("/admin/system")) return null;
  return (
    <Alert variant="error" className="mb-6" data-testid="problem-banner">
      Not working: {parts.join(", ")}. <Link href="/admin/system">Open the System Map</Link>
    </Alert>
  );
}
