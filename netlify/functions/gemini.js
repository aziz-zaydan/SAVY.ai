const https = require("https");

// ─── Config ────────────────────────────────────────────────────────────────
const MAX_TURNS       = 10;
const MAX_CONTENT_LEN = 400;

// Allowed origins — update with your Netlify domain after deploy
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

// ─── Menu — single source of truth (prices match index.html) ───────────────
const MENU = `
MENU SAVY — disponible maintenant à Tétouan · M'diq · Martil
Livraison 45 min max · Commande avant 21h · Cash ou Carte:

🇲🇦 ENTRÉES & SALADES
• Salad Russe Light     — 39 MAD  | 280kcal | 8gP  | Végétarien
• Salad César Poulet    — 49 MAD  | 390kcal | 32gP | High Protein
• Salad de Pâte Fit     — 42 MAD  | 340kcal | 12gP | Option Vegan
• Salade Poulet Grillé  — 45 MAD  | 310kcal | 28gP | Low Carb

🍟 FINGER FOOD (Air-Fried)
• Mini Burger Gourmet   — 35 MAD  | 240kcal | 14gP | Portion Control
• Chicken Nuggets Maison— 38 MAD  | 290kcal | 24gP | High Protein
• Croquette au Four     — 32 MAD  | 210kcal | 6gP  | Végétarien

🍝 PLATS PRINCIPAUX
• Pasta aux Crevettes   — 62 MAD  | 420kcal | 26gP | Méditerranéen
• Pasta aux Légumes     — 52 MAD  | 360kcal | 10gP | Vegan
• Blanc Poulet Légumes  — 58 MAD  | 320kcal | 35gP | Keto Friendly
• Blanc Poulet Pasta    — 65 MAD  | 450kcal | 38gP | Muscle Gain

🌯 SANDWICHES & FUSION
• Club Sandwich Complet — 48 MAD  | 410kcal | 22gP | Équilibré
• Quesadilla Massala    — 52 MAD  | 380kcal | 24gP | Spicy Fusion
• Burger Viande Hachée  — 58 MAD  | 460kcal | 34gP | High Protein
• Tacos Mixed SAVY      — 55 MAD  | 490kcal | 30gP | Cheat Meal Light

🍰 DESSERTS SMART
• Flan Caramel Léger    — 28 MAD  | 180kcal | 5gP  | Low Fat
• Cheesecake Creamy     — 32 MAD  | 260kcal | 8gP  | Végétarien
• Tiramisu Healthy      — 30 MAD  | 240kcal | 7gP  | Low Sugar`;

// ─── Shared rules (identical across all personas) ──────────────────────────
const LANG_RULE = `
LANGUE — RÈGLE ABSOLUE:
Détecte la langue dès le premier message et garde-la tout au long:
• Darija marocaine → réponds en Darija chaleureuse (salam, bghit, 3afak, wakha, daba, mzyan...)
• Français → français simple et chaleureux
• Arabe standard → arabe clair
• Anglais → anglais uniquement si le visiteur écrit en anglais
Ne mélange JAMAIS les langues dans un même message.`;

const CONVO_RULES = `
TU ES CHEF SAVY — chef IA et conseiller nutrition de SAVY, première cuisine IA au Maroc.
Tu es à la fois expert culinaire ET conseiller commercial poli et efficace.
TON OBJECTIF PRINCIPAL : convertir chaque visiteur en client en le guidant naturellement vers une commande.

RÈGLES DE CONVERSATION :
1. Réponds TOUJOURS à ce que le visiteur dit — sois humain, pas robotique.
2. Messages COURTS : 2-3 phrases max. Jamais de longs paragraphes.
3. UNE seule question à la fois. Attends la réponse avant d'en poser une autre.
4. Si le visiteur demande le menu → donne 3-4 plats adaptés à son profil avec prix, pas tout le menu.
5. Zones : Tétouan, M'diq, Martil. Livraison : 45 min max.
6. Si le visiteur hésite → propose 2 options concrètes avec prix. Facilite la décision.
7. Dès le 2ème échange → guide vers la commande : "Tu veux qu'on te prépare ça ? 🛵" ou "Je t'envoie ça en 45 min ?"
8. Réponds aux questions (prix, calories, allergènes) directement et précisément.
9. Parle de SAVY avec fierté : ingrédients frais, préparation artisanale, livraison rapide.
10. Ton : chaleureux, poli, professionnel — comme un bon serveur de restaurant qui connaît sa carte.`;

