// The Excel workbook inside every backup: the same data as the JSON files, as clear tables to
// read at a glance. Built in the admin's browser from the rows the backup just fetched.

import { metaDetails } from "@/lib/activity";
import {
  describeDevice,
  describePlace,
  type ClientMeta,
  type DeviceGeo,
  type GeoStatus,
} from "@/lib/client-info";
import { actionLabel, formatDate, formatDateTime, formatDuration } from "@/lib/format";
import { CATEGORY_LABELS } from "@/lib/labs";
import type { FieldDef } from "@/lib/types/schema";
import type { XCell, XSheet } from "@/lib/xlsx";

type Row = Record<string, unknown>;
export type BackupTables = Record<string, Row[]>;

const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const when = (v: unknown) => (v ? formatDateTime(v as string) : "");
const day = (v: unknown) => (v ? formatDate(v as string) : "");
const yes = (v: unknown) => (v ? "Yes" : "No");
const num = (v: unknown): XCell => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : str(v);
};

function sizeText(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function sheet(name: string, header: string[], rows: XCell[][], widths?: number[]): XSheet {
  return {
    name,
    rows: [{ cells: header, bold: true }, ...rows.map((cells) => ({ cells }))],
    widths: widths ?? header.map((h) => Math.min(40, Math.max(12, h.length + 4))),
    freezeRows: 1,
    filterRow: 1,
  };
}

/** A field's value as text: tables become "Column: value, … | next row". */
function fieldText(field: FieldDef | undefined, v: unknown): XCell {
  if (v === null || v === undefined || v === "") return null;
  if (field?.kind === "date") return day(v);
  if (field?.kind === "number" || field?.kind === "carat") return num(v);
  if (Array.isArray(v)) {
    if (v.every((x) => typeof x !== "object" || x === null)) return v.map(str).join(", ");
    const cols = field?.columns ?? [];
    return v
      .map((r) =>
        Object.entries((r ?? {}) as Row)
          .filter(([, x]) => x !== null && x !== undefined && x !== "")
          .map(([k, x]) => `${cols.find((c) => c.key === k)?.label ?? k}: ${str(x)}`)
          .join(", "),
      )
      .filter(Boolean)
      .join(" | ");
  }
  if (typeof v === "object") return JSON.stringify(v);
  return str(v);
}

export function backupWorkbook(
  t: BackupTables,
  info: { at: Date; by: string; version: string; withFiles: boolean },
): XSheet[] {
  const users = new Map((t.app_users ?? []).map((u) => [str(u.id), str(u.email)]));
  const labs = new Map((t.labs ?? []).map((l) => [str(l.id), l]));
  const types = new Map((t.certificate_types ?? []).map((ty) => [str(ty.id), ty]));
  const certs = t.certificates ?? [];
  const certById = new Map(certs.map((c) => [str(c.id), c]));
  const filesPer = new Map<string, number>();
  for (const f of t.certificate_files ?? []) {
    if (f.status !== "ready") continue;
    const k = str(f.certificate_id);
    filesPer.set(k, (filesPer.get(k) ?? 0) + 1);
  }

  const labOf = (ty: Row | undefined) => {
    if (!ty) return "";
    const lab = ty.lab_id ? labs.get(str(ty.lab_id)) : undefined;
    return lab ? str(lab.short_name || lab.name) : str(ty.lab);
  };
  const status = (c: Row) =>
    !c.deleted_at ? "Active" : c.replaced_by ? "Earlier version" : "In the Trash";
  const certName = (id: unknown) => {
    const c = certById.get(str(id));
    return c ? str(c.report_no || c.title) : "";
  };

  // Newest first, like the app
  const sorted = [...certs].sort((a, b) => str(b.created_at).localeCompare(str(a.created_at)));
  const active = sorted.filter((c) => !c.deleted_at).length;

  const sheets: XSheet[] = [];

  sheets.push({
    name: "About this backup",
    rows: [
      { cells: ["Orava Certificate Store backup"], bold: true },
      { cells: ["Made", formatDateTime(info.at)] },
      { cells: ["By", info.by] },
      { cells: ["App version", info.version] },
      { cells: ["Files included", info.withFiles ? "Yes (in the files folder)" : "No"] },
      { cells: [] },
      { cells: ["What", "How many"], bold: true },
      { cells: ["Certificates", active] },
      { cells: ["In the Trash or earlier versions", certs.length - active] },
      { cells: ["Files", [...filesPer.values()].reduce((a, b) => a + b, 0)] },
      { cells: ["Certificate types", types.size] },
      { cells: ["Labs", labs.size] },
      { cells: ["Staff", (t.app_users ?? []).filter((u) => u.role === "viewer").length] },
      { cells: ["Activity log entries", (t.audit_logs ?? []).length] },
      { cells: [] },
      { cells: ["Times are Sri Lanka time. Each sheet has filter buttons on its first row."] },
      {
        cells: ["The database folder has the same data as JSON, which is what a restore uses."],
      },
    ],
    widths: [34, 40],
  });

  sheets.push(
    sheet(
      "Certificates",
      [
        "Status",
        "Report number",
        "Report date",
        "Lab",
        "Type",
        "Kind of report",
        "Title",
        "Customer",
        "Stone",
        "Carats",
        "Expiry date",
        "Summary",
        "Key points",
        "Files",
        "Needs checking",
        "Added",
        "Added by",
        "Last changed",
        "Deleted",
        "Deleted by",
      ],
      sorted.map((c) => {
        const ty = types.get(str(c.type_id));
        const cat = str(ty?.category);
        return [
          status(c),
          str(c.report_no),
          day(c.report_date),
          labOf(ty),
          str(ty?.name),
          cat ? (CATEGORY_LABELS[cat as keyof typeof CATEGORY_LABELS] ?? cat) : "",
          str(c.title),
          str(c.customer),
          str(c.identification),
          num(c.weight_ct),
          day(c.expiry_date),
          str(c.summary),
          Array.isArray(c.key_points) ? c.key_points.map(str).join("; ") : "",
          filesPer.get(str(c.id)) ?? 0,
          yes(c.needs_review),
          when(c.created_at),
          users.get(str(c.created_by)) ?? "",
          when(c.updated_at),
          when(c.deleted_at),
          users.get(str(c.deleted_by)) ?? "",
        ];
      }),
      [14, 18, 14, 12, 30, 26, 36, 22, 22, 9, 14, 50, 40, 7, 10, 20, 26, 20, 20, 26],
    ),
  );

  // One sheet per type, with every field of that type as a column
  const typeList = [...types.values()].sort((a, b) => str(a.name).localeCompare(str(b.name)));
  for (const ty of typeList) {
    const rows = sorted.filter((c) => str(c.type_id) === str(ty.id));
    if (rows.length === 0) continue;
    const fields = (Array.isArray(ty.fields) ? ty.fields : []) as FieldDef[];
    const known = new Set(fields.map((f) => f.key));
    const extra = [...new Set(rows.flatMap((c) => Object.keys((c.data ?? {}) as Row)))].filter(
      (k) => !known.has(k),
    );
    const header = [
      "Status",
      "Report number",
      ...fields.map((f) => f.label),
      ...extra.map((k) => k.replaceAll("_", " ")),
      "Files",
      "Added",
    ];
    sheets.push(
      sheet(
        str(ty.name),
        header,
        rows.map((c) => {
          const data = (c.data ?? {}) as Row;
          return [
            status(c),
            str(c.report_no),
            ...fields.map((f) => fieldText(f, data[f.key])),
            ...extra.map((k) => fieldText(undefined, data[k])),
            filesPer.get(str(c.id)) ?? 0,
            when(c.created_at),
          ];
        }),
        header.map((h, i) => (i < 2 ? 16 : Math.min(40, Math.max(14, h.length + 4)))),
      ),
    );
  }

  sheets.push(
    sheet(
      "Files",
      [
        "Certificate",
        "File name",
        "File type",
        "Size",
        "Status",
        "Uploaded",
        "Uploaded by",
        "Stored as",
      ],
      (t.certificate_files ?? []).map((f) => [
        certName(f.certificate_id),
        str(f.original_name),
        str(f.kind).toUpperCase(),
        sizeText(Number(f.size_bytes ?? 0)),
        f.status === "ready" ? "Saved" : "Not finished",
        when(f.created_at),
        users.get(str(f.created_by)) ?? "",
        info.withFiles ? `files/${str(f.storage_path)}` : str(f.storage_path),
      ]),
      [20, 36, 10, 10, 12, 20, 26, 50],
    ),
  );

  sheets.push(
    sheet(
      "Staff",
      [
        "Email",
        "Name",
        "Role",
        "Status",
        "Can download",
        "Can make reports",
        "Uploader",
        "Last sign-in",
        "Added",
      ],
      (t.app_users ?? []).map((u) => [
        str(u.email),
        str(u.name),
        u.role === "admin" ? "Admin" : "Staff",
        u.status === "active" ? "Active" : "Disabled",
        yes(u.role === "admin" || u.can_download),
        yes(u.role === "admin" || u.can_report),
        yes(u.role === "admin" || u.can_upload),
        when(u.last_login_at) || "Never",
        when(u.created_at),
      ]),
      [32, 20, 8, 10, 12, 14, 10, 20, 20],
    ),
  );

  sheets.push(
    sheet(
      "Labs",
      ["Short name", "Full name", "Website", "Archived", "Added"],
      (t.labs ?? []).map((l) => [
        str(l.short_name),
        str(l.name),
        str(l.website),
        yes(l.archived),
        when(l.created_at),
      ]),
      [14, 44, 30, 10, 20],
    ),
  );

  sheets.push(
    sheet(
      "Types",
      ["Name", "Lab", "Kind of report", "Fields", "Certificates", "Archived", "Version", "Changed"],
      typeList.map((ty) => {
        const cat = str(ty.category);
        return [
          str(ty.name),
          labOf(ty),
          cat ? (CATEGORY_LABELS[cat as keyof typeof CATEGORY_LABELS] ?? cat) : "",
          Array.isArray(ty.fields) ? ty.fields.length : 0,
          certs.filter((c) => !c.deleted_at && str(c.type_id) === str(ty.id)).length,
          yes(ty.archived),
          num(ty.version),
          when(ty.updated_at),
        ];
      }),
      [40, 12, 28, 8, 12, 10, 9, 20],
    ),
  );

  const sessions = new Map((t.sessions ?? []).map((s) => [str(s.id), s]));
  const placeOf = (ip: string | null, meta: ClientMeta | null, sessionId: unknown) => {
    const s = sessionId ? sessions.get(str(sessionId)) : undefined;
    const place = describePlace(
      ip,
      meta,
      (s?.geo ?? null) as DeviceGeo | null,
      (s?.geo_status ?? null) as GeoStatus,
    );
    const text =
      place.kind === "exact"
        ? `${place.text} (exact, ${place.accuracy?.toLowerCase()})`
        : place.kind === "approximate"
          ? `${place.text} (approximate)`
          : place.text;
    return { place, text };
  };

  // Sign-in sessions: from sign-in to sign-out (or the last thing done), with what was done
  const bySession = new Map<string, Row[]>();
  for (const a of t.audit_logs ?? []) {
    if (!a.session_id) continue;
    const list = bySession.get(str(a.session_id)) ?? [];
    list.push(a);
    bySession.set(str(a.session_id), list);
  }
  const sessionRows = [...(t.sessions ?? [])].sort((a, b) =>
    str(b.created_at).localeCompare(str(a.created_at)),
  );
  sheets.push(
    sheet(
      "Sign-in sessions",
      [
        "Person",
        "Signed in",
        "Ended",
        "How it ended",
        "Time signed in",
        "Location",
        "Map",
        "Browser",
        "System",
        "Device",
        "Actions",
        "What was done",
      ],
      sessionRows.map((s) => {
        const acts = (bySession.get(str(s.id)) ?? []).sort((a, b) =>
          str(a.at).localeCompare(str(b.at)),
        );
        const start = new Date(str(s.created_at)).getTime();
        const lastAct = acts.length ? new Date(str(acts.at(-1)!.at)).getTime() : 0;
        const last = Math.max(start, new Date(str(s.last_seen_at)).getTime() || 0, lastAct);
        const revoked = s.revoked_at ? new Date(str(s.revoked_at)).getTime() : null;
        const signedOut = acts.some((a) => a.action === "sign_out");
        const live = !revoked && new Date(str(s.expires_at)).getTime() > info.at.getTime();
        const end = revoked ?? (live ? info.at.getTime() : last);
        const how = revoked
          ? signedOut
            ? "Signed out"
            : "Ended by the admin"
          : live
            ? "Still signed in when the backup was made"
            : "Ran out (time shown up to the last action)";
        const meta = (s.client ?? null) as ClientMeta | null;
        const d = s.user_agent ? describeDevice(str(s.user_agent), meta) : null;
        const { place, text } = placeOf(s.ip ? str(s.ip) : null, meta, s.id);
        return [
          users.get(str(s.user_id)) ?? "",
          when(s.created_at),
          formatDateTime(new Date(end)),
          how,
          formatDuration(Math.max(0, (end - start) / 1000)),
          text,
          place.mapUrl ?? "",
          d?.browser ?? "",
          d?.system ?? "",
          d?.device ?? "",
          acts.length,
          acts
            .map(
              (a) =>
                `${formatDateTime(str(a.at)).split(", ")[1] ?? ""} ${actionLabel(str(a.action))}${a.target ? ` (${str(a.target)})` : ""}`,
            )
            .join("; "),
        ];
      }),
      [30, 20, 20, 24, 14, 36, 20, 16, 16, 12, 9, 80],
    ),
  );

  const activity = [...(t.audit_logs ?? [])].sort((a, b) => str(b.at).localeCompare(str(a.at)));
  sheets.push(
    sheet(
      "Activity log",
      [
        "Time",
        "Person",
        "What",
        "About",
        "Browser",
        "System",
        "Device",
        "Location",
        "Map",
        "IP address",
        "Details",
      ],
      activity.map((a) => {
        const meta = (a.client ?? null) as ClientMeta | null;
        const d = a.user_agent ? describeDevice(str(a.user_agent), meta) : null;
        const ip = a.ip ? str(a.ip) : null;
        const { place, text } = placeOf(ip, meta, a.session_id);
        return [
          when(a.at),
          str(a.actor_email) || "System (automatic)",
          actionLabel(str(a.action)),
          str(a.target),
          d?.browser ?? "",
          d?.system ?? "",
          d?.device ?? "",
          ip || place.known ? text : "",
          place.mapUrl ?? "",
          ip ?? "",
          metaDetails(a.meta as Row)
            .map((m) => `${m.label}: ${m.value}`)
            .join("; "),
        ];
      }),
      [20, 30, 30, 30, 16, 16, 12, 26, 20, 16, 50],
    ),
  );

  const events = [...(t.security_events ?? [])].sort((a, b) => str(b.at).localeCompare(str(a.at)));
  sheets.push(
    sheet(
      "Security events",
      ["Time", "Level", "What", "Email", "IP address", "Country", "Page"],
      events.map((e) => [
        when(e.at),
        str(e.severity),
        str(e.kind).replaceAll("_", " "),
        str(e.email),
        str(e.ip),
        str(e.country),
        str(e.path),
      ]),
      [20, 10, 28, 30, 16, 10, 30],
    ),
  );

  return sheets;
}
