"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Activity, Menu } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from "@/components/ui/sheet";

const NAV_LINKS = [
  { href: "/onboarding/members", label: "Foyer" },
  { href: "/screening", label: "Dépistage" },
  { href: "/referral", label: "Orientations" },
  { href: "/referral/pharmacist", label: "Laboratory Results" },
];

export default function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, [pathname]);

  if (pathname?.startsWith("/auth")) return null;

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    setOpen(false);
    router.push("/auth/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/90 backdrop-blur supports-backdrop-filter:bg-card/70">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
        <Link href="/onboarding" className="flex items-center gap-2 shrink-0">
          <span className="flex size-8 items-center justify-center rounded-lg bg-hero-gradient text-white">
            <Activity className="size-4" strokeWidth={2} />
          </span>
          <span className="text-sm font-heading font-bold text-primary">
            DIABSCORE
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map((link) => {
            const active = pathname?.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-secondary text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden md:flex items-center gap-3 shrink-0">
          {email && (
            <span className="text-xs text-muted-foreground max-w-40 truncate">{email}</span>
          )}
          <Button variant="outline" size="sm" onClick={handleSignOut}>
            Déconnexion
          </Button>
        </div>

        <Sheet open={open} onOpenChange={setOpen}>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setOpen(true)}
            aria-label="Ouvrir le menu"
          >
            <Menu className="size-5" />
          </Button>
          <SheetContent side="left" className="w-72">
            <SheetHeader>
              <SheetTitle>DIABSCORE</SheetTitle>
            </SheetHeader>
            <nav className="flex flex-col gap-1 px-4">
              {NAV_LINKS.map((link) => {
                const active = pathname?.startsWith(link.href);
                return (
                  <SheetClose
                    key={link.href}
                    nativeButton={false}
                    render={
                      <Link
                        href={link.href}
                        className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                          active
                            ? "bg-secondary text-primary"
                            : "text-foreground hover:bg-muted"
                        }`}
                      >
                        {link.label}
                      </Link>
                    }
                  />
                );
              })}
            </nav>
            <div className="mt-auto flex flex-col gap-2 border-t border-border p-4">
              {email && <span className="text-xs text-muted-foreground truncate">{email}</span>}
              <Button variant="outline" size="sm" onClick={handleSignOut}>
                Déconnexion
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
