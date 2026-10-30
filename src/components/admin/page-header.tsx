import * as React from "react";

export function PageHeader({
  title,
  description,
}: {
  title: string;
  description?: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
      {description ? <p className="mt-1 text-muted-foreground">{description}</p> : null}
    </div>
  );
}
