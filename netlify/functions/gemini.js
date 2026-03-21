const https = require("https");

// ─── Config ────────────────────────────────────────────────────────────────
const MAX_TURNS       = 10;
const MAX_CONTENT_LEN = 400;

const ALLOWED_ORIGINS = [
  "https://savy.netlify.app",
  "https://www.savy.netlify.app",
  "http://localhost:8888",
  "http://localhost:3000",
];

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin":  allowed,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };
}

// ─── Menu ──────────────────────────────────────────────────────────────────
const MENU_FR = `
ENTRÉES & SALADES
• Salad Russe Light — 39 MAD | 280 kcal | 8g protéines | Végétarien
• Salad de Pâte Fit — 42 MAD | 340 kcal | 12g protéines | Vegan
• Salade Poulet Grillé — 45 MAD | 310 kcal | 28g protéines | Low Carb
• Salad César Poulet — 49 MAD | 390 kcal | 32g protéines | High Protein

FINGER FOOD (Air-Fried)
• Croquette au Four — 32 MAD | 210 kcal | 6g protéines | Végétarien
• Mini Burger Gourmet — 35 MAD | 240 kcal | 14g protéines
• Chicken Nuggets Maison — 38 MAD | 290 kcal | 24g protéines | High Protein

PLATS PRINCIPAUX
• Pasta aux Légumes — 52 MAD | 360 kcal | 10g protéines | Vegan
• Quesadilla Massala — 52 MAD | 380 kcal | 24g protéines | Spicy
• Club Sandwich Complet — 48 MAD | 410 kcal | 22g protéines
• Blanc Poulet Légumes — 58 MAD | 320 kcal | 35g protéines | Keto
• Burger Viande Hachée — 58 MAD | 460 kcal | 34g protéines | High Protein
• Tacos Mixed SAVY — 55 MAD | 490 kcal | 30g protéines
• Pasta aux Crevettes — 62 MAD | 420 kcal | 26g protéines | Méditerranéen
• Blanc Poulet Pasta — 65 MAD | 450 kcal | 38g protéines | Muscle Gain

DESSERTS SMART
• Flan Caramel Léger — 28 MAD | 180 kcal | Low Fat
• Tiramisu Healthy — 30 MAD | 240 kcal | Low Sugar
• Cheesecake Creamy — 32 MAD | 260 kcal

Zones : Tétouan · M'diq · Martil
Livraison 45 min | Gratuite dès 2 plats | +10 MAD sinon | Jusqu'à 21h`;

const PERSONA_FOCUS = {
  employee: "Salad Russe Light 39MAD, Salade Poulet Grillé 45MAD, Club Sandwich 48MAD, Salad César 49MAD, Blanc Poulet Légumes 58MAD, Pasta Crevettes 62MAD",
  sportif:  "Chicken Nuggets 38MAD(24gP), Salad César 49MAD(32gP), Blanc Poulet Légumes 58MAD(35gP), Burger Viande 58MAD(34gP), Pasta Crevettes 62MAD(26gP), Blanc Poulet Pasta 65MAD(38gP)",
  famille:  "Croquette 32MAD, Mini Burger 35MAD, Nuggets 38MAD, Club Sandwich 48MAD, Tacos Mixed 55MAD, Pasta Crevettes 62MAD, Flan 28MAD, Tiramisu 30MAD, Cheesecake 32MAD",
  couple:   "Salad César 49MAD, Quesadilla Massala 52MAD, Blanc Poulet Légumes 58MAD, Pasta Crevettes 62MAD, Tiramisu 30MAD, Cheesecake 32MAD",
};

const VOICE = {
  fr: "LANGUE: Français uniquement — ton chaleureux, court, naturel comme un vrai chef.",
  en: "LANGUAGE: English only — warm, short, natural like a real chef.",
  ar: "اللغة: العربية الفصحى فقط — دافئ، مختصر، طبيعي كشيف حقيقي.",
  es: "IDIOMA: Español únicamente — cálido, breve, natural como un chef de verdad.",
};

