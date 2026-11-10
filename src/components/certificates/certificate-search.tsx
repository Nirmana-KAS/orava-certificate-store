import Link from "next/link";
import { ChevronLeft, ChevronRight, FileText, Search, SlidersHorizontal, X } from "lucide-react";

import { LabLogo } from "@/components/admin/lab-logo";
import { TypeIcon } from "@/components/admin/type-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  activeFilterCount,
  filtersHref,
  PAGE_SIZE,
  SORTS,
  type Filters,
} from "@/lib/certificates/filters";
import { CATEGORY_LABELS } from "@/lib/labs";
import { logoUrl } from "@/lib/server/labs";
import { filterOptions, searchCertificates, type FilterOptions } from "@/lib/server/search";

/**
 * Search box, filters, sorting and the matching certificates, one page at a time. Everything is
 * in the page address (a plain GET form), so it works without JavaScript and can be bookmarked.
 * `base` is the list's own address; each result opens at `${detailBase}/<id>`.
 */
export async function CertificateSearch({
  filters: f,
  base,
  detailBase,
  showReview = false,
}: {
  filters: Filters;
  base: string;
  detailBase: string;
  /** Show the "Check" badge for certificates read automatically (admin and uploaders) */
  showReview?: boolean;
}) {
  const [{ rows, total }, options] = await Promise.all([searchCertificates(f), filterOptions()]);
  const more = activeFilterCount(f);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const first = total === 0 ? 0 : (f.page - 1) * PAGE_SIZE + 1;
  const last = Math.min(total, f.page * PAGE_SIZE);

  // Chips for the filters in use, each with its own "remove"
  const chips: { label: string; without: Partial<Filters> }[] = [];
  const labName = options.labs.find((l) => l.id === f.lab)?.name;
  const typeName = options.types.find((t) => t.id === f.type)?.name;
  if (f.lab) chips.push({ label: `Lab: ${labName ?? "?"}`, without: { lab: undefined } });
  if (f.category)
    chips.push({ label: CATEGORY_LABELS[f.category], without: { category: undefined } });
  if (f.type) chips.push({ label: `Type: ${typeName ?? "?"}`, without: { type: undefined } });
  if (f.gem) chips.push({ label: `Stone: ${f.gem}`, without: { gem: undefined } });
  if (f.origin) chips.push({ label: `Origin: ${f.origin}`, without: { origin: undefined } });
  if (f.from) chips.push({ label: `From ${f.from}`, without: { from: undefined } });
  if (f.to) chips.push({ label: `To ${f.to}`, without: { to: undefined } });
  if (f.min !== undefined)
    chips.push({ label: `At least ${f.min} ct`, without: { min: undefined } });
  if (f.max !== undefined)
    chips.push({ label: `At most ${f.max} ct`, without: { max: undefined } });

  return (
    <section aria-label="Find certificates">
      <form
        // A new form for each address, so the boxes show the filters in use after a chip is
        // removed or a page link is followed (the browser would otherwise keep old choices)
        key={filtersHref(base, f)}
        method="get"
        action={base}
        role="search"
        className="mb-4 grid gap-3"
      >
        <div className="grid gap-2">
          <Label htmlFor="q">Search</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="q"
                name="q"
                type="search"
                defaultValue={f.q ?? ""}
                placeholder="Report number, stone, customer…"
                className="pl-9"
                autoComplete="off"
              />
            </div>
            <Button type="submit" className="sm:w-auto">
              <Search /> Search
            </Button>
          </div>
        </div>

        <details
          className="group rounded-xl border"
          open={more > 0 || f.then !== undefined || f.sort !== "added_desc"}
        >
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
            <SlidersHorizontal className="size-4" aria-hidden="true" />
            More filters and sorting
            {more > 0 ? <Badge>{more} in use</Badge> : null}
            <ChevronRight
              className="ml-auto size-4 transition-transform group-open:rotate-90"
              aria-hidden="true"
            />
          </summary>
          <div className="grid gap-4 border-t p-4 sm:grid-cols-2 lg:grid-cols-3">
            <FilterFields filters={f} options={options} />
            <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-3">
              <Button type="submit">Apply</Button>
              <Button asChild variant="outline">
                <Link href={base}>Clear all</Link>
              </Button>
            </div>
          </div>
        </details>
      </form>

      {chips.length > 0 ? (
        <ul className="mb-4 flex flex-wrap gap-2" aria-label="Filters in use">
          {chips.map((c) => (
            <li key={c.label}>
              <Link
                href={filtersHref(base, f, { ...c.without, page: 1 })}
                className="inline-flex min-h-11 items-center gap-1 rounded-full border bg-secondary px-3 text-sm hover:bg-accent"
                aria-label={`Remove filter ${c.label}`}
              >
                <span className="wrap-anywhere">{c.label}</span>
                <X className="size-4 shrink-0" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="mb-3 text-sm text-muted-foreground" role="status">
        {total === 0
          ? "No certificates found."
          : `Showing ${first}–${last} of ${total} certificate${total === 1 ? "" : "s"}.`}
      </p>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center">
          <FileText className="size-10 text-primary" aria-hidden="true" />
          <p className="max-w-md text-sm text-muted-foreground">
            {f.q || more > 0
              ? "Nothing matches. Try fewer words or remove a filter."
              : "No certificates have been added yet."}
          </p>
        </div>
      ) : (
        <ul className="grid gap-3" data-testid="results">
          {rows.map((r) => (
            <li key={r.id}>
              <Card className="gap-3 py-4">
                <CardContent className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
                  <div className="flex min-w-0 items-start gap-3">
                    {r.lab_id ? (
                      <LabLogo
                        src={logoUrl(
                          r.lab_id,
                          r.lab_logo_version === null ? null : Number(r.lab_logo_version),
                        )}
                        name={r.lab ?? ""}
                      />
                    ) : (
                      <TypeIcon name={r.type_icon} color={r.type_color} />
                    )}
                    <div className="min-w-0">
                      <p className="font-medium break-words">{r.title}</p>
                      <p className="text-sm break-words text-muted-foreground">
                        {[r.type_name, r.report_date].filter(Boolean).join(" · ")}
                      </p>
                      <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                        {r.report_no ? <Fact label="Report">{r.report_no}</Fact> : null}
                        {r.identification ? <Fact label="Stone">{r.identification}</Fact> : null}
                        {r.weight_ct ? (
                          <Fact label="Weight">{`${Number(r.weight_ct)} ct`}</Fact>
                        ) : null}
                        {r.origin ? <Fact label="Origin">{r.origin}</Fact> : null}
                        {r.customer ? <Fact label="Customer">{r.customer}</Fact> : null}
                      </dl>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {showReview && r.needs_review ? (
                          <Badge variant="warning">Check</Badge>
                        ) : null}
                        {r.files > 0 ? (
                          <Badge variant="success">
                            {r.files} file{r.files === 1 ? "" : "s"}
                          </Badge>
                        ) : (
                          <Badge variant="warning">No file yet</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 md:justify-end">
                    {r.first_file ? (
                      <Button asChild variant="outline" size="sm">
                        <a
                          href={`/api/files/${r.first_file}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Open PDF of ${r.title} (new tab)`}
                        >
                          Open PDF
                        </a>
                      </Button>
                    ) : null}
                    <Button asChild variant="outline" size="sm">
                      <Link href={`${detailBase}/${r.id}`} aria-label={`Details of ${r.title}`}>
                        Details
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 ? (
        <nav aria-label="Pages" className="mt-6 flex items-center justify-between gap-2">
          {f.page > 1 ? (
            <Button asChild variant="outline">
              <Link href={filtersHref(base, f, { page: f.page - 1 })}>
                <ChevronLeft /> Previous
              </Link>
            </Button>
          ) : (
            <span />
          )}
          <span className="text-sm text-muted-foreground">
            Page {f.page} of {pages}
          </span>
          {f.page < pages ? (
            <Button asChild variant="outline">
              <Link href={filtersHref(base, f, { page: f.page + 1 })}>
                Next <ChevronRight />
              </Link>
            </Button>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </section>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 gap-1">
      <dt className="text-muted-foreground">{label}:</dt>
      <dd className="font-medium wrap-anywhere">{children}</dd>
    </div>
  );
}

function FilterSelect({
  id,
  label,
  value,
  emptyLabel = "All",
  children,
}: {
  id: string;
  label: string;
  value: string | undefined;
  emptyLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Select id={id} name={id} defaultValue={value ?? ""}>
        <option value="">{emptyLabel}</option>
        {children}
      </Select>
    </div>
  );
}

/** The filter and sort boxes, shared by the search and the report builder. */
export function FilterFields({
  filters: f,
  options,
}: {
  filters: Filters;
  options: FilterOptions;
}) {
  return (
    <>
      <FilterSelect id="lab" label="Lab" value={f.lab}>
        {options.labs.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </FilterSelect>
      <FilterSelect id="category" label="Kind of report" value={f.category}>
        {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </FilterSelect>
      <FilterSelect id="type" label="Certificate type" value={f.type}>
        {options.types.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </FilterSelect>
      <FilterSelect id="gem" label="Stone (identification)" value={f.gem}>
        {options.gems.map((g) => (
          <option key={g} value={g}>
            {g}
          </option>
        ))}
      </FilterSelect>
      <FilterSelect id="origin" label="Origin" value={f.origin}>
        {options.origins.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </FilterSelect>
      {/* Two date boxes side by side only where both fit (a date box needs about 150 px) */}
      <div className="@container">
        <div className="grid gap-3 @xs:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="from">Date from</Label>
            <Input id="from" name="from" type="date" defaultValue={f.from ?? ""} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="to">Date to</Label>
            <Input id="to" name="to" type="date" defaultValue={f.to ?? ""} />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label htmlFor="min">Carats from</Label>
          <Input
            id="min"
            name="min"
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            defaultValue={f.min ?? ""}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="max">Carats to</Label>
          <Input
            id="max"
            name="max"
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            defaultValue={f.max ?? ""}
          />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="sort">Sort by</Label>
        <Select id="sort" name="sort" defaultValue={f.sort}>
          {Object.entries(SORTS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
      </div>
      <FilterSelect id="then" label="Then by" value={f.then} emptyLabel="Nothing">
        {Object.entries(SORTS).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </FilterSelect>
    </>
  );
}