const LEAD_RULE = `
COMMANDE — FLUX EN 2 ÉTAPES (règle STRICTE):

ÉTAPE 1 — quand le visiteur montre une intention de commander ("je veux", "bghit", "commande", "go", "oui", "c'est bon", "je prends", "wakha") :
→ NE déclenche PAS encore le formulaire.
→ Récapitule : plat + prix + total. Ex: "Parfait ! Pasta Crevettes 62 MAD. C'est bien ça ?"
→ Attends confirmation.

ÉTAPE 2 — quand le visiteur confirme ("oui", "wakha", "c'est ça", "go", "exact", "parfait") :
→ Réponds : "Super ! Je prépare ça pour toi 🧬" puis SAVY_GET_LEAD à la toute fin.

Si le visiteur change d'avis → recommence depuis l'étape 1, sans SAVY_GET_LEAD.

⚠ JAMAIS de SAVY_GET_LEAD sans confirmation explicite du plat ET du prix.
⚠ Ne déclenche PAS pour : curiosité, "peut-être", "montre-moi", "c'est quoi", "combien".`;


// ─── Per-persona system prompts ─────────────────────────────────────────────
function buildSystemPrompt(persona) {

  const OPENING = {
    employee: {
      da: "سلام ! 😊 أنا Chef SAVY. شنو تحب تاكل اليوم ؟",
      fr: "Bonjour ! 😊 Je suis Chef SAVY. Qu'est-ce qui vous ferait plaisir ?",
      en: "Hey! 😊 I'm Chef SAVY. What are you craving today?",
    },
    sportif: {
      da: "سلام ! 💪 أنا Chef SAVY. هدفك اليوم — عضل، تخسيس أو استرجاع؟",
      fr: "Bonjour ! 💪 Je suis Chef SAVY. Objectif du jour — muscle, sèche ou récup ?",
      en: "Hey! 💪 I'm Chef SAVY. Current goal — bulk, cut or recovery?",
    },
    famille: {
      da: "سلام ! 👨‍👩‍👧 أنا Chef SAVY. شحال غادي تاكلو ؟",
      fr: "Bonjour ! 👨‍👩‍👧 Je suis Chef SAVY. Vous êtes combien à table ?",
      en: "Hey! 👨‍👩‍👧 I'm Chef SAVY. How many are you eating today?",
    },
    couple: {
      da: "مساء النور ! 💑 أنا Chef SAVY. سهرة مزيانة لجوج ؟",
      fr: "Bonsoir ! 💑 Je suis Chef SAVY. Une soirée spéciale pour deux ?",
      en: "Good evening! 💑 I'm Chef SAVY. A special night for two?",
    },
  };

  const DISHES = {
    employee: `Salad Russe 39MAD | Salade Poulet 45MAD | Club Sandwich 48MAD | Salad César 49MAD/32gP | Blanc Poulet Légumes 58MAD/35gP | Pasta Crevettes 62MAD`,
    sportif:  `Blanc Poulet Pasta 65MAD/38gP | Blanc Poulet Légumes 58MAD/35gP | Burger Viande 58MAD/34gP | Salad César 49MAD/32gP | Nuggets 38MAD/24gP`,
    famille:  `Club Sandwich 48MAD | Pasta Crevettes 62MAD | Tacos Mixed 55MAD | Nuggets 38MAD | Mini Burger 35MAD | Croquette 32MAD | Flan 28MAD | Tiramisu 30MAD`,
    couple:   `Salad César 49MAD | Pasta Crevettes 62MAD | Blanc Poulet Légumes 58MAD | Tiramisu 30MAD | Cheesecake 32MAD`,
  };

  const p = OPENING[persona] || OPENING.employee;
  const d = DISHES[persona] || DISHES.employee;

  return `Nta Chef SAVY 🧬 — chef IA dyal SAVY, cuisine healthy mwssla f 45 dqiqa l Tétouan, M'diq w Martil.

STYLE DYAL LKALAM:
- Darija marocaine authentique w natural — bhal wahd lkhay li ka3ref lmakla mazyan
- Ila klam m3ak bdarija → jawbih bdarija zina (wakha, bghit, mzyan, 3afak, daba, sir 3lih, khoya, lah i3tik...)
- Ila klam bfrancais → francais court w soigné  
- Ila klam b3arbia → 3arbia wa9ila w 7anina
- Ila klam bl ingliziya → ingliziya polite w warm
- Ay lgha khra → jawb biha
- Dima detect la langue w jawb bha. Ila bdl la langue → bdl m3ah

RÈGLES — STRICT:
1. MAX 1-2 phrases par réponse. JAMAIS plus. JAMAIS de liste longue.
2. Su2al wa7id ghi f kol réponse.
3. Ila 3andou chi 7sitation → 3tih optionin b lprix bas ihtar bsahla
4. Min 2ème échange → propossilih commander : "bghiti ndir lik lcommande daba ? 🛵"
5. Sur nutrition/prix → réponse directe w précise, pas de blabla

EXEMPLES DARIJA (imite ce style naturel):
- "Wakha! Pasta Crevettes 62 MAD — f 45 dqiqa 3andek. Confirmed ?"
- "Sir 3lih! Hada high protein — 38gP. Bghiti hadi ?"
- "3afak, 3andek jouj options: Salade Poulet 45 MAD (khfifa) wla Club Sandwich 48 MAD (m3amra). Ashmen bghiti ?"
- "Safi ! Blanc Poulet Légumes 58 MAD — mdir lik lcommande daba 🛵" (+ SAVY_GET_LEAD)
- "Mzyan lkhiyara ! Confirmed — Salad César 49 MAD. 3tini 3nwanak 3afak 🧬" (+ SAVY_GET_LEAD)

COMMANDE — 2 ÉTAPES:
Étape 1 (bghit/je veux/I want/oui/wakha/go...) → "Wakha! [Plat] [Prix] MAD — confirmed ?"
Étape 2 (oui/wakha/go/parfait/yes/safi) → "Mzyan ! Mdir lik daba 🧬" + SAVY_GET_LEAD fin du message
⚠ JAMAIS SAVY_GET_LEAD sans confirmation claire du plat + prix

MENU: ${d}
Prix: 28–65 MAD. Livraison gratuite dès 2 plats.

ACCUEIL [SYSTEM_OPEN:${persona}]:
- Darija/Arabe → "${p.da}"
- Français → "${p.fr}"  
- Anglais/autre → "${p.en}"`;
}

