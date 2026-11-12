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
import { Download, List, Network, RefreshCw, Stethoscope, X } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { diagnoseAction, redeployAction, refreshChecksAction } from "@/lib/admin/system-actions";
import {
  COMPONENTS,
  COMPONENT_BY_ID,
  CONNECTIONS,
  STATUS_LABEL,
  connectionStatus,
  mapStatuses,
  type ComponentId,
  type Connection,
  type HealthResults,
  type MapStatus,
  type Status,
} from "@/lib/system/map";
import { cn } from "@/lib/utils";

const OUTCOME_TEXT = {
  fixed: "Fixed",
  ok: "Nothing was wrong",
  still_failing: "Still not working",
  needs_you: "Needs you",
} as const;

/** Colours for each status: dot, line and soft background. */
const TONE: Record<MapStatus, { dot: string; line: string; box: string; text: string }> = {
  ok: { dot: "bg-success", line: "#1d7a46", box: "border-success/40", text: "text-success" },
  warn: {
    dot: "bg-warning",
    line: "#9a5b00",
    box: "border-warning/50 bg-warning/5",
    text: "text-warning",
  },
  fail: {
    dot: "bg-destructive",
    line: "#c62828",
    box: "border-destructive/60 bg-destructive/5",
    text: "text-destructive",
  },
  affected: {
    dot: "bg-orange-400",
    line: "#c2410c",
    box: "border-orange-300 bg-orange-50",
    text: "text-orange-800",
  },
  off: {
    dot: "bg-muted-foreground/50",
    line: "#9ca3af",
    box: "border-border",
    text: "text-muted-foreground",
  },
  unknown: {
    dot: "bg-muted-foreground/50",
    line: "#9ca3af",
    box: "border-dashed border-border",
    text: "text-muted-foreground",
  },
};

export function StatusPill({ status, className }: { status: MapStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap",
        TONE[status].text,
        className,
      )}
      data-status={status}
    >
      <span className={cn("size-2.5 shrink-0 rounded-full", TONE[status].dot)} aria-hidden="true" />
      {STATUS_LABEL[status]}
    </span>
  );
}

type Selected = { kind: "part"; id: ComponentId } | { kind: "link"; id: string } | null;

type PartData = { id: ComponentId; status: MapStatus; summary: string; selected: boolean };

const handle = "!size-1.5 !min-h-0 !min-w-0 !border-0 !bg-transparent";

function PartNode({ data }: NodeProps<Node<PartData>>) {
  const c = COMPONENT_BY_ID[data.id];
  return (
    <div
      className={cn(
        "w-[200px] cursor-pointer rounded-xl border-2 bg-background px-3 py-2.5 shadow-sm transition-shadow hover:shadow-md",
        TONE[data.status].box,
        data.selected && "ring-2 ring-primary ring-offset-2",
      )}
      data-testid={`map-part-${data.id}`}
    >
      {(["l", "r", "t", "b"] as const).map((h) => (
        <React.Fragment key={h}>
          <Handle
            type="target"
            id={`${h}-in`}
            position={POS[h]}
            className={handle}
            isConnectable={false}
          />
          <Handle
            type="source"
            id={`${h}-out`}
            position={POS[h]}
            className={handle}
            isConnectable={false}
          />
        </React.Fragment>
      ))}
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm leading-tight font-semibold">{c.name}</p>
        <span
          className={cn("mt-1 size-2.5 shrink-0 rounded-full", TONE[data.status].dot)}
          aria-hidden="true"
        />
      </div>
      <p className="truncate text-[11px] text-muted-foreground">{c.provider}</p>
      <p className={cn("mt-1 truncate text-xs font-medium", TONE[data.status].text)}>
        {data.status === "ok" || data.status === "off" ? data.summary : STATUS_LABEL[data.status]}
      </p>
    </div>
  );
}

const POS = { l: Position.Left, r: Position.Right, t: Position.Top, b: Position.Bottom };
const nodeTypes = { part: PartNode };

const COL = 245;
const ROW = 130;

/** Which sides of the two boxes a line joins. */
function sides(c: Connection): [string, string] {
  if (c.id === "browser-storage") return ["b-out", "b-in"]; // runs under the middle row
  const [fx, fy] = COMPONENT_BY_ID[c.from].at;
  const [tx, ty] = COMPONENT_BY_ID[c.to].at;
  if (fx === tx) return fy < ty ? ["b-out", "t-in"] : ["t-out", "b-in"];
  return fx < tx ? ["r-out", "l-in"] : ["l-out", "r-in"];
}

