import { describe, expect, it } from "vitest";

import { formatUploadPasskey, normalizeUploadPasskey } from "@/lib/upload-passkey";

describe("upload passkeys", () => {
  it("are four groups of four easy-to-read characters", () => {
    let n = 0;
    const key = formatUploadPasskey((max) => n++ % max);
    expect(key).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);
    expect(key).not.toMatch(/[01OIL]/);
  });

  it("can be typed in any case, with or without dashes and spaces", () => {
    expect(normalizeUploadPasskey(" k7qm-3xpa w9rt-hc2d ")).toBe("K7QM3XPAW9RTHC2D");
    expect(normalizeUploadPasskey("K7QM3XPAW9RTHC2D")).toBe("K7QM3XPAW9RTHC2D");
  });
});
