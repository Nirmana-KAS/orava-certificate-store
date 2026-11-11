"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { audit } from "@/lib/server/audit";
import { db } from "@/lib/server/db";
import { clientInfo } from "@/lib/server/request";
import { requireAdmin } from "@/lib/server/session";
import { eraseCertificates } from "@/lib/server/trash";

const uuid = z.uuid();

function done(params: Record<string, string>): never {
  revalidatePath("/admin/trash");
  revalidatePath("/admin/certificates");
  redirect(`/admin/trash?${new URLSearchParams(params).toString()}`);
}

/** Puts a deleted certificate back in the lists, unless its report number is taken again. */
export async function restoreFromTrashAction(certId: string): Promise<void> {
  const session = await requireAdmin();
  if (!uuid.safeParse(certId).success) return;
  const client = await clientInfo();
  let title: string | null = null;
  try {
    const [row] = await db()<{ title: string }[]>`
      update certificates set deleted_at = null, deleted_by = null, updated_at = now()
      where id = ${certId} and deleted_at is not null and replaced_by is null
      returning title
    `;
    title = row?.title ?? null;
  } catch (error) {
    // The unique report number index: a live certificate has the same number now
    if ((error as { code?: string } | null)?.code === "23505") done({ error: "clash" });
    throw error;
  }
  if (!title) done({ error: "gone" });
  await audit({ id: session.user.id, email: session.user.email }, "trash.restore", client, title);
  done({ restored: title });
}

/** Erases one deleted certificate, its files and its earlier versions. Cannot be undone. */
export async function eraseFromTrashAction(certId: string): Promise<void> {
  const session = await requireAdmin();
  if (!uuid.safeParse(certId).success) return;
  const client = await clientInfo();
  let titles: string[];
  try {
    titles = await eraseCertificates([certId]);
  } catch (error) {
    console.error("erase failed", error);
    done({ error: "storage" });
  }
  if (titles.length === 0) done({ error: "gone" });
  await audit({ id: session.user.id, email: session.user.email }, "trash.erase", client, titles[0]);
  done({ erased: "1" });
}

/** Erases everything in the Trash now. Cannot be undone. */
export async function emptyTrashAction(): Promise<void> {
  const session = await requireAdmin();
  const client = await clientInfo();
  const rows = await db()<{ id: string }[]>`
    select id from certificates where deleted_at is not null and replaced_by is null
  `;
  let titles: string[] = [];
  try {
    for (let i = 0; i < rows.length; i += 50) {
      titles = titles.concat(await eraseCertificates(rows.slice(i, i + 50).map((r) => r.id)));
    }
  } catch (error) {
    console.error("empty trash failed", error);
    if (titles.length > 0) {
      await audit(
        { id: session.user.id, email: session.user.email },
        "trash.empty",
        client,
        `${titles.length} certificates`,
        { titles: titles.slice(0, 50), complete: false },
      );
    }
    done({ error: "storage" });
  }
  await audit(
    { id: session.user.id, email: session.user.email },
    "trash.empty",
    client,
    `${titles.length} certificate${titles.length === 1 ? "" : "s"}`,
    { titles: titles.slice(0, 50) },
  );
  done({ erased: String(titles.length) });
}
