"use client";

import { CalendarClock, CircleCheck, Pause, Play, Save, Trash2, Wand2 } from "lucide-react";
import * as React from "react";

import { SwitchNotice } from "@/components/layout/switch-notice";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  addScheduleAction,
  applyPresetAction,
  deletePresetAction,
  deleteScheduleAction,
  savePresetAction,
  setAccessAction,
  setScheduleEnabledAction,
} from "@/lib/admin/control-actions";
import { formatDateTime } from "@/lib/format";
import {
  BUILT_IN_PRESETS,
  DEFAULT_MESSAGE,
  GROUP_LABEL,
  SECTIONS,
  SECTION_BY_ID,
  SECTION_IDS,
  STATE_LABEL,
  accessBlock,
  blockFor,
  describeSchedule,
  needsConfirm,
  scheduleActive,
  type AccessRow,
  type Capability,
  type EffectiveMap,
  type PresetStates,
  type ScheduleKind,
  type ScheduleRow,
  type SectionId,
  type SwitchState,
} from "@/lib/system/switches";

import {
  BackOnField,
  ConfirmFields,
  ReasonField,
  StateButtons,
  StatePill,
  backOnIso,
  useRunAction,
} from "./control-shared";

// ── Presets ───────────────────────────────────────────────────────────────────────

export type SavedPreset = { id: string; name: string; states: PresetStates };

const describeStates = (states: PresetStates) =>
  Object.entries(states)
    .map(([id, st]) => `${SECTION_BY_ID[id as SectionId]?.name ?? id}: ${STATE_LABEL[st]}`)
    .join(", ") || "Everything on";

export function Presets({ saved }: { saved: SavedPreset[] }) {
  const all = [
    ...BUILT_IN_PRESETS.map((p) => ({
      id: p.key,
      name: p.name,
      about: p.about,
      states: p.states,
      own: false,
    })),
    ...saved.map((p) => ({
      id: p.id,
      name: p.name,
      about: describeStates(p.states),
      states: p.states,
      own: true,
    })),
  ];
  const [chosen, setChosen] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState("");
  const [passkey, setPasskey] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [name, setName] = React.useState("");
  const { run, pending } = useRunAction();
  const preset = all.find((p) => p.id === chosen);
  const big =
    !!preset &&
    needsConfirm(
      SECTION_IDS.map((id) => ({ section: id, state: (preset.states[id] ?? "on") as SwitchState })),
    );

  return (
    <div className="grid gap-4">
      <ul className="grid gap-2">
        {all.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
            <div className="min-w-0 flex-1 basis-48">
              <p className="font-medium">{p.name}</p>
              <p className="text-sm text-muted-foreground">{p.about}</p>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={chosen === p.id ? "secondary" : "outline"}
                aria-pressed={chosen === p.id}
                onClick={() => {
                  setChosen(chosen === p.id ? null : p.id);
                  setError(null);
                }}
                data-testid={`preset-${p.name.toLowerCase().replace(/\W+/g, "-")}`}
              >
                <Wand2 /> Use
              </Button>
              {p.own ? (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={`Delete preset ${p.name}`}
                  disabled={pending}
                  onClick={() => {
                    if (window.confirm(`Delete the preset "${p.name}"?`)) {
                      run(() => deletePresetAction(p.id));
                    }
                  }}
                >
                  <Trash2 />
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      {preset ? (
        <form
          className="grid gap-4 rounded-lg border bg-muted/30 p-3 sm:p-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            run(
              () =>
                applyPresetAction({
                  preset: preset.id,
                  reason,
                  passkey: big ? passkey : undefined,
                  confirm: big ? confirm : undefined,
                }),
              (r) => {
                if (r.ok) {
                  setChosen(null);
                  setReason("");
                  setPasskey("");
                  setConfirm("");
                } else setError(r.error);
              },
            );
          }}
        >
          <p className="text-sm">
            <span className="font-medium">{preset.name}</span> sets {describeStates(preset.states)}{" "}
            and switches every other part on.
          </p>
          <ReasonField id="preset-reason" value={reason} onChange={setReason} />
          {big ? (
            <ConfirmFields
              id="preset"
              passkey={passkey}
              confirm={confirm}
              onPasskey={setPasskey}
              onConfirm={setConfirm}
            />
          ) : null}
          <div aria-live="polite">{error ? <Alert variant="error">{error}</Alert> : null}</div>
          <Button
            type="submit"
            className="w-full sm:w-auto sm:justify-self-start"
            disabled={
              pending ||
              reason.trim().length < 3 ||
              (big && (!passkey || confirm.trim() !== "CONFIRM"))
            }
          >
            Apply {preset.name}
          </Button>
        </form>
      ) : null}

      <form
        className="grid gap-2 sm:flex sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          run(
            () => savePresetAction({ name }),
            (r) => r.ok && setName(""),
          );
        }}
      >
        <div className="grid flex-1 gap-2">
          <Label htmlFor="preset-name">Save the current switches as a preset</Label>
          <Input
            id="preset-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder="e.g. Month-end check"
          />
        </div>
        <Button type="submit" variant="outline" disabled={pending || name.trim().length < 2}>
          <Save /> Save
        </Button>
      </form>
    </div>
  );
}