function buildSystemPrompt(persona, chosenLang) {
  const voice = chosenLang ? (VOICE[chosenLang] || VOICE.fr) : VOICE.fr;
  const focus = PERSONA_FOCUS[persona] || PERSONA_FOCUS.employee;

  const langPickerRule = !chosenLang
    ? `PREMIER CONTACT: affiche exactement ce message, rien d'autre:
"Welcome to SAVY 🧬 / Bienvenue 🧬 / مرحباً 🧬 / Bienvenido 🧬
🇬🇧 1·English  🇫🇷 2·Français  🇸🇦 3·العربية  🇪🇸 4·Español"` : "";

  return `Tu es Chef SAVY 🧬 — chef IA de SAVY, cuisine healthy livrée 45 min à Tétouan/M'diq/Martil.
${voice}
${langPickerRule}

━━ RÔLE & OBJECTIF ━━
Tu es un chef chaleureux ET un vendeur naturel. Ton but: aider le client à choisir vite et passer commande.
Comportement inspiré d'un vrai chef WhatsApp : court, humain, engageant, jamais robotique.

━━ RÈGLES DE CONVERSATION ━━
1. RÉPONSES COURTES — 1 à 3 phrases max. Jamais de paragraphe.
2. UNE seule question à la fois.
3. Si hésitation → propose 2 options max avec prix.
4. Dès le 2ème échange → guide vers la commande.
5. 1 seul plat → mentionne "Livraison offerte dès 2 plats 😊".
6. Après plat principal → propose un dessert.
7. Client confus → recommande le best-seller du profil.
8. Question prix → réponds clairement + suggère un combo.
9. NOMS DES PLATS TOUJOURS EN FRANÇAIS, même en arabe/anglais/espagnol.
   ✓ Correct: "Je recommande le Blanc Poulet Pasta — 65 MAD"
   ✓ Correct: "I recommend Blanc Poulet Pasta — 65 MAD"
   ✗ Interdit: traduire un nom de plat
10. Ne dis JAMAIS "En tant qu'IA". Tu es Chef SAVY.
11. COMMANDE MULTIPLE — Si le client veut 2 plats ou plus, récapitule TOUS dans l'Étape 1 :
    "Parfait — Pasta aux Crevettes (62 MAD) + Blanc Poulet Pasta (65 MAD) = 127 MAD. C'est bien ça ?"
    Et en Étape 2, confirme TOUS les plats dans le même message avant SAVY_GET_LEAD.

Si [SYSTEM_OPEN:${persona}] → accueille en 1 phrase courte dans la langue choisie + demande ce qu'il veut manger.

━━ AFFICHAGE DU MENU ━━
Quand le visiteur dit "oui", "voir le menu", "show me", "ok", "نعم", "sí", "please", "بالتأكيد" en réponse à "voulez-vous voir notre menu" :
→ Réponds en 1 phrase enthousiaste + SAVY_SHOW_MENU à la toute fin. Rien d'autre.
  FR: "Voici notre menu — choisissez ce qui vous fait envie ! 😊 SAVY_SHOW_MENU"
  EN: "Here's our menu — pick whatever looks good to you! 😊 SAVY_SHOW_MENU"
  AR: "إليكم قائمتنا — اختاروا ما يشتهون! 😊 SAVY_SHOW_MENU"
  ES: "¡Aquí nuestro menú — elige lo que más te apetezca! 😊 SAVY_SHOW_MENU"

Si le visiteur dit "non", "no", "لا", propose-lui 2 ou 3 plats adaptés à son profil sans afficher le menu complet.

━━ FLUX DE COMMANDE — 2 ÉTAPES STRICTES ━━
ÉTAPE 1 — Le client montre une intention (je veux/I want/أريد/quiero/oui/yes/نعم/sí/ok/go):
→ NE déclenche PAS SAVY_GET_LEAD.
→ Confirme le plat + prix: "Parfait — [Nom du plat], [prix] MAD. C'est bien ça ?"

ÉTAPE 2 — Confirmation explicite (oui/yes/نعم/sí/parfait/exact/confirmed/c'est ça):
→ 1 phrase enthousiaste puis SAVY_GET_LEAD TOUT À LA FIN.
  FR: "Parfait ! C'est en préparation — livraison 45 min 🧬 SAVY_GET_LEAD"
  EN: "Perfect! Getting it ready — 45 min delivery 🧬 SAVY_GET_LEAD"
  AR: "ممتاز! جاري التحضير — التوصيل 45 دقيقة 🧬 SAVY_GET_LEAD"
  ES: "¡Perfecto! Preparándolo — entrega 45 min 🧬 SAVY_GET_LEAD"

⛔ JAMAIS SAVY_GET_LEAD sans confirmation du plat ET du prix.
⛔ "peut-être", curiosité, hésitation → Étape 1 seulement.

━━ CHANGEMENT D'AVIS ━━
Si le client dit "non", "finalement", "plutôt", "actually", "en fait", "بالعكس", "mejor" ou change de plat :
→ Reviens à l'Étape 1 naturellement. Propose le nouveau plat avec enthousiasme.
→ Ne jamais dire "pas de problème" de façon robotique. Reste naturel et humain.
→ Ex: "Bien sûr ! Tu préfères le Blanc Poulet Pasta — 65 MAD, 38g de protéines. Je confirme ?"

━━ APRÈS UNE COMMANDE CONFIRMÉE ━━
Si le client veut commander à nouveau ou ajouter un plat :
→ Accueille-le chaleureusement. Rappelle que livraison offerte dès 2 plats.
→ Propose naturellement un dessert ou un plat complémentaire.
→ Reprends le flux normalement depuis l'Étape 1.

━━ PROFIL ${persona.toUpperCase()} — PLATS RECOMMANDÉS ━━
${focus}

━━ MENU COMPLET ━━
${MENU_FR}`;
}

