import type { Metadata } from "next";
import { LockKeyhole, Mail, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Sign in",
};

export default function SignInPage() {
  return (
    <div className="mx-auto grid w-full max-w-7xl flex-1 items-center gap-10 px-4 py-8 sm:px-6 sm:py-12 lg:grid-cols-2 lg:gap-16 lg:px-8">
      <section aria-labelledby="intro-heading" className="max-w-xl">
        <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
          <ShieldCheck className="size-4" aria-hidden="true" />
          Permitted staff only
        </p>
        <h1
          id="intro-heading"
          className="text-[clamp(1.75rem,5vw+0.5rem,3rem)] leading-tight font-semibold tracking-tight text-balance"
        >
          {site.name}
        </h1>
        <p className="mt-4 text-base text-pretty text-muted-foreground sm:text-lg">
          Search, review and download company certificates in seconds. Every certificate shows its
          key points and a short summary.
        </p>
      </section>

      <Card className="w-full max-w-md justify-self-center lg:justify-self-end">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Use your company email and the shared passkey.</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Sign-in is connected in Phase 1; this form is the final layout */}
          <form className="grid gap-5" aria-describedby="preview-note">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="name@company.com"
                  className="pl-9"
                  required
                  disabled
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="passkey">Passkey</Label>
              <div className="relative">
                <LockKeyhole
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="passkey"
                  name="passkey"
                  type="password"
                  autoComplete="current-password"
                  className="pl-9"
                  required
                  disabled
                />
              </div>
            </div>
            <Button type="submit" size="lg" className="w-full" disabled>
              Sign in
            </Button>
            <p id="preview-note" role="note" className="text-center text-sm text-muted-foreground">
              Preview build: sign-in is switched on in the next update.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
