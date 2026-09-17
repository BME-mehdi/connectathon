import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/companion/message
 *
 * WHO-grounded lifestyle companion — calls a local Ollama instance running
 * medgemma / medgemma1.5. Scope is deliberately narrow (see SYSTEM_PROMPT): lifestyle
 * guidance only, never a diagnosis, never a substitute for a clinician.
 *
 * If Ollama is offline or running on a cloud deployment (e.g. Vercel) where the
 * local daemon is unreachable, the route automatically serves tailored,
 * clinically validated WHO lifestyle prevention recommendations.
 *
 * Never forward individual screening data (scores, tiers, family member
 * records) here — only the free-text conversation. See COMPANION_API_CONTRACT.md.
 */

const SYSTEM_PROMPT = `Tu es un assistant de mode de vie pour la prévention du diabète de type 2, dans une application de dépistage familial en Tunisie. Tes recommandations s'appuient sur les principes de l'OMS en matière d'alimentation, d'activité physique et de gestion du stress.

Règles strictes :
- Tu ne poses JAMAIS de diagnostic médical et ne dis jamais à quelqu'un s'il a ou non le diabète.
- Tu ne prescris et ne recommandes JAMAIS de médicament ou de traitement.
- Tu n'interprètes jamais un score de risque individuel — tu ne le connais pas et tu ne dois pas en demander.
- Rappelle, explicitement ou implicitement, que tes réponses ne remplacent pas l'avis d'un professionnel de santé, en particulier pour toute question inquiétante ou urgente — oriente alors vers un médecin.
- Réponds dans la langue utilisée par la personne (français par défaut), de façon brève, claire, chaleureuse et rassurante. Pas de jargon inutile.
- Réponds directement. Ne détaille pas ton raisonnement étape par étape avant de répondre.`;

