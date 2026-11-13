"use client";

import "@xyflow/react/dist/style.css";

import {
  Background,
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type EdgeProps,
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
        "w-[220px] cursor-pointer rounded-xl border-2 bg-background px-3.5 py-3 shadow-sm transition-shadow hover:shadow-md",
        TONE[data.status].box,
        data.selected && "ring-2 ring-primary ring-offset-2",
      )}
      data-testid={`map-part-${data.id}`}
    >
      {HANDLES.map(({ id, side, at }) => (
        <React.Fragment key={id}>
          <Handle
            type="target"
            id={`${id}-in`}
            position={POS[side]}
            style={side === "l" || side === "r" ? { top: `${at}%` } : { left: `${at}%` }}
            className={handle}
            isConnectable={false}
          />
          <Handle
            type="source"
            id={`${id}-out`}
            position={POS[side]}
            style={side === "l" || side === "r" ? { top: `${at}%` } : { left: `${at}%` }}
            className={handle}
            isConnectable={false}
          />
        </React.Fragment>
      ))}
      <div className="flex items-start justify-between gap-2">
        <p className="text-base leading-tight font-semibold">{c.name}</p>
        <span
          className={cn("mt-1 size-2.5 shrink-0 rounded-full", TONE[data.status].dot)}
          aria-hidden="true"
        />
      </div>
      <p className="truncate text-xs text-muted-foreground">{c.provider}</p>
      <p className={cn("mt-1 truncate text-sm font-medium", TONE[data.status].text)}>
        {data.status === "ok" || data.status === "off" ? data.summary : STATUS_LABEL[data.status]}
      </p>
    </div>
  );
}

const POS = { l: Position.Left, r: Position.Right, t: Position.Top, b: Position.Bottom };
const nodeTypes = { part: PartNode };

type LineData = {
  label: string;
  color: string;
  offset: number;
  /** Where the tag goes: the path centre, the last straight piece, or the first one. */
  labelAt?: "center" | "target" | "source";
  /** For lines that share a trunk: how far from the start box the trunk runs. */
  trunk?: number;
};

/**
 * A line with its name in a small white tag. The tag sits in the gap between boxes (or, for
 * lines that turn a corner, on the last straight piece) so it never covers a box.
 */
function LabelledEdge(props: EdgeProps<Edge<LineData>>) {
  const { data, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition } = props;
  const [path, cx, cy] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 10,
    offset: data?.offset ?? 24,
    centerX: data?.trunk === undefined ? undefined : sourceX + data.trunk,
  });
  const turnX = data?.trunk === undefined ? (sourceX + targetX) / 2 : sourceX + data.trunk;
  const at = data?.labelAt ?? "center";
  const x = at === "target" ? (turnX + targetX) / 2 : at === "source" ? (sourceX + targetX) / 2 : cx;
  const y = at === "target" ? targetY : at === "source" ? sourceY : cy;
  return (
    <>
      <BaseEdge
        id={props.id}
        path={path}
        style={props.style}
        interactionWidth={props.interactionWidth}
      />
      {data?.label ? (
        <EdgeLabelRenderer>
          <div
            className="pointer-events-none absolute rounded-md border bg-background px-1.5 py-0.5 text-[11px] leading-none font-semibold whitespace-nowrap shadow-xs"
            style={{
              transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`,
              // The grey line colour is too light for text on white (WCAG AA).
              color: data.color === "#9ca3af" ? "#4b5563" : data.color,
              borderColor: data.color,
              opacity: props.style?.opacity,
            }}
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

const edgeTypes = { labelled: LabelledEdge };

/** Joining points on each side of a box: at a quarter, half and three quarters. */
const HANDLES = (["l", "r", "t", "b"] as const).flatMap((side) =>
  [25, 50, 75].map((at) => ({ id: `${side}${at}`, side, at })),
);

/** Space between boxes, so every line can be followed by eye. */
const COL = 340;
const ROW = 160;
/** Extra room before the services column, so the four line names fit beside their boxes. */
const SERVICES_GAP = 110;

/** Which sides of the two boxes a line joins. */
function route(c: (typeof CONNECTIONS)[number]): {
  from: string;
  to: string;
  offset?: number;
  labelAt?: "center" | "target" | "source";
  trunk?: number;
} {
  // Runs under the middle row, from the Browsers straight to File storage
  if (c.id === "browser-storage") return { from: "b25", to: "b50", offset: 30 };
  // Leaves the Browsers from below, so its label sits on its own short line
  if (c.id === "browser-reader") return { from: "b75", to: "l50", labelAt: "target" };
  // Drops down into the top of the App server, so it doesn't cross the "Requests" line
  if (c.id === "scheduler-app") return { from: "b50", to: "t25" };
  // The App server's four services share one line close to the App server; each tag sits
  // on its own short line between that shared line and its box, so nothing overlaps
  if (c.from === "app" && COMPONENT_BY_ID[c.to].at[0] === 3) {
    return { from: "r50", to: "l50", labelAt: "target", trunk: 30 };
  }
  const [fx, fy] = COMPONENT_BY_ID[c.from].at;
  const [tx, ty] = COMPONENT_BY_ID[c.to].at;
  if (fx === tx) return fy < ty ? { from: "b50", to: "t50" } : { from: "t50", to: "b50" };
  return fx < tx ? { from: "r50", to: "l50" } : { from: "l50", to: "r50" };
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
    position: { x: c.at[0] * COL + (c.at[0] === 3 ? SERVICES_GAP : 0), y: c.at[1] * ROW },
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
    const r = route(c);
    const picked = selected?.kind === "link" && selected.id === c.id;
    return {
      id: c.id,
      source: c.from,
      target: c.to,
      sourceHandle: `${r.from}-out`,
      targetHandle: `${r.to}-in`,
      type: "labelled",
      data: {
        label: c.short ?? c.label,
        color: TONE[s].line,
        offset: r.offset ?? 24,
        labelAt: r.labelAt,
        trunk: r.trunk,
      },
      // Moving dashes show something flowing
      animated: s === "ok",
      ariaLabel: `${COMPONENT_BY_ID[c.from].name} to ${COMPONENT_BY_ID[c.to].name}, ${c.label}: ${STATUS_LABEL[s]}`,
      style: {
        stroke: TONE[s].line,
        strokeWidth: picked ? 4 : 2,
        strokeDasharray: s === "fail" ? "6 4" : undefined,
        opacity: selected && !picked ? 0.45 : 1,
      },
      interactionWidth: 28,
    };
  });

  return (
    <div
      className="aspect-[2.1/1] max-h-[620px] min-h-[360px] w-full overflow-hidden rounded-xl border bg-background"
      data-testid="system-diagram"
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.06 }}
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
        attributionPosition="bottom-left"
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
        <span className="text-xs text-muted-foreground">
          Tap a box or a line to see what it does and what it carries.
        </span>
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
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start">
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
