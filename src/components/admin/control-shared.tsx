"use client";

import {
  Ban,
  CircleCheck,
  Eye,
  LoaderCircle,
  PauseCircle,
  TriangleAlert,
  Undo2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { PasswordInput } from "@/components/forms/password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { undoAction, type ActionResult } from "@/lib/admin/control-actions";
import { STATE_LABEL, type SectionView, type SwitchState } from "@/lib/system/switches";
import { cn } from "@/lib/utils";

/** Colour, icon and text for each state: never colour alone. */
export const LOOK: Record<
  SectionView,
  { dot: string; line: string; box: string; text: string; Icon: typeof Ban; label: string }
> = {
  on: {
    dot: "bg-success",
    line: "#1d7a46",
    box: "border-success/40",
    text: "text-success",
    Icon: CircleCheck,
    label: "On",
  },
  readonly: {
    dot: "bg-primary",
    line: "#1d4ed8",
    box: "border-primary/50 bg-primary/5",
    text: "text-primary",
    Icon: Eye,
    label: "Read-only",
  },
  hold: {
    dot: "bg-warning",
    line: "#9a5b00",
    box: "border-warning/60 bg-warning/5",
    text: "text-warning",
    Icon: PauseCircle,
    label: "Hold",
  },
  down: {
    dot: "bg-destructive",
    line: "#c62828",
    box: "border-destructive/60 bg-destructive/5",
    text: "text-destructive",
    Icon: Ban,
    label: "Down",
  },
  affected: {
    dot: "bg-muted-foreground/60",
    line: "#6b7280",
    box: "border-dashed border-muted-foreground/50 bg-muted/40",
    text: "text-muted-foreground",
    Icon: TriangleAlert,
    label: "Affected",
  },
};

export function StatePill({ view, className }: { view: SectionView; className?: string }) {
  const l = LOOK[view];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-semibold whitespace-nowrap",
        l.text,
        className,
      )}
      data-state={view}
    >
      <l.Icon className="size-3.5" aria-hidden="true" />
      {l.label}
    </span>
  );
}

