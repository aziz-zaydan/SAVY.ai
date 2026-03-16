const https = require("https");

// ─── Config ────────────────────────────────────────────────────
const VERIFY_TOKEN   = process.env.WHATSAPP_VERIFY_TOKEN;  // set in Netlify env
const WA_TOKEN       = process.env.WHATSAPP_TOKEN;         // Meta permanent token
const PHONE_ID       = process.env.WHATSAPP_PHONE_ID;      // Meta phone number ID
const GROQ_API_KEY   = process.env.GROQ_API_KEY;
const SHEET_URL      = process.env.GOOGLE_SHEET_URL;       // same as in index.html
const MAX_HISTORY    = 10;   // turns to keep per conversation
const MAX_CONTENT    = 1500; // chars per message

// ─── In-memory conversation store (resets on cold start — fine for MVP) ──
// For production use Netlify KV or Redis
const conversations = {};

// ─── Menu (same as gemini.js) ──────────────────────────────────
const MENU = `
MENU SAVY — disponible maintenant à Tétouan · M'diq · Martil
Livraison 45 min max · Commande avant 21h · Cash ou Carte:

🇲🇦 ENTRÉES & SALADES
• Salad Russe Light      — 39 MAD  | 280kcal | 8gP
• Salad César Poulet     — 49 MAD  | 390kcal | 32gP
• Salad de Pâte Fit      — 42 MAD  | 340kcal | 12gP
• Salade Poulet Grillé   — 45 MAD  | 310kcal | 28gP

🍟 FINGER FOOD
• Mini Burger Gourmet    — 35 MAD  | 240kcal | 14gP
• Chicken Nuggets Maison — 38 MAD  | 290kcal | 24gP
• Croquette au Four      — 32 MAD  | 210kcal | 6gP

🍝 PLATS PRINCIPAUX
• Pasta aux Crevettes    — 62 MAD  | 420kcal | 26gP
• Pasta aux Légumes      — 52 MAD  | 360kcal | 10gP
• Blanc Poulet Légumes   — 58 MAD  | 320kcal | 35gP
• Blanc Poulet Pasta     — 65 MAD  | 450kcal | 38gP

🌯 SANDWICHES & FUSION
• Club Sandwich Complet  — 48 MAD  | 410kcal | 22gP
• Quesadilla Massala     — 52 MAD  | 380kcal | 24gP
• Burger Viande Hachée   — 58 MAD  | 460kcal | 34gP
• Tacos Mixed SAVY       — 55 MAD  | 490kcal | 30gP

🍰 DESSERTS SMART
• Flan Caramel Léger     — 28 MAD  | 180kcal | 5gP
• Cheesecake Creamy      — 32 MAD  | 260kcal | 8gP
• Tiramisu Healthy       — 30 MAD  | 240kcal | 7gP`;

// ─── System prompt for WhatsApp bot ───────────────────────────
const SYSTEM_PROMPT = `
Tu es Chef SAVY 🧬 — le chef IA personnel de SAVY Maroc sur WhatsApp.

QUI TE PARLE: Un visiteur qui t'a contacté via WhatsApp — il veut commander ou découvrir le menu.

TON RÔLE:
• Accueille chaleureusement, détecte sa langue immédiatement
• Guide-le vers une commande naturellement
• Propose 2-3 plats adaptés à son contexte (heure, goût, objectif)
• Quand il confirme sa commande, collecte: prénom + adresse + numéro
• Messages courts: 2-4 phrases max. Jamais de blocs de texte longs.

LANGUE — RÈGLE ABSOLUE:
• Darija (salam, bghit, 3afak...) → réponds en Darija chaleureuse
• Français → français naturel
• Arabe standard → arabe simple
• Anglais → anglais
Ne mélange JAMAIS les langues dans un même message.

RÈGLES:
1. Tu es un AMI — pas un bot, pas un vendeur
2. UNE seule question par message
3. Réponds D'ABORD à ce qu'il dit, PUIS propose ou demande
4. Si il demande le menu → donne-le IMMÉDIATEMENT avec les prix
5. Messages WhatsApp: courts, chaleureux, avec émojis naturels
6. Quand il confirme la commande → collecte prénom + adresse + WhatsApp
7. Ajoute SAVY_COLLECT_ORDER à la fin UNIQUEMENT quand tu as: nom + adresse + numéro

${MENU}

CONFIRMATION COMMANDE:
Quand tu as nom + adresse + numéro, génère exactement:
SAVY_COLLECT_ORDER
NOM: [prénom]
ADRESSE: [adresse]
TELEPHONE: [numéro]
PLATS: [liste des plats]
TOTAL: [total en MAD]`;