// ── People, groups and types ──────────────────────────────────────────────────────

export type Person = { id: string; email: string; canUpload: boolean };
export type TypeOption = { id: string; name: string };
export type AccessItem = AccessRow & { name: string; reason: string | null; by: string | null };

export function AccessSwitches({
  rows,
  people,
  types,
}: {
  rows: AccessItem[];
  people: Person[];
  types: TypeOption[];
}) {
  const [scope, setScope] = React.useState<"user" | "group" | "type">("group");
  const [target, setTarget] = React.useState("");
  const [state, setState] = React.useState<SwitchState>("hold");
  const [message, setMessage] = React.useState("");
  const [backOn, setBackOn] = React.useState("");
  const [at, setAt] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [passkey, setPasskey] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const { run, pending } = useRunAction();
  const big = state === "down";
  const options =
    scope === "user"
      ? people.map((p) => ({ id: p.id, name: p.email }))
      : scope === "group"
        ? Object.entries(GROUP_LABEL).map(([id, name]) => ({ id, name }))
        : types;

  return (
    <div className="grid gap-5">
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nobody and no type is switched off.</p>
      ) : (
        <ul className="grid gap-2" data-testid="access-list">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
              <div className="min-w-0 flex-1 basis-48">
                <p className="flex flex-wrap items-center gap-x-2 font-medium">
                  <span className="wrap-anywhere">
                    {r.scope === "user" ? "Person" : r.scope === "group" ? "Group" : "Type"}:{" "}
                    {r.name}
                  </span>
                  <StatePill view={r.state} />
                </p>
                <p className="text-xs text-muted-foreground">
                  {r.until ? `Back on ${formatDateTime(r.until)}. ` : ""}
                  {r.reason ? `Reason: ${r.reason}` : ""}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() =>
                  run(() =>
                    setAccessAction({
                      scope: r.scope,
                      target: r.target,
                      state: "on",
                      reason: "Switched back on",
                    }),
                  )
                }
              >
                <CircleCheck /> Switch on
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form
        className="grid gap-4 rounded-lg border p-3 sm:p-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          run(
            () =>
              setAccessAction({
                scope,
                target,
                state,
                message: message.trim() || null,
                until: backOnIso(backOn, at),
                reason,
                passkey: big ? passkey : undefined,
                confirm: big ? confirm : undefined,
              }),
            (r) => {
              if (r.ok) {
                setTarget("");
                setReason("");
                setMessage("");
                setPasskey("");
                setConfirm("");
              } else setError(r.error);
            },
          );
        }}
      >
        <p className="font-medium">Switch off for some people or one type</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="access-scope">Who or what</Label>
            <Select
              id="access-scope"
              value={scope}
              onChange={(e) => {
                setScope(e.target.value as typeof scope);
                setTarget("");
              }}
            >
              <option value="group">A group of staff</option>
              <option value="user">One person</option>
              <option value="type">One certificate type</option>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="access-target">
              {scope === "user" ? "Person" : scope === "group" ? "Group" : "Type"}
            </Label>
            <Select id="access-target" value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">Pick one…</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="grid gap-2">
          <span className="text-sm font-medium">Switch to</span>
          <StateButtons
            name="access"
            states={["readonly", "hold", "down"]}
            current={state}
            onPick={setState}
          />
          <p className="text-xs text-muted-foreground">
            {scope === "type"
              ? state === "readonly"
                ? "Its certificates can be found and opened, not downloaded."
                : "Its certificates are hidden from staff search and can't be opened."
              : state === "readonly"
                ? "They can search and view, not download or upload."
                : state === "hold"
                  ? "They see the hold message instead of the app. Their sign-in stays."
                  : "They are signed out and can't sign in."}
          </p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="access-message">Message they see</Label>
          <Textarea
            id="access-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder={DEFAULT_MESSAGE[state as Exclude<SwitchState, "on">]}
          />
        </div>
        <BackOnField id="access-backon" value={backOn} at={at} onChange={setBackOn} onAt={setAt} />
        <ReasonField id="access-reason" value={reason} onChange={setReason} />
        {big ? (
          <ConfirmFields
            id="access"
            passkey={passkey}
            confirm={confirm}
            onPasskey={setPasskey}
            onConfirm={setConfirm}
          />
        ) : null}
        <div aria-live="polite">{error ? <Alert variant="error">{error}</Alert> : null}</div>
        <Button
          type="submit"
          variant={big ? "destructive" : "default"}
          className="w-full sm:w-auto sm:justify-self-start"
          disabled={
            pending ||
            !target ||
            reason.trim().length < 3 ||
            (big && (!passkey || confirm.trim() !== "CONFIRM"))
          }
        >
          Set to {STATE_LABEL[state]}
        </Button>
      </form>
    </div>
  );
}

