import * as React from "react";

import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";

export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-8 sm:py-12">
      <Card>
        <CardHeader>
          <h1 className="text-lg leading-tight font-semibold">{title}</h1>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
      {footer ? (
        <div className="mt-4 text-center text-sm text-muted-foreground">{footer}</div>
      ) : null}
    </div>
  );
}