function Diagram({
  statuses,
  results,
  selected,
  onSelect,
}: {
  statuses: Record<ComponentId, MapStatus>;
  results: HealthResults;
  selected: Selected;
  onSelect: (s: Selected) => void;
}) {
  const nodes: Node<PartData>[] = COMPONENTS.map((c) => ({
    id: c.id,
    type: "part",
    position: { x: c.at[0] * COL, y: c.at[1] * ROW },
    data: {
      id: c.id,
      status: statuses[c.id],
      summary: results[c.id]?.summary ?? "",
      selected: selected?.kind === "part" && selected.id === c.id,
    },
    draggable: false,
    connectable: false,
    ariaLabel: `${c.name}: ${STATUS_LABEL[statuses[c.id]]}`,
  }));
  const edges: Edge[] = CONNECTIONS.map((c) => {
    const s = connectionStatus(c, statuses);
    const [sourceHandle, targetHandle] = sides(c);
    const picked = selected?.kind === "link" && selected.id === c.id;
    return {
      id: c.id,
      source: c.from,
      target: c.to,
      sourceHandle,
      targetHandle,
      type: "smoothstep",
      label: c.label,
      animated: s === "ok",
      ariaLabel: `${c.label}: ${STATUS_LABEL[s]}`,
      style: {
        stroke: TONE[s].line,
        strokeWidth: picked ? 4 : 2,
        strokeDasharray: s === "fail" ? "6 4" : undefined,
      },
      labelStyle: { fontSize: 11, fontWeight: 600, fill: TONE[s].line },
      labelBgStyle: { fill: "#ffffff" },
      labelBgPadding: [4, 2] as [number, number],
      interactionWidth: 24,
    };
  });

  return (
    <div
      className="aspect-[2/1] max-h-[560px] min-h-[340px] w-full overflow-hidden rounded-xl border bg-background"
      data-testid="system-diagram"
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.04 }}
        minZoom={0.3}
        maxZoom={1.5}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        panOnDrag={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        preventScrolling={false}
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_, n) => onSelect({ kind: "part", id: n.id as ComponentId })}
        onEdgeClick={(_, e) => onSelect({ kind: "link", id: e.id })}
        onPaneClick={() => onSelect(null)}
      >
        <Background gap={24} color="#e5e7eb" />
      </ReactFlow>
    </div>
  );
}

