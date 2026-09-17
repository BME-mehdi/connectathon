import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // Check if household already exists
  const { data: household } = await supabase
    .from("households")
    .select("id")
    .eq("owner_user_id", user.id)
    .single();

  if (household) redirect("/screening");

  return (
    <div className="min-h-screen bg-hero-wash flex items-center justify-center p-4">
      <div className="max-w-lg w-full bg-card rounded-2xl shadow-soft border border-border p-8 space-y-6">
        <div>
          <h1 className="text-2xl">
            Créer votre foyer
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Commencez le dépistage familial du diabète de type 2
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/onboarding/create"
            className="flex-1 text-center rounded-lg bg-primary text-primary-foreground py-2 text-sm font-medium hover:bg-primary/80 transition-colors"
          >
            Créer un foyer
          </Link>
        </div>
      </div>
    </div>
  );
}
