import type { Metadata, Viewport } from "next";
import "./globals.css";
import Chrome from "@/components/Chrome";

export const metadata: Metadata = {
  title: "Nitya",
  description: "A ledger kept in one book, under many heads.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Nitya", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f1ece1" },
    { media: "(prefers-color-scheme: dark)",  color: "#17130e" },
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
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&display=swap"
        />
      </head>
      <body>
        <Chrome>{children}</Chrome>
      </body>
    </html>
  );
}
