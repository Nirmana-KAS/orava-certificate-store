import { join } from "node:path";

import { E2E } from "./fixtures";

type Page = { name: string; path: string; as?: "staff" | "admin" };

/** Every page covered by the responsive checks. Add each new page here. */
export const pages: Page[] = [
  { name: "sign-in", path: "/" },
  { name: "admin-sign-in", path: "/admin/login" },
  { name: "not-found", path: "/this-page-does-not-exist" },
  { name: "certificates", path: "/certificates", as: "staff" },
  { name: "admin-overview", path: "/admin", as: "admin" },
  { name: "admin-certificates", path: "/admin/certificates", as: "admin" },
  { name: "admin-add-certificate", path: "/admin/certificates/new", as: "admin" },
  { name: "admin-import", path: "/admin/certificates/import", as: "admin" },
  { name: "admin-types", path: "/admin/types", as: "admin" },
  { name: "admin-new-type", path: "/admin/types/new", as: "admin" },
  { name: "admin-staff", path: "/admin/users", as: "admin" },
  { name: "admin-settings", path: "/admin/settings", as: "admin" },
];

export function storageFor(as: Page["as"]): string | undefined {
  return as ? join(E2E.authDir, `${as}.json`) : undefined;
}
