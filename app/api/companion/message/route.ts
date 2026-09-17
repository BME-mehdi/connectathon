import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/companion/message
 *
 * WHO-grounded lifestyle companion — calls a local Ollama instance running
 * medgemma. Scope is deliberately narrow (see SYSTEM_PROMPT): lifestyle
 * guidance only, never a diagnosis, never a substitute for a clinician.
 *
 * Never forward individual screening data (scores, tiers, family member
 * records) here — only the free-text conversation. See COMPANION_API_CONTRACT.md.
 *
 * Request:  { message: string, history?: { role: "user"|"assistant"; content: string }[] }
 * Response: { reply: string }
 */

const SYSTEM_PROMPT = `Tu es un assistant de mode de vie pour la prévention du diabète de type 2, dans une application de dépistage familial en Tunisie. Tes recommandations s'appuient sur les principes de l'OMS en matière d'alimentation, d'activité physique et de gestion du stress.

Règles strictes :
- Tu ne poses JAMAIS de diagnostic médical et ne dis jamais à quelqu'un s'il a ou non le diabète.
- Tu ne prescris et ne recommandes JAMAIS de médicament ou de traitement.
- Tu n'interprètes jamais un score de risque individuel — tu ne le connais pas et tu ne dois pas en demander.
- Rappelle, explicitement ou implicitement, que tes réponses ne remplacent pas l'avis d'un professionnel de santé, en particulier pour toute question inquiétante ou urgente — oriente alors vers un médecin.
- Réponds dans la langue utilisée par la personne (français par défaut), de façon brève, claire, chaleureuse et rassurante. Pas de jargon inutile.
- Réponds directement. Ne détaille pas ton raisonnement étape par étape avant de répondre.`;

const MAX_HISTORY_MESSAGES = 12;
// This model "thinks" out loud before answering, wrapping the reasoning and
// the final answer in <unusedNN> marker tokens (e.g.
// "<unused94> thought\n...reasoning...<unused95>actual answer"). Generation
// runs well past the old 30s timeout — bump both.
const OLLAMA_TIMEOUT_MS = 120_000;
const MAX_TOKENS = 512;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Strips a model's "thinking" preamble, keeping only the text after the
 * last <unusedNN> marker (the final answer). If there's no clear
 * think/answer split, just strips any stray marker tokens. */
function extractReply(raw: string): string {
  const markers = [...raw.matchAll(/<unused\d+>\s*/g)];
  if (markers.length >= 2) {
    const last = markers[markers.length - 1];
    return raw.slice((last.index ?? 0) + last[0].length).trim();
  }
  return raw.replace(/<unused\d+>\s*/g, "").trim();
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const history: ChatMessage[] = Array.isArray(body?.history)
    ? body.history
        .filter((m: unknown): m is ChatMessage =>
          !!m && typeof m === "object" &&
          (m as ChatMessage).role !== undefined &&
          ["user", "assistant"].includes((m as ChatMessage).role) &&
          typeof (m as ChatMessage).content === "string"
        )
        .slice(-MAX_HISTORY_MESSAGES)
    : [];

  const baseUrl = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
  const model = process.env.OLLAMA_MODEL ?? "medgemma";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

  try {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: false,
        options: { temperature: 0.3, num_predict: MAX_TOKENS },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...history,
          { role: "user", content: message },
        ],
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("[companion] Ollama error", res.status, detail);
      return NextResponse.json(
        { error: "Le service d'accompagnement est momentanément indisponible." },
        { status: 503 }
      );
    }

    const data = await res.json();
    const reply = extractReply(data?.message?.content ?? "");
    if (!reply) {
      return NextResponse.json(
        { error: "Le service d'accompagnement est momentanément indisponible." },
        { status: 503 }
      );
    }

    return NextResponse.json({ reply });
  } catch (err) {
    console.error("[companion] Ollama unreachable", err);
    return NextResponse.json(
      { error: "Le service d'accompagnement est momentanément indisponible." },
      { status: 503 }
    );
  } finally {
    clearTimeout(timeout);
  }
}
