"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { COMPONENT_BY_ID, type ComponentId } from "@/lib/system/map";
import { audit } from "@/lib/server/audit";
import { siteOrigin } from "@/lib/server/cron-auth";
import { OUTCOME_LABEL, diagnose, triggerRedeploy, type Outcome } from "@/lib/server/diagnose";
import { checkAndRecord, latestRun } from "@/lib/server/health";
import { clientInfo } from "@/lib/server/request";
import { requireAdmin } from "@/lib/server/session";

/** How old the last check may be before an open System Map runs a new one. */
const FRESH_MS = 60_000;

/**
 * Called by the open System Map every 30 seconds: runs the checks when the last ones are more
 * than a minute old. Returns the id of the newest run, so the page reloads only when it changed.
 */
export async function refreshChecksAction(force = false): Promise<{ runId: string | null }> {
  const session = await requireAdmin();
  const last = await latestRun();
  if (!force && last && Date.now() - new Date(last.at).getTime() < FRESH_MS) {
    return { runId: last.id };
  }
  const h = await headers();
  const run = await checkAndRecord(force ? "manual" : "page", siteOrigin(h));
  if (force) {
    await audit(
      { id: session.user.id, email: session.user.email },
      "system.check",
      await clientInfo(),
      run.overall === "ok"
        ? "Everything works"
        : run.overall === "warn"
          ? "Needs attention"
          : "Something is not working",
    );
  }
  // The open page compares the id and reloads itself; a button press reloads straight away
  if (force) revalidatePath("/admin", "layout");
  return { runId: run.id };
}

const target = z.union([
  z.literal("all"),
  z.string().refine((s): s is ComponentId => s in COMPONENT_BY_ID),
]);

export async function diagnoseAction(
  input: string,
): Promise<{ ok: true; id: string; outcome: Outcome } | { ok: false; error: string }> {
  const session = await requireAdmin();
  const parsed = target.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Unknown part" };
  const id = parsed.data as ComponentId | "all";
  const h = await headers();
  try {
    const r = await diagnose(id, { email: session.user.email }, siteOrigin(h));
    await audit(
      { id: session.user.id, email: session.user.email },
      "system.diagnose",
      await clientInfo(),
      `${id === "all" ? "Every part" : COMPONENT_BY_ID[id].name}: ${OUTCOME_LABEL[r.outcome]}`,
      { report: r.id },
    );
    revalidatePath("/admin", "layout");
    return { ok: true, id: r.id, outcome: r.outcome };
  } catch (e) {
    console.error("diagnose failed", e);
    return { ok: false, error: "Diagnose & Fix couldn't finish. Try again in a minute." };
  }
}

export async function redeployAction(): Promise<{ ok: boolean; detail: string }> {
  const session = await requireAdmin();
  const r = await triggerRedeploy();
  await audit(
    { id: session.user.id, email: session.user.email },
    "system.redeploy",
    await clientInfo(),
    r.ok ? "Started" : r.detail,
  );
  return r;
}
