import type { Metadata } from "next";
import { Inter, Geist } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "T2D Family Screening | Connectathon 2026",
  description: "Family-based Type 2 Diabetes risk screening and referral platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" dir="ltr" className={cn("font-sans", geist.variable)}>
      <body className={inter.className}>
        {children}
      </body>
    </html>
  );
}
