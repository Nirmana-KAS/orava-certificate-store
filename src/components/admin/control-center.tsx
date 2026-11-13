"use client";

import "@xyflow/react/dist/style.css";

import {
  Background,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { List, LoaderCircle, Network, Power, X } from "lucide-react";
import * as React from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { setSwitchAction } from "@/lib/admin/control-actions";
import { formatDateTime } from "@/lib/format";
import {
  DEFAULT_MESSAGE,
  SECTIONS,
  SECTION_BY_ID,
  STATE_LABEL,
  chainOf,
  needsConfirm,
  sectionView,
  type EffectiveMap,
  type SectionId,
  type SwitchState,
} from "@/lib/system/switches";
import { cn } from "@/lib/utils";

import {
  BackOnField,
  ConfirmFields,
  LOOK,
  ReasonField,
  StateButtons,
  StatePill,
  backOnIso,
  useRunAction,
} from "./control-shared";

export type SectionInfo = {
  reason: string | null;
  changedBy: string | null;
  changedAt: string | null;
};

type Pick = { section: SectionId; state: SwitchState; via?: SectionId } | null;

// ── The map ───────────────────────────────────────────────────────────────────────

type SectionData = {
  id: SectionId;
  eff: EffectiveMap;
  selected: boolean;
  onPick: (p: NonNullable<Pick>) => void;
};

const COL = 280;
const ROW = 190;
const hidden = "!size-1.5 !min-h-0 !min-w-0 !border-0 !bg-transparent";
const SIDES = [
  ["l", Position.Left],
  ["r", Position.Right],
  ["t", Position.Top],
  ["b", Position.Bottom],
] as const;

function Handles() {
  return (
    <>
      {SIDES.map(([id, pos]) => (
        <React.Fragment key={id}>
          <Handle
            type="target"
            id={`${id}-in`}
            position={pos}
            className={hidden}
            isConnectable={false}
          />
          <Handle
            type="source"
            id={`${id}-out`}
            position={pos}
            className={hidden}
            isConnectable={false}
          />
        </React.Fragment>
      ))}
    </>
  );
}

function SectionNode({ data }: NodeProps<Node<SectionData>>) {
  const s = SECTION_BY_ID[data.id];
  const { view } = sectionView(data.id, data.eff);
  const e = data.eff[data.id];
  return (
    <div
      className={cn(
        "w-[236px] cursor-pointer rounded-xl border-2 bg-background px-3 py-2.5 shadow-sm",
        LOOK[view].box,
        data.selected && "ring-2 ring-primary ring-offset-2",
      )}
      data-testid={`control-node-${data.id}`}
    >
      <Handles />
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm leading-tight font-semibold">{s.name}</p>
        <StatePill view={view} />
      </div>
      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
        {e.source === "schedule"
          ? "By a schedule"
          : e.until
            ? `Back on ${formatDateTime(e.until)}`
            : view === "affected"
              ? "Something it needs is off"
              : " "}
      </p>
      <div className="mt-2">
        <StateButtons
          small
          name={s.name}
          states={s.states}
          current={e.state}
          onPick={(state) => data.onPick({ section: data.id, state })}
        />
      </div>
    </div>
  );
}

/** The big round button in the middle: the whole staff side. */
function SystemNode({ data }: NodeProps<Node<SectionData>>) {
  const e = data.eff.system;
  const l = LOOK[e.state];
  return (
    <div className="flex w-[260px] flex-col items-center gap-2" data-testid="control-node-system">
      <div className="relative rounded-full">
        <Handles />
        <button
          type="button"
          onClick={(ev) => {
            ev.stopPropagation();
            data.onPick({ section: "system", state: e.state === "on" ? "hold" : "on" });
          }}
          className={cn(
            "nodrag nopan grid size-36 cursor-pointer place-items-center rounded-full border-4 bg-background text-center shadow-md transition-shadow hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring",
            e.state === "on" ? "border-success" : l.box.split(" ")[0],
            data.selected && "ring-2 ring-primary ring-offset-4",
          )}
          aria-label={`Whole staff side: ${STATE_LABEL[e.state]}. ${e.state === "on" ? "Put on hold" : "Switch back on"}`}
        >
          <span className="grid justify-items-center gap-1">
            <Power className={cn("size-8", l.text)} aria-hidden="true" />
            <span className="text-xs font-semibold">Whole staff side</span>
            <StatePill view={e.state} />
          </span>
        </button>
      </div>
      <div className="rounded-lg border bg-background p-1 shadow-xs">
        <StateButtons
          small
          name="Whole staff side"
          states={SECTION_BY_ID.system.states}
          current={e.state}
          onPick={(state) => data.onPick({ section: "system", state })}
        />
      </div>
    </div>
  );
}

const nodeTypes = { section: SectionNode, system: SystemNode };

/** Where each box sits on the wide map (column, row). */
const AT: Record<SectionId, [number, number]> = {
  public: [0, 0],
  auth: [1, 0],
  search: [3, 0],
  view: [4, 0],
  database: [0, 1.4],
  system: [1.93, 1.05],
  storage: [3, 1.4],
  email: [0, 2.8],
  health: [1, 2.8],
  extraction: [2, 2.8],
  uploads: [3, 2.8],
  downloads: [4, 2.8],
};

/**
 * What each part needs, as lines, with the sides they join so no line runs under a box. The
 * whole-staff-side button also has a thin line to each part it switches.
 */
const NEEDS_SIDES: Record<string, [string, string]> = {
  "database-auth": ["r", "b"],
  "database-search": ["r", "l"],
  "database-view": ["t", "l"],
  "database-uploads": ["r", "t"],
  "storage-view": ["t", "b"],
  "storage-downloads": ["b", "t"],
  "storage-uploads": ["b", "t"],
  "view-downloads": ["b", "t"],
  "uploads-extraction": ["l", "r"],
};

const LINES: { from: SectionId; to: SectionId; kind: "needs" | "switch" }[] = [
  ...SECTIONS.flatMap((s) => s.needs.map((n) => ({ from: n, to: s.id, kind: "needs" as const }))),
  ...(["public", "auth", "search", "view", "uploads", "downloads", "extraction"] as const).map(
    (to) => ({ from: "system" as const, to, kind: "switch" as const }),
  ),
];

function sides(from: SectionId, to: SectionId): [string, string] {
  const fixed = NEEDS_SIDES[`${from}-${to}`];
  if (fixed) return fixed;
  const [fx, fy] = AT[from];
  const [tx, ty] = AT[to];
  const dx = tx - fx;
  const dy = (ty - fy) * (ROW / COL);
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? ["r", "l"] : ["l", "r"];
  return dy > 0 ? ["b", "t"] : ["t", "b"];
}

function MapView({
  eff,
  pick,
  onPick,
}: {
  eff: EffectiveMap;
  pick: Pick;
  onPick: (p: NonNullable<Pick>) => void;
}) {
  const nodes: Node<SectionData>[] = SECTIONS.map((s) => ({
    id: s.id,
    type: s.id === "system" ? "system" : "section",
    position: { x: AT[s.id][0] * COL, y: AT[s.id][1] * ROW },
    data: { id: s.id, eff, selected: pick?.section === s.id, onPick },
    draggable: false,
    connectable: false,
    ariaLabel: `${s.name}: ${LOOK[sectionView(s.id, eff).view].label}`,
  }));
  const edges: Edge[] = LINES.map(({ from, to, kind }) => {
    const st = eff[from].state;
    const [a, b] = sides(from, to);
    const picked = pick?.section === to && pick.via === from;
    const faded = pick && !picked && pick.section !== to;
    return {
      id: `${from}-${to}`,
      source: from,
      target: to,
      sourceHandle: `${a}-out`,
      targetHandle: `${b}-in`,
      type: "straight",
      animated: st === "on" && kind === "needs",
      ariaLabel: `${SECTION_BY_ID[from].name} to ${SECTION_BY_ID[to].name}: ${STATE_LABEL[st]}`,
      style: {
        stroke: LOOK[st].line,
        strokeWidth: picked ? 4 : kind === "needs" ? 2 : 1.25,
        strokeDasharray:
          kind === "switch" ? "2 5" : st === "hold" || st === "down" ? "6 4" : undefined,
        opacity: faded ? 0.35 : kind === "switch" && st === "on" ? 0.55 : 1,
      },
      interactionWidth: 24,
    };
  });
  return (
    <div
      className="aspect-[1.9/1] max-h-[640px] min-h-[420px] w-full overflow-hidden rounded-xl border bg-background"
      data-testid="control-diagram"
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.05 }}
        minZoom={0.3}
        maxZoom={1.4}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        panOnDrag={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        preventScrolling={false}
        attributionPosition="bottom-left"
        onEdgeClick={(_, e) => {
          // Cutting a line means stopping the box it leads to from using the one it comes from
          const to = e.target as SectionId;
          onPick({
            section: to,
            state: eff[to].state === "on" ? "hold" : "on",
            via: e.source as SectionId,
          });
        }}
      >
        <Background gap={24} color="#e5e7eb" />
      </ReactFlow>
    </div>
  );
}

