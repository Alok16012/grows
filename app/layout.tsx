import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Toaster } from "sonner";

// Zavtoo's typeface. Weights limited to the ones the UI uses, to keep the
// font download small.
const poppins = Poppins({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: "CIMS - Inspection Management",
  description: "Quality Inspection Management System by Growus",
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.svg",
    apple: "/logo.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "CIMS",
  },
  formatDetection: {
    telephone: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${poppins.className} ${poppins.variable} font-sans`}>
        {/* Cache Bust: 1773724001 */}
        <Providers>
          {children}
          {/* mobileOffset keeps the toast inside the viewport on phones — the
            default top-right offset pushed a full-width toast 16px off the
            right edge, clipping its close button. */}
        <Toaster position="top-right" richColors mobileOffset={{ left: "16px", right: "16px", top: "16px" }} />
        </Providers>
      </body>
    </html>
  );
}