/** On / Read-only / Hold / Down buttons, with the current one pressed. */
export function StateButtons({
  states,
  current,
  onPick,
  name,
  small = false,
}: {
  states: readonly SwitchState[];
  current: SwitchState;
  onPick: (s: SwitchState) => void;
  name: string;
  small?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label={`Switch ${name}`}
      className={cn(
        small
          ? "nodrag nopan flex flex-wrap gap-1.5"
          : cn(
              "grid gap-1.5 sm:flex sm:flex-wrap",
              states.length === 4 ? "grid-cols-2 min-[400px]:grid-cols-4" : "grid-cols-3",
            ),
      )}
    >
      {states.map((s) => {
        const l = LOOK[s];
        const pressed = current === s;
        return (
          <button
            key={s}
            type="button"
            aria-pressed={pressed}
            onClick={(e) => {
              e.stopPropagation();
              onPick(s);
            }}
            className={cn(
              "inline-flex cursor-pointer items-center justify-center gap-1 rounded-md border font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              small
                ? "min-h-9 min-w-9 px-1.5 text-[11px]"
                : "min-h-11 min-w-11 px-2 text-sm sm:px-3",
              pressed
                ? cn("border-current", l.text, s === "on" ? "bg-success/10" : "bg-background")
                : "border-input bg-background text-muted-foreground hover:bg-accent",
            )}
            data-testid={`pick-${name}-${s}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-")}
          >
            {small ? null : <l.Icon className="size-4" aria-hidden="true" />}
            {STATE_LABEL[s]}
          </button>
        );
      })}
    </div>
  );
}

const BACK_ON = [
  { value: "", label: "Not automatically" },
  { value: "15", label: "In 15 minutes" },
  { value: "30", label: "In 30 minutes" },
  { value: "60", label: "In 1 hour" },
  { value: "120", label: "In 2 hours" },
  { value: "240", label: "In 4 hours" },
  { value: "480", label: "In 8 hours" },
  { value: "1440", label: "In 1 day" },
  { value: "at", label: "At a time I pick" },
];

/** "Back on at": a choice of delays, or a date and time on this device. */
export function BackOnField({
  id,
  value,
  at,
  onChange,
  onAt,
}: {
  id: string;
  value: string;
  at: string;
  onChange: (v: string) => void;
  onAt: (v: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>Switch back on</Label>
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {BACK_ON.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
      {value === "at" ? (
        <Input
          type="datetime-local"
          aria-label="Back on at (your device's time)"
          value={at}
          onChange={(e) => onAt(e.target.value)}
        />
      ) : null}
    </div>
  );
}

/** The back-on choice as an ISO time, or null. */
export function backOnIso(value: string, at: string): string | null {
  if (!value) return null;
  if (value === "at") return at ? new Date(at).toISOString() : null;
  return new Date(Date.now() + Number(value) * 60_000).toISOString();
}

export function ReasonField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>Reason (for the change log)</Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={300}
        placeholder="e.g. Moving files to a new bucket"
        required
      />
    </div>
  );
}

/** For big actions: the Control passkey again and the word CONFIRM. */
export function ConfirmFields({
  id,
  passkey,
  confirm,
  onPasskey,
  onConfirm,
}: {
  id: string;
  passkey: string;
  confirm: string;
  onPasskey: (v: string) => void;
  onConfirm: (v: string) => void;
}) {
  return (
    <fieldset className="grid gap-4 rounded-lg border-2 border-destructive/40 bg-destructive/5 p-3 sm:p-4">
      <legend className="px-1 text-sm font-semibold text-destructive">
        Big change: confirm it
      </legend>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-passkey`}>Control passkey</Label>
        <div className="relative">
          <PasswordInput
            id={`${id}-passkey`}
            autoComplete="current-password"
            value={passkey}
            onChange={(e) => onPasskey(e.target.value)}
          />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-confirm`}>Type CONFIRM</Label>
        <Input
          id={`${id}-confirm`}
          value={confirm}
          onChange={(e) => onConfirm(e.target.value)}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
        />
      </div>
    </fieldset>
  );
}

// ── Results and the 5-second Undo ─────────────────────────────────────────────────

type Toast = { message: string; undoId?: string | null; error?: boolean };

const ToastContext = React.createContext<(t: Toast) => void>(() => {});

export function useToast() {
  return React.useContext(ToastContext);
}

/**
 * Shows the result of each switch at the bottom of the screen, with Undo for 5 seconds. Above
 * the phone tab bar, and announced to screen readers.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [toast, setToast] = React.useState<Toast | null>(null);
  const [left, setLeft] = React.useState(0);
  const [pending, start] = React.useTransition();

  React.useEffect(() => {
    if (!toast) return;
    const timer = window.setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    const close = window.setTimeout(() => setToast(null), toast.undoId ? 8000 : 6000);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(close);
    };
  }, [toast]);

  const show = React.useCallback((t: Toast) => {
    setToast(t);
    setLeft(5);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-4 lg:bottom-6"
      >
        {toast ? (
          <div
            className={cn(
              "pointer-events-auto flex w-full max-w-lg flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border bg-background px-4 py-3 text-sm shadow-lg",
              toast.error ? "border-destructive/50" : "border-success/50",
            )}
            role={toast.error ? "alert" : "status"}
            data-testid="control-toast"
          >
            <span className={cn("min-w-0 flex-1 wrap-anywhere", toast.error && "text-destructive")}>
              {toast.message}
            </span>
            {toast.undoId && left > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await undoAction(toast.undoId!);
                    setToast(r.ok ? { message: r.message } : { message: r.error, error: true });
                    router.refresh();
                  })
                }
              >
                {pending ? <LoaderCircle className="animate-spin" /> : <Undo2 />}
                Undo ({left})
              </Button>
            ) : null}
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Close"
              onClick={() => setToast(null)}
            >
              <X />
            </Button>
          </div>
        ) : null}
      </div>
    </ToastContext.Provider>
  );
}

/** Runs a Control Center action, shows its result, and reloads the page (or locks it). */
export function useRunAction() {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = React.useTransition();
  const run = React.useCallback(
    (fn: () => Promise<ActionResult>, after?: (r: ActionResult) => void) =>
      start(async () => {
        const r = await fn();
        if (r.ok) toast({ message: r.message, undoId: r.undoId });
        else if (!r.needConfirm) toast({ message: r.error, error: true });
        after?.(r);
        router.refresh();
      }),
    [router, toast],
  );
  return { run, pending };
}
