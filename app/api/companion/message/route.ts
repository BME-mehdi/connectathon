import { NextResponse } from "next/server";

/**
 * POST /api/companion/message
 *
 * Stub endpoint for the WHO lifestyle companion chat.
 * The real logic is being built by another team — swap this return
 * for a real HTTP call to their service when ready.
 *
 * Contract (agreed with companion team):
 *   Request:  { message: string, household_id: string, locale: 'fr' | 'ar' }
 *   Response: { reply: string, sources?: string[] }
 */
export async function POST() {
  // TODO: replace stub with real companion service call
  // const body = await req.json();
  // const response = await fetch(process.env.COMPANION_SERVICE_URL!, { ... });

  return NextResponse.json({
    reply:
      "Le service d'accompagnement est en cours de finalisation. En attendant, consultez votre médecin ou pharmacien pour toute question de santé.",
    sources: [],
  });
}
