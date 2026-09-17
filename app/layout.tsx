import type { Metadata } from "next";
import { League_Spartan, Amaranth } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import TopNav from "@/components/nav/TopNav";
import CompanionPanel from "@/components/companion/CompanionPanel";

const leagueSpartan = League_Spartan({
  subsets: ["latin"],
  variable: "--font-heading",
  weight: ["600", "700", "800"],
});

const amaranth = Amaranth({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "700"],
});

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
    <html
      lang="fr"
      dir="ltr"
      className={cn("font-sans", leagueSpartan.variable, amaranth.variable)}
    >
      <body className="antialiased">
        <TopNav />
        {children}
        <CompanionPanel />
      </body>
    </html>
  );
}
