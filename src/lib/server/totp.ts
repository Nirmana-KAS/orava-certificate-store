import "server-only";

import { generateSecret, generateURI, verify } from "otplib";
import QRCode from "qrcode";

import { site } from "@/lib/site";

export function newTotpSecret(): string {
  return generateSecret();
}

export async function totpQr(
  secret: string,
  email: string,
): Promise<{ uri: string; dataUrl: string }> {
  const uri = generateURI({ issuer: site.name, label: email, secret });
  const dataUrl = await QRCode.toDataURL(uri, { margin: 1, width: 240 });
  return { uri, dataUrl };
}

/** Accepts the current code and one step either side (clock drift). */
export async function checkTotp(secret: string, token: string): Promise<boolean> {
  if (!/^\d{6}$/.test(token)) return false;
  try {
    const result = await verify({ secret, token, epochTolerance: 30 });
    return result.valid;
  } catch {
    return false;
  }
}
