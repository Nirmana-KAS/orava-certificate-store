import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { SkipLink } from "@/components/layout/skip-link";
import { site } from "@/lib/site";

import "./globals.css";

function siteUrl(): URL {
  if (process.env.NEXT_PUBLIC_SITE_URL) return new URL(process.env.NEXT_PUBLIC_SITE_URL);
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return new URL(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);
  }
  return new URL("http://localhost:3000");
}

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: {
    default: site.name,
    template: `%s · ${site.name}`,
  },
  description: site.description,
  applicationName: site.name,
  authors: [{ name: site.developer }],
  creator: site.developer,
  publisher: site.company,
  // Private company app: keep it out of search engines
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: site.shortName, statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
  colorScheme: "light",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Reading headers renders every page per request, so each gets its own CSP nonce (see proxy.ts)
  await headers();
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} h-full bg-white`}>
      <body className="flex min-h-full flex-col bg-white">
        <SkipLink />
        <SiteHeader />
        <main id="main" className="flex w-full flex-1 flex-col">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