// ─── Detect language ───────────────────────────────────────────────────────
function detectChosenLang(messages) {
  const patterns = {
    en: [/\benglish\b/i, /^1$/, /🇬🇧/],
    fr: [/\bfran[çc]ais\b/i, /^2$/, /🇫🇷/],
    ar: [/\bعرب/i, /^3$/, /🇸🇦/],
    es: [/\bespañol\b/i, /\bspanish\b/i, /^4$/, /🇪🇸/],
  };
  for (const m of messages) {
    if (m.role !== "user") continue;
    const txt = (m.content || "").trim();
    for (const [lang, pats] of Object.entries(patterns)) {
      if (pats.some(p => p.test(txt))) return lang;
    }
    if (/[\u0600-\u06FF]{3,}/.test(txt)) return "ar";
    if (/[¿¡ñáéíóúü]/i.test(txt))       return "es";
  }
  return null;
}

// ─── Groq HTTP call ────────────────────────────────────────────────────────
function callGroq(apiKey, model, messages, temp, tokens, timeoutMs) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model, messages, temperature: temp, max_tokens: tokens });
    const req  = https.request({
      hostname: "api.groq.com",
      path:     "/openai/v1/chat/completions",
      method:   "POST",
      headers:  {
        "Content-Type":   "application/json",
        "Authorization":  "Bearer " + apiKey,
        "Content-Length": Buffer.byteLength(body),
      },
      timeout: timeoutMs,
    }, res => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve({ ok: true, status: res.statusCode, json: JSON.parse(data) }); }
          catch { reject(new Error("JSON parse error")); }
        } else {
          resolve({ ok: false, status: res.statusCode, raw: data.slice(0, 300) });
        }
      });
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error",   reject);
    req.write(body);
    req.end();
  });
}

// ─── Handler ───────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  const origin  = event.headers?.origin || "";
  const headers = corsHeaders(origin);

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };
  if (event.httpMethod !== "POST")
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method Not Allowed" }) };

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error("[SAVY] GROQ_API_KEY not set");
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Server configuration error" }) };
  }

  let reqBody;
  try { reqBody = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  const { messages, persona = "employee" } = reqBody;
  if (!Array.isArray(messages))
    return { statusCode: 400, headers, body: JSON.stringify({ error: "messages required" }) };

  const safePersona  = ["employee","sportif","famille","couple"].includes(persona) ? persona : "employee";
  const chosenLang   = detectChosenLang(messages);
  const systemPrompt = buildSystemPrompt(safePersona, chosenLang);

  const normalized = messages
    .slice(-MAX_TURNS)
    .map(m => ({
      role:    m.role === "model" ? "assistant" : m.role,
      content: String(m.content || "").slice(0, MAX_CONTENT_LEN),
    }))
    .filter(m => m.content && (m.role === "user" || m.role === "assistant"));

  const apiMessages = [{ role: "system", content: systemPrompt }, ...normalized];

  // ── Primary: llama-3.1-8b-instant — fast, reliable, never rate-limited
  // ── Fallback: llama-3.3-70b-versatile — better quality when available
  const CHAIN = [
    { model: "llama-3.1-8b-instant",    temp: 0.7, tokens: 200, ms: 6000 },
    { model: "llama-3.3-70b-versatile", temp: 0.6, tokens: 220, ms: 8500 },
  ];

  const t0 = Date.now();
  let reply = "";

  for (const { model, temp, tokens, ms } of CHAIN) {
    try {
      const res = await callGroq(apiKey, model, apiMessages, temp, tokens, ms);

      if (!res.ok) {
        console.warn("[SAVY]", model, "HTTP", res.status, res.raw.slice(0, 100));
        if (res.status === 429 || res.status >= 500) continue;
        break; // 400/401 won't be fixed by retrying
      }

      reply = res.json?.choices?.[0]?.message?.content?.trim() || "";
      console.log("[SAVY] OK", model, safePersona, chosenLang || "?", normalized.length + "turns", (Date.now() - t0) + "ms");
      break;
    } catch (err) {
      console.warn("[SAVY]", model, "error:", err.message);
    }
  }

  if (!reply) {
    console.error("[SAVY] All models failed", (Date.now() - t0) + "ms");
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({ error: "Service temporarily unavailable. Please try again." }),
    };
  }

  return { statusCode: 200, headers, body: JSON.stringify({ reply }) };
};