// ── Schedules ─────────────────────────────────────────────────────────────────────

export type ScheduleItem = ScheduleRow & { reason: string | null };

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function Schedules({ rows }: { rows: ScheduleItem[] }) {
  const [section, setSection] = React.useState<SectionId>("uploads");
  const [state, setState] = React.useState<SwitchState>("hold");
  const [kind, setKind] = React.useState<ScheduleKind>("daily");
  const [days, setDays] = React.useState<number[]>([]);
  const [startTime, setStartTime] = React.useState("00:00");
  const [endTime, setEndTime] = React.useState("02:00");
  const [startsAt, setStartsAt] = React.useState("");
  const [endsAt, setEndsAt] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [passkey, setPasskey] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const { run, pending } = useRunAction();
  const states = SECTION_BY_ID[section].states.filter(
    (s): s is Exclude<SwitchState, "on"> => s !== "on",
  );
  const pickedState: Exclude<SwitchState, "on"> =
    state !== "on" && states.includes(state) ? state : "hold";
  const big = needsConfirm([{ section, state: pickedState }]);
  const now = new Date();

  return (
    <div className="grid gap-5">
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No maintenance windows.</p>
      ) : (
        <ul className="grid gap-2" data-testid="schedule-list">
          {rows.map((r) => {
            const open = scheduleActive(r, now);
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
                <div className="min-w-0 flex-1 basis-48">
                  <p className="flex flex-wrap items-center gap-x-2 font-medium">
                    {SECTION_BY_ID[r.section].name}
                    <StatePill view={r.state} />
                    {open ? <span className="text-xs text-warning">Open now</span> : null}
                    {!r.enabled ? (
                      <span className="text-xs text-muted-foreground">Paused</span>
                    ) : null}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {describeSchedule(r, (iso) => formatDateTime(iso))}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => run(() => setScheduleEnabledAction(r.id, !r.enabled))}
                  >
                    {r.enabled ? <Pause /> : <Play />}
                    {r.enabled ? "Pause" : "Resume"}
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label="Delete this schedule"
                    disabled={pending}
                    onClick={() => {
                      if (window.confirm("Delete this maintenance window?")) {
                        run(() => deleteScheduleAction(r.id));
                      }
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <form
        className="grid gap-4 rounded-lg border p-3 sm:p-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          run(
            () =>
              addScheduleAction({
                section,
                state: pickedState,
                message: message.trim() || null,
                kind,
                days,
                startTime: kind === "once" ? null : startTime,
                endTime: kind === "once" ? null : endTime,
                startsAt: kind === "once" && startsAt ? new Date(startsAt).toISOString() : null,
                endsAt: kind === "once" && endsAt ? new Date(endsAt).toISOString() : null,
                tz: "Asia/Colombo",
                reason,
                passkey: big ? passkey : undefined,
                confirm: big ? confirm : undefined,
              }),
            (r) => {
              if (r.ok) {
                setReason("");
                setMessage("");
                setPasskey("");
                setConfirm("");
              } else setError(r.error);
            },
          );
        }}
      >
        <p className="flex items-center gap-2 font-medium">
          <CalendarClock className="size-4" aria-hidden="true" /> Add a maintenance window
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="sched-section">Part</Label>
            <Select
              id="sched-section"
              value={section}
              onChange={(e) => setSection(e.target.value as SectionId)}
            >
              {SECTIONS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sched-kind">When</Label>
            <Select
              id="sched-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as ScheduleKind)}
            >
              <option value="daily">Every day</option>
              <option value="weekly">On some weekdays</option>
              <option value="once">Once</option>
            </Select>
          </div>
        </div>
        <div className="grid gap-2">
          <span className="text-sm font-medium">Switch to</span>
          <StateButtons name="schedule" states={states} current={pickedState} onPick={setState} />
        </div>
        {kind === "once" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="sched-from">From (your device&apos;s time)</Label>
              <Input
                id="sched-from"
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sched-to">To</Label>
              <Input
                id="sched-to"
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </div>
          </div>
        ) : (
          <>
            {kind === "weekly" ? (
              <fieldset className="grid gap-2">
                <legend className="mb-2 text-sm font-medium">Days</legend>
                <div className="flex flex-wrap gap-1">
                  {DAYS.map((d, i) => (
                    <label
                      key={d}
                      className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1.5 rounded-md border px-2 text-sm has-checked:border-primary has-checked:bg-accent"
                    >
                      <input
                        type="checkbox"
                        className="size-4 accent-primary"
                        checked={days.includes(i)}
                        onChange={(e) =>
                          setDays((cur) =>
                            e.target.checked ? [...cur, i] : cur.filter((x) => x !== i),
                          )
                        }
                      />
                      {d}
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}
            <div className="grid gap-4 min-[400px]:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="sched-start">From (Sri Lanka time)</Label>
                <Input
                  id="sched-start"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="sched-end">To</Label>
                <Input
                  id="sched-end"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
            </div>
          </>
        )}
        <div className="grid gap-2">
          <Label htmlFor="sched-message">Message staff see</Label>
          <Textarea
            id="sched-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="e.g. Nightly maintenance, back at 02:00."
          />
          <p className="text-xs text-muted-foreground">
            Staff get a warning 15 minutes before it starts.
          </p>
        </div>
        <ReasonField id="sched-reason" value={reason} onChange={setReason} />
        {big ? (
          <ConfirmFields
            id="sched"
            passkey={passkey}
            confirm={confirm}
            onPasskey={setPasskey}
            onConfirm={setConfirm}
          />
        ) : null}
        <div aria-live="polite">{error ? <Alert variant="error">{error}</Alert> : null}</div>
        <Button
          type="submit"
          className="w-full sm:w-auto sm:justify-self-start"
          disabled={
            pending ||
            reason.trim().length < 3 ||
            (big && (!passkey || confirm.trim() !== "CONFIRM"))
          }
        >
          Add window
        </Button>
      </form>
    </div>
  );
}

// ── View as staff ─────────────────────────────────────────────────────────────────

const PAGES: { label: string; cap: Capability; signedIn: boolean; typed?: boolean }[] = [
  { label: "Sign-in page", cap: "public", signedIn: false },
  { label: "Signing in", cap: "signin", signedIn: true },
  { label: "Certificate list and search", cap: "search", signedIn: true },
  { label: "Opening a certificate", cap: "view", signedIn: true, typed: true },
  { label: "Downloading a file or report", cap: "download", signedIn: true, typed: true },
  { label: "Upload mode", cap: "upload", signedIn: true },
  { label: "Reading files (OCR)", cap: "extract", signedIn: true },
  { label: "Sign-in code emails", cap: "email", signedIn: false },
];

/** What a staff member sees right now, page by page, worked out with the same rules. */
export function StaffPreview({
  eff,
  access,
  people,
  types,
}: {
  eff: EffectiveMap;
  access: AccessRow[];
  people: Person[];
  types: TypeOption[];
}) {
  const [personId, setPersonId] = React.useState("");
  const [typeId, setTypeId] = React.useState("");
  const person = people.find((p) => p.id === personId);
  const now = new Date();
  const order = { readonly: 1, hold: 2, down: 3 } as const;

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="preview-person">As</Label>
          <Select
            id="preview-person"
            value={personId}
            onChange={(e) => setPersonId(e.target.value)}
          >
            <option value="">Any staff member</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.email}
                {p.canUpload ? " (uploader)" : ""}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="preview-type">Certificate type</Label>
          <Select id="preview-type" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
            <option value="">Any type</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <ul className="grid gap-2" data-testid="staff-preview">
        {PAGES.filter((p) =>
          p.cap !== "upload" && p.cap !== "extract" ? true : !person || person.canUpload,
        ).map((p) => {
          const blocks = [
            blockFor(p.cap, eff),
            person && p.signedIn
              ? accessBlock(p.cap, access, { userId: person.id, canUpload: person.canUpload }, now)
              : null,
            p.typed && typeId ? accessBlock(p.cap, access, { typeId }, now) : null,
          ]
            .filter((b) => b !== null)
            .sort((a, b) => order[b.state] - order[a.state]);
          const b = blocks[0];
          return (
            <li key={p.label} className="grid gap-2 rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-x-2">
                <span className="text-sm font-medium">{p.label}</span>
                <StatePill view={b ? b.state : "on"} />
              </div>
              {b ? <SwitchNotice block={b} compact /> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── Change log ────────────────────────────────────────────────────────────────────

export type LogItem = {
  id: string;
  at: string;
  by: string | null;
  action: string;
  target: string | null;
  reason: string | null;
};

const ACTION_TEXT: Record<string, string> = {
  "control.switch": "Switched",
  "control.preset": "Preset",
  "control.undo": "Undo",
  "control.access": "People/type switch",
  "control.timer_end": "Timer ended",
  "control.access_timer_end": "Timer ended",
  "control.schedule_added": "Window added",
  "control.schedule_deleted": "Window deleted",
  "control.schedule_paused": "Window paused",
  "control.schedule_resumed": "Window resumed",
  "control.schedule_start": "Window opened",
  "control.schedule_end": "Window closed",
  "control.preset_saved": "Preset saved",
  "control.preset_deleted": "Preset deleted",
  "control.unlock": "Unlocked",
  "control.unlock_failed": "Wrong passkey",
  "control.passkey_set": "Passkey set",
  "control.passkey_changed": "Passkey changed",
  "control.rescue_sent": "Rescue link sent",
  "control.rescue_used": "Rescue link used",
};

export function ChangeLog({ rows }: { rows: LogItem[] }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No changes yet.</p>;
  return (
    <ol className="grid gap-0" data-testid="control-log">
      {rows.map((r) => (
        <li key={r.id} className="relative grid gap-0.5 border-l-2 pb-4 pl-4 last:pb-0">
          <span
            className="absolute top-1.5 -left-[5px] size-2 rounded-full bg-primary"
            aria-hidden="true"
          />
          <span className="text-xs text-muted-foreground">
            {formatDateTime(r.at)} · {r.by ?? "Automatic"}
          </span>
          <span className="text-sm wrap-anywhere">
            <span className="font-medium">{ACTION_TEXT[r.action] ?? r.action}</span>
            {r.target ? `: ${r.target}` : ""}
          </span>
          {r.reason ? (
            <span className="text-xs wrap-anywhere text-muted-foreground">Reason: {r.reason}</span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