function ListView({
  statuses,
  results,
  onSelect,
}: {
  statuses: Record<ComponentId, MapStatus>;
  results: HealthResults;
  onSelect: (s: Selected) => void;
}) {
  // Problems first, so they are at the top on a phone
  const order: Record<MapStatus, number> = {
    fail: 0,
    affected: 1,
    warn: 2,
    unknown: 3,
    ok: 4,
    off: 5,
  };
  const parts = [...COMPONENTS].sort((a, b) => order[statuses[a.id]] - order[statuses[b.id]]);
  return (
    <div className="grid gap-6">
      <section aria-labelledby="parts-heading">
        <h3 id="parts-heading" className="mb-2 text-sm font-semibold">
          Parts
        </h3>
        <ul className="grid gap-2 sm:grid-cols-2">
          {parts.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onSelect({ kind: "part", id: c.id })}
                className={cn(
                  "flex min-h-11 w-full cursor-pointer flex-col gap-0.5 rounded-lg border-2 bg-background px-3 py-2 text-left hover:bg-accent/40",
                  TONE[statuses[c.id]].box,
                )}
                data-testid={`list-part-${c.id}`}
              >
                <span className="flex w-full flex-wrap items-center justify-between gap-x-2">
                  <span className="text-sm font-semibold">{c.name}</span>
                  <StatusPill status={statuses[c.id]} />
                </span>
                <span className="text-xs text-muted-foreground">
                  {c.provider}
                  {results[c.id]?.summary ? ` · ${results[c.id]!.summary}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="links-heading">
        <h3 id="links-heading" className="mb-2 text-sm font-semibold">
          Connections
        </h3>
        <ul className="grid gap-2 sm:grid-cols-2">
          {CONNECTIONS.map((c) => {
            const s = connectionStatus(c, statuses);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onSelect({ kind: "link", id: c.id })}
                  className="flex min-h-11 w-full cursor-pointer flex-wrap items-center justify-between gap-x-2 gap-y-0.5 rounded-lg border bg-background px-3 py-2 text-left hover:bg-accent/40"
                  data-testid={`list-link-${c.id}`}
                >
                  <span className="text-sm">
                    {COMPONENT_BY_ID[c.from].name} → {COMPONENT_BY_ID[c.to].name}
                    <span className="text-muted-foreground"> · {c.label}</span>
                  </span>
                  <StatusPill status={s} />
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

const STEP_ICON: Record<Status, string> = { ok: "✓", warn: "!", fail: "✕", off: "–", unknown: "?" };

function DiagnoseButton({
  target,
  label = "Diagnose & Fix",
  variant = "default",
}: {
  target: ComponentId | "all";
  label?: string;
  variant?: "default" | "outline";
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [result, setResult] = React.useState<
    | { ok: true; id: string; outcome: keyof typeof OUTCOME_TEXT }
    | { ok: false; error: string }
    | null
  >(null);
  return (
    <div className="grid gap-2">
      <Button
        type="button"
        variant={variant}
        disabled={pending}
        onClick={() =>
          start(async () => {
            setResult(null);
            const r = await diagnoseAction(target);
            setResult(r);
            router.refresh();
          })
        }
        className="w-full sm:w-auto sm:justify-self-start"
      >
        <Stethoscope aria-hidden="true" />
        {pending ? "Checking and fixing…" : label}
      </Button>
      <div aria-live="polite">
        {result ? (
          result.ok ? (
            <Alert
              variant={
                result.outcome === "fixed" || result.outcome === "ok" ? "success" : "warning"
              }
              data-testid="diagnose-result"
            >
              <p className="font-medium">{OUTCOME_TEXT[result.outcome]}</p>
              <p>
                {result.outcome === "fixed"
                  ? "It works again. "
                  : result.outcome === "ok"
                    ? "Every check passed. "
                    : "The report says what was tried and what you need to do. "}
                <a href={`/admin/system/reports/${result.id}`} download>
                  Download the report
                </a>
              </p>
            </Alert>
          ) : (
            <Alert variant="error">{result.error}</Alert>
          )
        ) : null}
      </div>
    </div>
  );
}

function Details({
  selected,
  statuses,
  results,
  incidents,
  onClose,
}: {
  selected: NonNullable<Selected>;
  statuses: Record<ComponentId, MapStatus>;
  results: HealthResults;
  incidents: Partial<Record<ComponentId, string>>;
  onClose: () => void;
}) {
  const heading = React.useRef<HTMLHeadingElement>(null);
  React.useEffect(() => heading.current?.focus(), [selected]);

  if (selected.kind === "link") {
    const c = CONNECTIONS.find((x) => x.id === selected.id);
    if (!c) return null;
    const s = connectionStatus(c, statuses);
    return (
      <Panel onClose={onClose}>
        <h3 ref={heading} tabIndex={-1} className="text-lg font-semibold outline-none">
          {COMPONENT_BY_ID[c.from].name} → {COMPONENT_BY_ID[c.to].name}
        </h3>
        <p className="text-sm text-muted-foreground">{c.label}</p>
        <StatusPill status={s} className="mt-2" />
        <p className="mt-3 text-sm">{c.about}</p>
        <p className="mt-3 text-xs font-semibold text-muted-foreground">
          Example of what is sent (private parts hidden)
        </p>
        <pre className="mt-1 overflow-x-auto rounded-md bg-muted p-3 text-xs wrap-anywhere whitespace-pre-wrap">
          {c.sample}
        </pre>
        {s !== "ok" ? (
          <p className="mt-3 text-sm text-muted-foreground">
            A connection is as healthy as the parts at both ends. Open{" "}
            {statuses[c.from] !== "ok" ? COMPONENT_BY_ID[c.from].name : COMPONENT_BY_ID[c.to].name}{" "}
            to see why.
          </p>
        ) : null}
      </Panel>
    );
  }

  const c = COMPONENT_BY_ID[selected.id];
  const r = results[c.id];
  const status = statuses[c.id];
  return (
    <Panel onClose={onClose}>
      <h3
        ref={heading}
        tabIndex={-1}
        className="text-lg font-semibold outline-none"
        data-testid="detail-title"
      >
        {c.name}
      </h3>
      <p className="text-sm text-muted-foreground">{c.provider}</p>
      <StatusPill status={status} className="mt-2" />
      {status === "affected" ? (
        <p className="mt-2 text-sm text-orange-800">
          Not working because{" "}
          {c.needs
            .filter((n) => results[n]?.status === "fail")
            .map((n) => COMPONENT_BY_ID[n].name)
            .join(", ")}{" "}
          isn&apos;t. Fix that first.
        </p>
      ) : null}
      {incidents[c.id] ? (
        <p className="mt-2 text-sm text-destructive">Not working since {incidents[c.id]}.</p>
      ) : null}
      <p className="mt-3 text-sm">{c.about}</p>
      {r ? (
        <ul className="mt-4 grid gap-2" aria-label="Checks">
          {r.checks.map((ch) => (
            <li key={ch.name} className="flex gap-2 text-sm">
              <span
                className={cn(
                  "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white",
                  TONE[ch.status].dot,
                )}
                aria-hidden="true"
              >
                {STEP_ICON[ch.status]}
              </span>
              <span className="min-w-0">
                <span className="font-medium">{ch.name}</span>
                <span className="sr-only"> ({STATUS_LABEL[ch.status]})</span>
                <span className="block wrap-anywhere text-muted-foreground">{ch.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">Not checked yet.</p>
      )}
      <div className="mt-4">
        <DiagnoseButton
          target={c.id}
          variant={status === "ok" || status === "off" ? "outline" : "default"}
        />
      </div>
    </Panel>
  );
}

function Panel({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <section
      aria-label="Details"
      className="relative rounded-xl border bg-background p-4 pr-14 shadow-sm"
      data-testid="system-details"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onClose}
        aria-label="Close details"
        className="absolute top-1 right-1"
      >
        <X aria-hidden="true" />
      </Button>
      {children}
    </section>
  );
}

const subscribeWide = (cb: () => void) => {
  const mq = window.matchMedia("(min-width: 768px)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

/** The live map: a diagram on wider screens, a list on phones (either can be picked). */
export function SystemMap({
  results,
  incidents,
}: {
  results: HealthResults;
  /** Parts with an open incident: when it started */
  incidents: Partial<Record<ComponentId, string>>;
}) {
  const wide = React.useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia("(min-width: 768px)").matches,
    () => false,
  );
  const [picked, setPicked] = React.useState<"map" | "list" | null>(null);
  const view = picked ?? (wide ? "map" : "list");
  const [selected, setSelected] = React.useState<Selected>(null);
  const statuses = mapStatuses(results);

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
          <Network aria-hidden="true" /> Diagram
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
        <span className="text-xs text-muted-foreground">Tap a part or a line for details.</span>
      </div>
      <div className="grid gap-4">
        <div className="min-w-0">
          {view === "map" ? (
            <Diagram
              statuses={statuses}
              results={results}
              selected={selected}
              onSelect={setSelected}
            />
          ) : (
            <ListView statuses={statuses} results={results} onSelect={setSelected} />
          )}
        </div>
        <div className={cn("min-w-0", view === "list" && "order-first")}>
          {selected ? (
            <Details
              selected={selected}
              statuses={statuses}
              results={results}
              incidents={incidents}
              onClose={() => setSelected(null)}
            />
          ) : null}
        </div>
      </div>
      <Legend />
    </div>
  );
}

function Legend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1" aria-label="What the colours mean">
      {(["ok", "warn", "fail", "affected", "off"] as const).map((s) => (
        <li key={s}>
          <StatusPill status={s} />
        </li>
      ))}
    </ul>
  );
}

/** "Check now" and "Diagnose & Fix everything", and quiet re-checks while the page is open. */
export function SystemActions({ hasRedeploy }: { hasRedeploy: boolean }) {
  const [pending, start] = React.useTransition();
  const [deploy, setDeploy] = React.useState<{ ok: boolean; detail: string } | null>(null);
  const [deploying, startDeploy] = React.useTransition();
  return (
    <div className="grid gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => start(async () => void (await refreshChecksAction(true)))}
        >
          <RefreshCw className={cn(pending && "animate-spin")} aria-hidden="true" />
          {pending ? "Checking…" : "Check now"}
        </Button>
        <DiagnoseButton target="all" label="Diagnose & Fix everything" />
        {hasRedeploy ? (
          <Button
            type="button"
            variant="outline"
            disabled={deploying}
            onClick={() => {
              if (
                !window.confirm("Start a new deployment of the site now? It takes about 2 minutes.")
              )
                return;
              startDeploy(async () => setDeploy(await redeployAction()));
            }}
          >
            {deploying ? "Starting…" : "Redeploy"}
          </Button>
        ) : null}
      </div>
      {deploy ? <Alert variant={deploy.ok ? "success" : "error"}>{deploy.detail}</Alert> : null}
    </div>
  );
}

const EVERY_MS = 30_000;

/** While the System Map is open, checks again when the last check is more than a minute old. */
export function LiveChecks({ runId }: { runId: string | null }) {
  const router = useRouter();
  const shown = React.useRef(runId);
  React.useEffect(() => {
    shown.current = runId;
  }, [runId]);
  React.useEffect(() => {
    let busy = false;
    async function tick() {
      if (busy || document.visibilityState !== "visible") return;
      busy = true;
      try {
        const r = await refreshChecksAction();
        // A newer check (from here, another tab or the 5-minute job): show it
        if (r.runId && r.runId !== shown.current) {
          shown.current = r.runId;
          router.refresh();
        }
      } catch {
        // offline for a moment
      } finally {
        busy = false;
      }
    }
    void tick();
    const timer = window.setInterval(tick, EVERY_MS);
    return () => window.clearInterval(timer);
  }, [router]);
  return null;
}

export function ReportLink({ id }: { id: string }) {
  return (
    <a
      href={`/admin/system/reports/${id}`}
      download
      className="inline-flex min-h-11 items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
    >
      <Download className="size-4" aria-hidden="true" />
      Report
    </a>
  );
}
