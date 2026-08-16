import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ConvexClientProvider } from "@/components/ConvexClientProvider";
import { getToken } from "@/lib/auth-server";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "Tabulation — Competition Management Platform",
    template: "%s | Tabulation",
  },
  description:
    "Run events, score rounds, and rank participants with a secure, real-time tabulation platform for organizers, judges, and staff.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const token = await getToken();
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <ConvexClientProvider initialToken={token}>
          <TooltipProvider>
            {children}
          </TooltipProvider>
          <Toaster />
        </ConvexClientProvider>
      </body>
    </html>
  );
}
