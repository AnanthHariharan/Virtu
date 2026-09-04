import type { Metadata, Viewport } from "next";
import "./globals.css";
import Shell from "@/components/Shell";

export const metadata: Metadata = {
  title: "Virtu",
  description: "A personal operating system — rites, training, meals, reading, writing, work and measures, in one ledger.",
  manifest: "/manifest.webmanifest",
  applicationName: "Virtu",
  // statusBarStyle stays "default": iOS tints that bar from theme-color, which
  // is already declared per colour scheme, so the bar matches the paper in
  // both themes. "black-translucent" would render white status text over a
  // near-white ground in light mode.
  appleWebApp: { capable: true, title: "Virtu", statusBarStyle: "default" },
  other: {
    // Next emits the standardised name; current iOS drives standalone off the
    // manifest, but this costs a line and covers older devices.
    "apple-mobile-web-app-capable": "yes",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfbf9" },
    { media: "(prefers-color-scheme: dark)",  color: "#0c0c0b" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap"
        />
      </head>
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
