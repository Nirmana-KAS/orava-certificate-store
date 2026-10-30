import { hash, verify } from "@node-rs/argon2";

// Argon2id with OWASP-recommended cost (19 MiB, 2 passes). Fast enough for serverless.
const options = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

export function hashSecret(value: string): Promise<string> {
  return hash(value, options);
}

export async function verifySecret(
  hashed: string | null | undefined,
  value: string,
): Promise<boolean> {
  if (!hashed) return false;
  try {
    return await verify(hashed, value);
  } catch {
    return false;
  }
}
