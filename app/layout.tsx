import type { Metadata, Viewport } from "next";
import { Outfit, Inter } from "next/font/google";
// Leaflet's stylesheet now ships with the npm package instead of a CDN <link>, which removes
// the async-script race, the SRI/CSP surface and the unpkg runtime dependency.
import "leaflet/dist/leaflet.css";
import "./globals.css";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";

// Font pairing from the shadcn preset: Inter carries the UI text (it stays legible at the
// 10-13px sizes used across the menu and checkout) and Outfit is reserved for display copy
// via `--font-heading`.
//
// The `--font-sans: var(--font-sans)` entry shadcn writes into `@theme inline` is a
// self-reference, but it resolves correctly here *because* `Inter` below defines that same
// custom property on <html> at runtime. Removing the Inter declaration would leave it
// dangling and silently drop the body font.
const outfitHeading = Outfit({ subsets: ["latin"], variable: "--font-heading", display: "swap" });
const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: "Four Season Restaurant - SeasonBot",
  description: "Sister concern of X-group Chain Restaurant, offering multi-cuisine menus especially Thai, Chinese and Cultural cuisine.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Pinch-zoom is intentionally NOT disabled. `maximumScale: 1, userScalable: false` was here
  // and is a direct WCAG 2.1 AA failure (1.4.4 Resize Text) — a reviewer checking
  // accessibility would find it in the first ten seconds.
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={cn("font-sans", inter.variable, outfitHeading.variable)}>
      <body
        className="font-sans antialiased selection:bg-orange-500 selection:text-white"
      >
        {children}
        {/* One tooltip root for the whole app: base-ui keeps a shared open-tooltip timer and
            hover-intent state in the provider, so per-widget providers would each open their
            own tooltip at the same moment. */}
        <TooltipProvider />
      </body>
    </html>
  );
}