const MAX_HISTORY_MESSAGES = 10;
const OLLAMA_TIMEOUT_MS = 25_000;
const MAX_TOKENS = 280;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Strips a model's internal thinking markers (e.g. <unused94>thought ... <unused95>) */
function extractReply(raw: string): string {
  if (!raw) return "";

  // 1. If explicit thought closure token is present, extract answer after it
  const thoughtCloseMatch = raw.match(/(?:<unused95>|<\/thought>)\s*([\s\S]*)/i);
  if (thoughtCloseMatch && thoughtCloseMatch[1].trim()) {
    return thoughtCloseMatch[1]
      .replace(/<unused\d+>/g, "")
      .replace(/<start_of_turn>|<end_of_turn>/g, "")
      .trim();
  }

  // 2. If multiple unused markers exist, pick after the last marker
  const markers = [...raw.matchAll(/<unused\d+>\s*/g)];
  if (markers.length >= 2) {
    const last = markers[markers.length - 1];
    const candidate = raw.slice((last.index ?? 0) + last[0].length).trim();
    if (candidate) {
      return candidate
        .replace(/<start_of_turn>|<end_of_turn>/g, "")
        .trim();
    }
  }

  const cleaned = raw
    .replace(/<unused\d+>/g, "")
    .replace(/<start_of_turn>|<end_of_turn>/g, "")
    .trim();

  // 3. If output is purely internal thoughts without the answer, return empty
  if (/^thought\b/i.test(cleaned)) {
    const split = cleaned.split(/\n\s*\n/);
    const nonThought = split.filter(
      (p) => !/^(?:here'?s|thinking|1\.|2\.|-|\*|\bthought\b)/i.test(p.trim())
    );
    if (nonThought.length > 0) {
      return nonThought.join("\n\n").trim();
    }
    return "";
  }

  return cleaned;
}

/**
 * Intelligent WHO-grounded lifestyle recommendation fallback engine.
 * Used when Ollama is unreachable (e.g. on cloud platforms like Vercel)
 * or when local model generation fails.
 */
function getWhoLifestyleAdvice(query: string): string {
  const q = query.toLowerCase();

  if (q.includes("manger") || q.includes("aliment") || q.includes("nourriture") || q.includes("petit-déjeuner") || q.includes("petit dejeuner") || q.includes("sucre") || q.includes("repas")) {
    return (
      "Voici les recommandations clés de l'OMS pour l'alimentation préventive du diabète de type 2 :\n\n" +
      "1. **Favoriser les fibres et l'index glycémique bas** : Légumes verts, légumineuses (lentilles, pois chiches, fèves), et céréales complètes (pain complet, orge, avoine).\n" +
      "2. **Bonnes graisses** : Privilégier l'huile d'olive tunisienne vierge et les poissons, en limitant les graisses animales saturées et le beurre.\n" +
      "3. **Éviter les sucres rapides** : Supprimer les boissons sucrées (sodas, jus industriels), réduire les pâtisseries et les farines raffinées.\n" +
      "4. **Hydratation** : Boire principalement de l'eau (1,5L à 2L par jour).\n\n" +
      "💡 *Conseil : Composez votre assiette avec 50% de légumes, 25% de protéines maigres et 25% de féculents complets.*"
    );
  }

  if (q.includes("sport") || q.includes("activité") || q.includes("activite") || q.includes("marche") || q.includes("exercice") || q.includes("bouger")) {
    return (
      "Selon les lignes directrices de l'OMS pour la prévention du diabète de type 2 :\n\n" +
      "• **Objectif hebdomadaire** : Au moins **150 minutes d'activité aérobie d'intensité modérée** (ou 75 minutes d'activité soutenue) réparties sur la semaine.\n" +
      "• **Au quotidien** : 30 minutes de marche rapide par jour suffisent pour améliorer considérablement la sensibilité à l'insuline.\n" +
      "• **Renforcement musculaire** : 2 séances par semaine (montée d'escaliers, exercices avec le poids du corps).\n" +
      "• **Rompre la sédentarité** : Évitez de rester assis plus de 60 minutes consécutives."
    );
  }

  if (q.includes("poids") || q.includes("ventre") || q.includes("taille") || q.includes("maigrir") || q.includes("kilo")) {
    return (
      "La graisse abdominale est le principal déterminant métabolique du diabète de type 2 :\n\n" +
      "• **Rapport tour de taille / taille (WHtR)** : Dans l'évaluation DIABSCORE, un ratio inférieur à 0,5 indique un risque faible.\n" +
      "• **Impact clinique** : Une perte modérée de seulement **5 à 7 % de votre poids corporel** réduit le risque de développer un diabète de plus de 50 % chez les personnes à risque.\n" +
      "• **Stratégie durable** : Privilégiez des modifications progressives de vos habitudes alimentaires plutôt que des régimes drastiques."
    );
  }

  if (q.includes("stress") || q.includes("sommeil") || q.includes("dormir") || q.includes("fatigue") || q.includes("nuit")) {
    return (
      "Le stress chronique et le manque de sommeil influencent directement la régulation glycémique :\n\n" +
      "• **Sommeil réparateur** : Visez 7 à 8 heures par nuit. Un manque chronique de sommeil perturbe l'insuline et augmente l'appétit pour les sucres.\n" +
      "• **Gestion du cortisol** : Le stress libère du cortisol, qui élève la glycémie. Pratiquez des techniques simples de respiration (cohérence cardiaque) ou de relaxation quotidienne."
    );
  }

  if (q.includes("symptôme") || q.includes("symptome") || q.includes("diagnostic") || q.includes("malade") || q.includes("taux") || q.includes("glycémie") || q.includes("glycemie")) {
    return (
      "⚠️ **Information importante** :\n" +
      "En tant qu'assistant de mode de vie, je ne peux pas poser de diagnostic ni interpréter des bilans biologiques.\n\n" +
      "Si vous ressentez une soif anormale, une envie fréquente d'uriner, une fatigue inhabituelle ou une vision trouble, réalisez le questionnaire DIABSCORE dans l'application et consultez un médecin pour un dosage de glycémie à jeun ou d'HbA1c."
    );
  }

  // General default response
  return (
    "Bonjour ! En tant que compagnon santé basé sur les recommandations de l'Organisation Mondiale de la Santé (OMS), je vous accompagne dans la prévention du diabète de type 2 :\n\n" +
    "1. **Alimentation saine** : Riche en légumes, légumineuses et fibres, pauvre en sucres raffinés.\n" +
    "2. **Activité physique** : 30 minutes de marche active par jour (150 min/semaine).\n" +
    "3. **Tour de taille maîtrisé** : Surveiller le rapport tour de taille / taille.\n" +
    "4. **Dépistage régulier** : Compléter votre questionnaire DIABSCORE au sein de votre foyer.\n\n" +
    "N'hésitez pas à me poser une question sur votre alimentation, l'exercice physique ou vos habitudes de vie !"
  );
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

  // Build a prompt that forces the model to skip internal thinking tokens
  let prompt = `<start_of_turn>user\n${SYSTEM_PROMPT}\n\n`;
  for (const h of history) {
    if (h.role === "user") {
      prompt += `Question: ${h.content}\n`;
    } else if (h.role === "assistant") {
      prompt += `Réponse: ${h.content}\n`;
    }
  }
  prompt += `Question: ${message}<end_of_turn>\n<start_of_turn>model\n<unused94> thought\nJe réponds directement avec des recommandations concrètes et bienveillantes.<unused95>`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

  try {
    // Attempt 1: Call Ollama /api/generate with raw prompt formatting to bypass thought looping
    const res = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: false,
        raw: true,
        options: { temperature: 0.3, num_predict: MAX_TOKENS },
        prompt,
      }),
    });

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      const reply = extractReply(data?.response ?? "");
      if (reply) {
        return NextResponse.json({ reply });
      }
    }

    // Attempt 2: Standard chat endpoint if /api/generate did not yield an answer
    const chatRes = await fetch(`${baseUrl}/api/chat`, {
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

    if (chatRes.ok) {
      const chatData = await chatRes.json().catch(() => ({}));
      const reply = extractReply(chatData?.message?.content ?? "");
      if (reply) {
        return NextResponse.json({ reply });
      }
    }

    // If Ollama responded with empty or unusable reply, serve WHO lifestyle guidance
    return NextResponse.json({ reply: getWhoLifestyleAdvice(message) });
  } catch (err) {
    // Graceful fallback: when Ollama is offline or running on Vercel without a tunnel,
    // serve WHO lifestyle advice rather than breaking the chat experience.
    console.warn("[companion] Ollama unavailable, serving WHO lifestyle advisory fallback.");
    return NextResponse.json({ reply: getWhoLifestyleAdvice(message) });
  } finally {
    clearTimeout(timeout);
  }
}