// ── The list (phones) ─────────────────────────────────────────────────────────────

function ListView({
  eff,
  pick,
  onPick,
}: {
  eff: EffectiveMap;
  pick: Pick;
  onPick: (p: NonNullable<Pick>) => void;
}) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2" aria-label="Sections">
      {SECTIONS.map((s) => {
        const { view, by } = sectionView(s.id, eff);
        const e = eff[s.id];
        return (
          <li
            key={s.id}
            className={cn(
              "grid gap-2 rounded-xl border-2 bg-background p-3",
              LOOK[view].box,
              s.id === "system" && "sm:col-span-2",
              pick?.section === s.id && "ring-2 ring-primary ring-offset-2",
            )}
            data-testid={`control-item-${s.id}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-x-2">
              <span className="flex items-center gap-2 font-semibold">
                {s.id === "system" ? <Power className="size-4" aria-hidden="true" /> : null}
                {s.name}
              </span>
              <StatePill view={view} />
            </div>
            <p className="text-xs text-muted-foreground">
              {view === "affected"
                ? `Off because ${by.map((d) => SECTION_BY_ID[d].name).join(", ")} ${by.length === 1 ? "is" : "are"} off.`
                : e.source === "schedule"
                  ? "Set by a maintenance window."
                  : e.until
                    ? `Back on ${formatDateTime(e.until)}.`
                    : s.about}
            </p>
            <StateButtons
              name={s.name}
              states={s.states}
              current={e.state}
              onPick={(state) => onPick({ section: s.id, state })}
            />
          </li>
        );
      })}
    </ul>
  );
}

// ── The switch form ───────────────────────────────────────────────────────────────

function SwitchPanel({
  pick,
  eff,
  info,
  onClose,
}: {
  pick: NonNullable<Pick>;
  eff: EffectiveMap;
  info: Partial<Record<SectionId, SectionInfo>>;
  onClose: () => void;
}) {
  const s = SECTION_BY_ID[pick.section];
  const e = eff[pick.section];
  const [state, setState] = React.useState<SwitchState>(pick.state);
  const [message, setMessage] = React.useState(e.state !== "on" ? (e.message ?? "") : "");
  const [backOn, setBackOn] = React.useState("");
  const [at, setAt] = React.useState("");
  const [includeAdmin, setIncludeAdmin] = React.useState(e.includeAdmin);
  const [reason, setReason] = React.useState("");
  const [passkey, setPasskey] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const { run, pending } = useRunAction();
  const heading = React.useRef<HTMLHeadingElement>(null);

  React.useEffect(() => {
    heading.current?.focus();
    heading.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [pick.section]);

  const big = needsConfirm([{ section: pick.section, state }]);
  const affects = [
    ...new Set(
      SECTIONS.filter((x) => x.id !== pick.section && chainOf(x.id).includes(pick.section)).map(
        (x) => x.name,
      ),
    ),
  ];
  const last = info[pick.section];
  const id = `switch-${pick.section}`;

  return (
    <section
      aria-label={`Switch ${s.name}`}
      className="relative grid gap-4 rounded-xl border bg-background p-4 pr-14 shadow-sm sm:p-5 sm:pr-14"
      data-testid="switch-panel"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onClose}
        aria-label="Close"
        className="absolute top-1 right-1"
      >
        <X />
      </Button>
      <div>
        <h3 ref={heading} tabIndex={-1} className="text-lg font-semibold outline-none">
          {s.name}
        </h3>
        {pick.via ? (
          <p className="text-sm text-muted-foreground">
            This line is how {s.name} uses {SECTION_BY_ID[pick.via].name}. Cutting it means
            switching {s.name}.
          </p>
        ) : null}
        <p className="mt-1 text-sm">{s.about}</p>
        <p className="mt-2 flex flex-wrap items-center gap-x-2 text-sm">
          Now: <StatePill view={sectionView(pick.section, eff).view} />
          {e.source === "schedule" ? (
            <span className="text-muted-foreground">(a maintenance window)</span>
          ) : null}
        </p>
        {last?.changedAt && last.changedBy ? (
          <p className="text-xs text-muted-foreground">
            Last changed {formatDateTime(last.changedAt)} by {last.changedBy}
            {last.reason ? `: ${last.reason}` : ""}
          </p>
        ) : null}
        {affects.length && state !== "on" ? (
          <p className="mt-2 text-sm text-muted-foreground">Also affects: {affects.join(", ")}.</p>
        ) : null}
      </div>

      <form
        className="grid gap-4"
        onSubmit={(ev) => {
          ev.preventDefault();
          setError(null);
          if (backOn === "at" && !at) {
            setError("Pick the back-on time.");
            return;
          }
          run(
            () =>
              setSwitchAction({
                section: pick.section,
                state,
                message: message.trim() || null,
                until: state === "on" ? null : backOnIso(backOn, at),
                includeAdmin,
                reason,
                passkey: big ? passkey : undefined,
                confirm: big ? confirm : undefined,
              }),
            (r) => {
              if (r.ok) onClose();
              else setError(r.error);
            },
          );
        }}
      >
        <div className="grid gap-2">
          <span className="text-sm font-medium" id={`${id}-state`}>
            Switch to
          </span>
          <StateButtons name={s.name} states={s.states} current={state} onPick={setState} />
        </div>

        {state !== "on" ? (
          <>
            <div className="grid gap-2">
              <Label htmlFor={`${id}-message`}>Message staff see</Label>
              <Textarea
                id={`${id}-message`}
                value={message}
                onChange={(ev) => setMessage(ev.target.value)}
                maxLength={500}
                rows={3}
                placeholder={DEFAULT_MESSAGE[state]}
              />
              <p className="text-xs text-muted-foreground">Leave empty to use the text shown.</p>
            </div>
            <BackOnField
              id={`${id}-backon`}
              value={backOn}
              at={at}
              onChange={setBackOn}
              onAt={setAt}
            />
            {s.adminOption ? (
              <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  className="size-5 accent-primary"
                  checked={includeAdmin}
                  onChange={(ev) => setIncludeAdmin(ev.target.checked)}
                />
                Also stop my own uploads
              </label>
            ) : null}
          </>
        ) : null}

        <ReasonField id={`${id}-reason`} value={reason} onChange={setReason} />
        {big ? (
          <ConfirmFields
            id={id}
            passkey={passkey}
            confirm={confirm}
            onPasskey={setPasskey}
            onConfirm={setConfirm}
          />
        ) : null}
        <div aria-live="polite">{error ? <Alert variant="error">{error}</Alert> : null}</div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="submit"
            variant={state === "down" ? "destructive" : "default"}
            disabled={
              pending ||
              reason.trim().length < 3 ||
              (big && (!passkey || confirm.trim() !== "CONFIRM"))
            }
            className="w-full sm:w-auto"
            data-testid="switch-submit"
          >
            {pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
            {state === "on" ? `Switch ${s.name} on` : `Set ${s.name} to ${STATE_LABEL[state]}`}
          </Button>
          <Button type="button" variant="outline" onClick={onClose} className="w-full sm:w-auto">
            Cancel
          </Button>
        </div>
      </form>
    </section>
  );
}

// ── Together ──────────────────────────────────────────────────────────────────────

const subscribeWide = (cb: () => void) => {
  const mq = window.matchMedia("(min-width: 1024px)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

export function SwitchMap({
  eff,
  info,
}: {
  eff: EffectiveMap;
  info: Partial<Record<SectionId, SectionInfo>>;
}) {
  const wide = React.useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia("(min-width: 1024px)").matches,
    () => false,
  );
  const [picked, setPicked] = React.useState<"map" | "list" | null>(null);
  const view = picked ?? (wide ? "map" : "list");
  const [pick, setPick] = React.useState<Pick>(null);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Show as">
        <Button
          type="button"
          size="sm"
          variant={view === "map" ? "secondary" : "ghost"}
          aria-pressed={view === "map"}
          onClick={() => setPicked("map")}
        >
          <Network aria-hidden="true" /> Map
        </Button>
        <Button
          type="button"
          size="sm"
          variant={view === "list" ? "secondary" : "ghost"}
          aria-pressed={view === "list"}
          onClick={() => setPicked("list")}
        >
          <List aria-hidden="true" /> List
        </Button>
        <span className="text-xs text-muted-foreground">
          Press a state on any box to switch it. Solid lines show what each part needs; dotted lines
          show what the round button switches.
        </span>
      </div>
      <div className="grid gap-4">
        <div className="min-w-0">
          {view === "map" ? (
            <MapView eff={eff} pick={pick} onPick={setPick} />
          ) : (
            <ListView eff={eff} pick={pick} onPick={setPick} />
          )}
        </div>
        {pick ? (
          <div className={cn("min-w-0", view === "list" && "order-first")}>
            <SwitchPanel
              key={`${pick.section}-${pick.state}-${pick.via ?? ""}`}
              pick={pick}
              eff={eff}
              info={info}
              onClose={() => setPick(null)}
            />
          </div>
        ) : null}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1" aria-label="What the colours mean">
        {(["on", "readonly", "hold", "down", "affected"] as const).map((v) => (
          <li key={v}>
            <StatePill view={v} />
          </li>
        ))}
      </ul>
    </div>
  );
}