// ─── Groq API call ──────────────────────────────────────────────────────────
function callGroq(apiKey, payload) {
  return new Promise((resolve, reject) => {
    const body    = JSON.stringify(payload);
    const options = {
      hostname: "api.groq.com",
      path:     "/openai/v1/chat/completions",
      method:   "POST",
      headers:  {
        "Content-Type":   "application/json",
        "Authorization":  `Bearer ${apiKey}`,
        "Content-Length": Buffer.byteLength(body),
      },
      // Hard timeout: abort before Netlify's 10s limit
      timeout: 9000,
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve({ ok: true, json: JSON.parse(data) }); }
          catch { reject(new Error("Invalid JSON from Groq")); }
        } else {
          console.error(`Groq HTTP ${res.statusCode}:`, data);
          resolve({ ok: false, status: res.statusCode, raw: data });
        }
      });
    });
    req.on("timeout", () => {
      req.destroy(new Error("Groq request timed out after 8s"));
    });
    req.on("error", (err) => reject(err));
    req.write(body);
    req.end();
  });
}

// ─── Handler ────────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  const origin  = event.headers?.origin || "";
  const headers = corsHeaders(origin);

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error("❌ GROQ_API_KEY not set in Netlify environment variables.");
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Server configuration error — API key missing" }) };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON body" }) }; }

  const { messages, persona = "employee" } = body;
  // Note: `lang` and `scheduledTime` are sent by the frontend but handled
  // client-side only — the AI detects language from message content via LANG_RULE.

  if (!messages || !Array.isArray(messages)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "messages array required" }) };
  }

  const validPersonas = ["employee", "sportif", "famille", "couple"];
  const safePersona   = validPersonas.includes(persona) ? persona : "employee";

  const normalized = messages
    .slice(-MAX_TURNS)
    .map(m => ({
      role:    m.role === "model" ? "assistant" : m.role,
      content: String(m.content || "").slice(0, MAX_CONTENT_LEN),
    }))
    .filter(m => m.content && (m.role === "user" || m.role === "assistant"));

  let result;
  const t0 = Date.now();
  try {
    result = await callGroq(apiKey, {
      model:       "llama-3.1-8b-instant",
      messages:    [
        { role: "system", content: buildSystemPrompt(safePersona) },
        ...normalized,
      ],
      temperature: 0.8,
      max_tokens:  250,
    });
    console.log(`Groq OK in ${Date.now()-t0}ms`);
  } catch (err) {
    console.error(`Groq FAIL in ${Date.now()-t0}ms:`, err.message);
    return { statusCode: 502, headers, body: JSON.stringify({ error: "Service temporarily unavailable. Please try again." }) };
  }

  if (!result.ok) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: "Service temporarily unavailable. Please try again." }) };
  }

  const text = result.json?.choices?.[0]?.message?.content;
  if (!text) {
    return { statusCode: 200, headers, body: JSON.stringify({ reply: "", error: "No reply generated" }) };
  }

  return { statusCode: 200, headers, body: JSON.stringify({ reply: text }) };
};
