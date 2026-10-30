import pkg from "../../package.json";

export const site = {
  name: "Orava Certificate Store",
  shortName: "Orava Certs",
  description:
    "Secure certificate store for permitted orava (Pvt) Ltd. staff: search, review and download certificates.",
  company: "orava (Pvt) Ltd.",
  developer: "Shehan Nirmana",
  year: 2026,
  version: pkg.version,
} as const;

/** Short commit id of the deployed build (set by Vercel), if any. */
export function buildId(sha = process.env.NEXT_PUBLIC_COMMIT_SHA): string | null {
  return sha ? sha.slice(0, 7) : null;
}

/** "© 2026 orava (Pvt) Ltd." */
export function copyright(): string {
  return `© ${site.year} ${site.company}`;
}