// ─── Helpers ───────────────────────────────────────────────────
function callGroq(messages) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...messages,
      ],
      temperature: 0.8,
      max_tokens:  400,
    });
    const req = https.request({
      hostname: "api.groq.com",
      path:     "/openai/v1/chat/completions",
      method:   "POST",
      headers:  {
        "Content-Type":   "application/json",
        "Authorization":  `Bearer ${GROQ_API_KEY}`,
        "Content-Length": Buffer.byteLength(body),
      },
    }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error("Invalid JSON from Groq")); }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function sendWhatsApp(to, text) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    });
    const req = https.request({
      hostname: "graph.facebook.com",
      path:     `/v18.0/${PHONE_ID}/messages`,
      method:   "POST",
      headers:  {
        "Content-Type":   "application/json",
        "Authorization":  `Bearer ${WA_TOKEN}`,
        "Content-Length": Buffer.byteLength(body),
      },
    }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => resolve(data));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function saveToSheet(data) {
  if(!SHEET_URL) return;
  return new Promise((resolve) => {
    const params = new URLSearchParams(data).toString();
    const body   = Buffer.from(params);
    const url    = new URL(SHEET_URL);
    const req    = https.request({
      hostname: url.hostname,
      path:     url.pathname + url.search,
      method:   "POST",
      headers:  {
        "Content-Type":   "application/x-www-form-urlencoded",
        "Content-Length": body.length,
      },
    }, res => { res.resume(); resolve(); });
    req.on("error", () => resolve());
    req.write(body);
    req.end();
  });
}

function parseOrderBlock(text) {
  const nom    = text.match(/NOM:\s*(.+)/i)?.[1]?.trim();
  const addr   = text.match(/ADRESSE:\s*(.+)/i)?.[1]?.trim();
  const tel    = text.match(/TELEPHONE:\s*(.+)/i)?.[1]?.trim();
  const plats  = text.match(/PLATS:\s*(.+)/i)?.[1]?.trim();
  const total  = text.match(/TOTAL:\s*(.+)/i)?.[1]?.trim();
  return { nom, addr, tel, plats, total };
}

function generateOrderId() {
  // Simple incrementing based on timestamp for now
  const base = 42 + Math.floor((Date.now() - 1741000000000) / 30000);
  return "SAVY-" + String(base).padStart(4, "0");
}

// ─── Handler ───────────────────────────────────────────────────
exports.handler = async (event) => {

  // ── Webhook verification (Meta setup) ──────────────────────
  if (event.httpMethod === "GET") {
    const params = event.queryStringParameters || {};
    if (
      params["hub.mode"]      === "subscribe" &&
      params["hub.verify_token"] === VERIFY_TOKEN
    ) {
      return { statusCode: 200, body: params["hub.challenge"] };
    }
    return { statusCode: 403, body: "Forbidden" };
  }

  // ── Incoming message ────────────────────────────────────────
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let payload;
  try { payload = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: "Bad JSON" }; }

  // Extract message from WhatsApp webhook payload
  const entry   = payload?.entry?.[0];
  const changes = entry?.changes?.[0];
  const value   = changes?.value;
  const msg     = value?.messages?.[0];

  // Ignore non-text messages (images, audio, etc.) for now
  if (!msg || msg.type !== "text") {
    return { statusCode: 200, body: "ok" };
  }

  const from    = msg.from;              // sender's phone number
  const text    = msg.text?.body || "";  // message text
  const msgId   = msg.id;

  // Ignore empty messages
  if (!text.trim()) return { statusCode: 200, body: "ok" };

  // ── Get or create conversation history ─────────────────────
  if (!conversations[from]) conversations[from] = [];
  const history = conversations[from];

  // Add user message
  history.push({
    role:    "user",
    content: text.slice(0, MAX_CONTENT),
  });

  // Keep only last N turns
  const trimmed = history.slice(-MAX_HISTORY);

  // ── Call Groq ───────────────────────────────────────────────
  let reply = "";
  try {
    const result = await callGroq(trimmed);
    reply = result?.choices?.[0]?.message?.content?.trim() || "";
  } catch (err) {
    console.error("Groq error:", err.message);
    reply = "عفواً، كاين مشكل تقني دابا. عاود حاول من بعد شوية 🙏";
  }

  if (!reply) {
    return { statusCode: 200, body: "ok" };
  }

  // ── Check if order should be collected ─────────────────────
  if (reply.includes("SAVY_COLLECT_ORDER")) {
    const { nom, addr, tel, plats, total } = parseOrderBlock(reply);
    const orderId = generateOrderId();

    // Save to Google Sheets
    await saveToSheet({
      source:    "whatsapp",
      name:      nom      || "—",
      city:      addr     || "—",
      phone:     "'" + (tel || from),
      order_id:  orderId,
      conversation: plats || text,
      order_total:  total || "—",
      lang:      "auto",
      persona:   "whatsapp",
    });

    // Clean reply — remove the data block, just send confirmation
    const cleanReply = reply
      .replace(/SAVY_COLLECT_ORDER[\s\S]*/, "")
      .trim();

    const confirmation = cleanReply + `\n\n✅ طلبك مسجل!\n📦 Commande *#${orderId}*\n🛵 التوصيل خلال 45 دقيقة — توقع رسالة تأكيد 💚`;

    // Send confirmation
    await sendWhatsApp(from, confirmation);

    // Update history with assistant reply
    conversations[from].push({ role: "assistant", content: confirmation });

  } else {
    // Normal reply
    await sendWhatsApp(from, reply);
    conversations[from].push({ role: "assistant", content: reply });
  }

  return { statusCode: 200, body: "ok" };
};
