import "server-only";

import { isProduction } from "./env";

// __Host- cookies must be Secure, host-only and path=/, which blocks subdomain tampering.
const prefix = isProduction ? "__Host-" : "";

export const COOKIES = {
  session: `${prefix}orava_session`,
  challenge: `${prefix}orava_challenge`,
  device: `${prefix}orava_device`,
} as const;

export function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
