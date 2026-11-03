import { Award, FileText, Gem, ScrollText, ShieldCheck, Stamp, Table2 } from "lucide-react";

const icons = {
  "file-text": FileText,
  gem: Gem,
  award: Award,
  "shield-check": ShieldCheck,
  table: Table2,
  stamp: Stamp,
  scroll: ScrollText,
} as const;

/** The icon chosen for a certificate type, in the type's colour. */
export function TypeIcon({ name, color }: { name: string; color: string }) {
  const Icon = icons[name as keyof typeof icons] ?? FileText;
  return (
    <span
      className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg"
      style={{ backgroundColor: `${color}1a`, color }}
      aria-hidden="true"
    >
      <Icon className="size-5" />
    </span>
  );
}
