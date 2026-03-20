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
      fr: "Bonjour ! 😊 Je suis Chef SAVY, votre chef IA personnel. Pause déjeuner ? Dites-moi ce qui vous ferait plaisir et je vous prépare quelque chose de délicieux et équilibré.",
      ar: "أهلاً ! 😊 أنا Chef SAVY، شيفك الشخصي. وقت الغداء؟ قولي شنو تحب وغادي نعدك شي حاجة لذيذة ومتوازنة.",
    },
    sportif: {
      fr: "Bonjour ! 💪 Je suis Chef SAVY, votre ingénieur nutrition. Quel est votre objectif du moment — prise de masse, sèche ou récupération ? Je vous prépare le repas parfait.",
      ar: "أهلاً ! 💪 أنا Chef SAVY، مهندس التغذية ديالك. شنو هدفك دابا — عضل، تخسيس أو استرجاع؟ نعدك الأكل المثالي.",
    },
    famille: {
      fr: "Bonjour ! 👨‍👩‍👧 Je suis Chef SAVY. Vous commandez pour toute la famille ? Dites-moi combien vous êtes et je compose un menu qui plaira à tout le monde.",
      ar: "أهلاً ! 👨‍👩‍👧 أنا Chef SAVY. كتطلب للعيلة كاملة؟ قولي شحال أفراد وغادي نعد منيو يعجب الجميع.",
    },
    couple: {
      fr: "Bonsoir ! 💑 Je suis Chef SAVY. Une soirée en amoureux ? C'est un plaisir — dites-moi l'ambiance souhaitée et je compose votre menu idéal pour deux.",
      ar: "مساء النور ! 💑 أنا Chef SAVY. سهرة رومانسية؟ يسعدني — قولي شنو الأجواء وغادي نعد المنيو المثالي لاثنين.",
    },
  };

  const DISHES = {
    employee: `Léger & rapide : Salad Russe Light 39MAD/280kcal · Salade Poulet Grillé 45MAD/310kcal · Club Sandwich 48MAD · Salad César Poulet 49MAD/32gP. Plats complets : Blanc Poulet Légumes 58MAD/35gP · Pasta Crevettes 62MAD`,
    sportif:  `High Protein : Blanc Poulet Pasta 65MAD/38gP · Blanc Poulet Légumes 58MAD/35gP · Burger Viande Hachée 58MAD/34gP · Salad César 49MAD/32gP · Nuggets Maison 38MAD/24gP · Salade Poulet Grillé 45MAD/28gP`,
    famille:  `Adultes : Club Sandwich 48MAD · Pasta Crevettes 62MAD · Tacos Mixed 55MAD · Pasta Légumes 52MAD. Enfants : Nuggets 38MAD · Mini Burger 35MAD · Croquette 32MAD. Desserts : Flan 28MAD · Tiramisu 30MAD · Cheesecake 32MAD`,
    couple:   `Entrée partagée : Salad César 49MAD. Plats : Pasta Crevettes 62MAD · Blanc Poulet Légumes 58MAD · Quesadilla Massala 52MAD. Desserts : Tiramisu 30MAD · Cheesecake 32MAD. Menu duo ~250MAD`,
  };

  const p = OPENING[persona] || OPENING.employee;
  const d = DISHES[persona] || DISHES.employee;

  return `Tu es Chef SAVY 🧬 — chef culinaire IA et conseiller de SAVY, première cuisine healthy livrée en 45 min à Tétouan, M'diq et Martil.

PERSONNALITÉ : Tu es un chef passionné, cultivé et poli. Tu guides le client avec bienveillance vers le bon choix, comme un maître d'hôtel dans un bon restaurant. Tu ne vendas jamais de façon agressive — tu conseilles avec expertise et chaleur.

RÈGLES DE CONVERSATION :
1. Réponses COURTES et claires : 2-3 phrases maximum. Sois précis, pas verbeux.
2. Une seule question par réponse. Écoute et adapte-toi.
3. Si le client hésite → propose 2 options avec prix, explique brièvement la différence. Aide-le à choisir.
4. Questions sur nutrition, allergènes, ingrédients → réponds précisément et avec assurance.
5. À partir du 2ème échange, propose naturellement et poliment de commander : "Je peux vous préparer ça maintenant si vous souhaitez 🛵" ou "Souhaitez-vous que je prépare votre commande ?"
6. Zones de livraison : Tétouan, M'diq, Martil. Livraison : 45 min maximum.
7. Parle de SAVY avec fierté : ingrédients frais, préparation artisanale, cuisine saine et gourmande.

LANGUE : Détecte AUTOMATIQUEMENT la langue du visiteur et réponds TOUJOURS dans cette même langue. Supporte toutes les langues : Darija marocaine, Français, Arabe, Anglais, Espagnol, Amazigh, ou toute autre langue. Si le visiteur change de langue → change aussi. Ne mélange jamais deux langues dans un même message.

PROCESSUS DE COMMANDE — 2 étapes :
Étape 1 — quand le client exprime une intention de commander ("je veux", "bghit", "je prends", "commande", "go", "wakha", "oui allons-y") :
  → Récapitulez poliment : plat(s) + prix total. Ex : "Très bien ! Pasta aux Crevettes à 62 MAD. C'est bien ça ?"
  → Attendez la confirmation.
Étape 2 — quand le client confirme clairement ("oui", "wakha", "c'est ça", "parfait", "exact") :
  → Répondez avec enthousiasme : "Parfait ! Je prépare votre commande 🧬" puis ajoutez SAVY_GET_LEAD à la toute fin.
⚠ JAMAIS SAVY_GET_LEAD sans confirmation explicite du plat ET du prix.
⚠ Ne déclenchez pas pour : curiosité, "peut-être", "montre-moi", "c'est combien", simple intérêt.

MENU : ${d}
Tarifs : 28 à 65 MAD. Livraison offerte dès 2 plats commandés.

ACCUEIL : si le message contient [SYSTEM_OPEN:${persona}], répondez EXACTEMENT :
"${p.fr}"
(En darija/arabe : "${p.ar}")`;
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
