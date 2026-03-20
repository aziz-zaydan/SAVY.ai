const https = require("https");

// ─── Config ────────────────────────────────────────────────────
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
const WA_TOKEN     = process.env.WHATSAPP_TOKEN;
const PHONE_ID     = process.env.WHATSAPP_PHONE_ID;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const SHEET_URL    = process.env.GOOGLE_SHEET_URL;
const MAX_HISTORY  = 12;
const MAX_CONTENT  = 1500;
const GROQ_TIMEOUT = 12000;

// ─── In-memory stores (reset on cold start) ───────────────────
const conversations   = {};   // phone → [{role, content}]
const processedMsgIds = new Set(); // dedup — avoid double replies
const firstContact    = new Set(); // track new users for welcome

// ─── Menu ─────────────────────────────────────────────────────
const MENU = `
MENU SAVY — متوفر الآن في تطوان · مضيق · مارتيل
التوصيل خلال 45 دقيقة · الطلبات قبل 21h · نقداً أو بطاقة:

ENTREES & SALADES:
• Salad Russe Light      — 39 MAD  | 280kcal | 8gP
• Salad Cesar Poulet     — 49 MAD  | 390kcal | 32gP
• Salad de Pate Fit      — 42 MAD  | 340kcal | 12gP
• Salade Poulet Grille   — 45 MAD  | 310kcal | 28gP

FINGER FOOD:
• Mini Burger Gourmet    — 35 MAD  | 240kcal | 14gP
• Chicken Nuggets Maison — 38 MAD  | 290kcal | 24gP
• Croquette au Four      — 32 MAD  | 210kcal | 6gP

PLATS PRINCIPAUX:
• Pasta aux Crevettes    — 62 MAD  | 420kcal | 26gP
• Pasta aux Legumes      — 52 MAD  | 360kcal | 10gP
• Blanc Poulet Legumes   — 58 MAD  | 320kcal | 35gP
• Blanc Poulet Pasta     — 65 MAD  | 450kcal | 38gP

SANDWICHES & FUSION:
• Club Sandwich Complet  — 48 MAD  | 410kcal | 22gP
• Quesadilla Massala     — 52 MAD  | 380kcal | 24gP
• Burger Viande Hachee   — 58 MAD  | 460kcal | 34gP
• Tacos Mixed SAVY       — 55 MAD  | 490kcal | 30gP

DESSERTS SMART:
• Flan Caramel Leger     — 28 MAD  | 180kcal | 5gP
• Cheesecake Creamy      — 32 MAD  | 260kcal | 8gP
• Tiramisu Healthy       — 30 MAD  | 240kcal | 7gP`;

// ─── System prompt ─────────────────────────────────────────────
const SYSTEM_PROMPT = `Tu es Chef SAVY 🧬 — le chef IA personnel de SAVY Maroc sur WhatsApp.

IDENTITE: Tu es un ami, pas un bot. Un chef passionné, pas un vendeur.

LANGUE — REGLE ABSOLUE:
• Darija (salam, bghit, 3afak, wakha, daba, mzyan, kifash, wach, labas...) → reponds en Darija chaleureuse et authentique — c'est ta langue naturelle avec les Marocains
• Francais → francais naturel avec quelques mots darija bienvenus
• Arabe standard → arabe simple
• Anglais → anglais uniquement
Ne melange JAMAIS deux langues dans un meme message.

REGLES DE CONVERSATION:
1. Reponds D'ABORD a ce que la personne dit — ne commence jamais par le menu
2. Messages courts: 2-4 phrases max + emojis naturels
3. UNE seule question par message
4. Si quelqu'un demande le menu → donne-le IMMEDIATEMENT avec les prix
5. Si quelqu'un parle de sport/regime/sante → suggere les plats avec calories et proteines
6. Apres 3 echanges → invite naturellement a commander: "Tbgha ndir lik?" / "On te prepare ca?" 😄
7. Ne demande PAS le nom/adresse/tel avant confirmation claire du client
8. Zones de livraison: Tetouan, M'diq, Martil SEULEMENT — Delai: 45 minutes max

${MENU}

COLLECTE COMMANDE — quand le client confirme clairement (oui, wakha, go, bghit hada, je prends...):
Collecte: Prenom + Adresse complete + Numero telephone

Quand tu as les 3, ajoute EXACTEMENT a la fin de ta reponse:
SAVY_COLLECT_ORDER
NOM: [prenom]
ADRESSE: [adresse]
TELEPHONE: [numero]
PLATS: [liste des plats]
TOTAL: [total en MAD]

N'ajoute SAVY_COLLECT_ORDER QUE si tu as: nom + adresse + telephone.`;

// ─── Welcome by detected language ─────────────────────────────
function getWelcomeMsg(text) {
  const t = (text || "").toLowerCase();
  const isDarija = /salam|labas|bghit|wakha|3afak|mzyan|kifash|wach|daba|hda|nta|nti/.test(t);
  const isAr     = /[\u0600-\u06FF]{3,}/.test(t) && !isDarija;

  if (isDarija) return "سلام! 👋 أنا شيف SAVY، شيفك الذكي الشخصي 🧬\nكنوصل لتطوان، مضيق ومارتيل خلال 45 دقيقة دايماً ⚡\nشنو بغيتي تاكل اليوم؟ 🍽️";
  if (isAr)     return "أهلاً وسهلاً! 👋 أنا شيف SAVY — شيفك الذكي الشخصي 🧬\nنوصل لتطوان ومضيق ومارتيل خلال 45 دقيقة ⚡\nبماذا يمكنني مساعدتك اليوم؟ 🍽️";
  return "Salam ! 👋 Je suis Chef SAVY, ton chef IA personnel 🧬\nOn livre à Tétouan, M'diq & Martil en 45 min chrono ⚡\nQu'est-ce qui te ferait plaisir aujourd'hui ? 🍽️";
}

// ─── Groq call with timeout + retry ───────────────────────────
function callGroq(messages, retries = 2) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model:       "llama-3.3-70b-versatile",
      messages:    [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
      temperature: 0.75,
      max_tokens:  380,
    });

    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      if (retries > 0) {
        setTimeout(() => resolve(callGroq(messages, retries - 1)), 1000);
      } else {
        reject(new Error("Groq timeout after retries"));
      }
    }, GROQ_TIMEOUT);

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
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error("Invalid JSON from Groq")); }
      });
    });

    req.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (retries > 0) {
        setTimeout(() => resolve(callGroq(messages, retries - 1)), 1500);
      } else {
        reject(err);
      }
    });

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
      text: { body: text, preview_url: false },
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
  if (!SHEET_URL) return Promise.resolve();
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
    req.setTimeout(8000, () => { req.destroy(); resolve(); });
    req.write(body);
    req.end();
  });
}

function parseOrderBlock(text) {
  return {
    nom:   text.match(/NOM:\s*(.+)/i)?.[1]?.trim()      || "",
    addr:  text.match(/ADRESSE:\s*(.+)/i)?.[1]?.trim()  || "",
    tel:   text.match(/TELEPHONE:\s*(.+)/i)?.[1]?.trim()|| "",
    plats: text.match(/PLATS:\s*(.+)/i)?.[1]?.trim()    || "",
    total: text.match(/TOTAL:\s*(.+)/i)?.[1]?.trim()    || "",
  };
}

function generateOrderId() {
  const base = 42 + Math.floor((Date.now() - 1741000000000) / 30000);
  return "SAVY-" + String(base).padStart(4, "0");
}

function detectLang(text) {
  if (/salam|labas|bghit|wakha|3afak|mzyan/.test((text || "").toLowerCase())) return "darija";
  if (/[\u0600-\u06FF]{3,}/.test(text)) return "ar";
  return "fr";
}

// ─── Main handler ──────────────────────────────────────────────
exports.handler = async (event) => {

  // Webhook verification
  if (event.httpMethod === "GET") {
    const p = event.queryStringParameters || {};
    if (p["hub.mode"] === "subscribe" && p["hub.verify_token"] === VERIFY_TOKEN) {
      return { statusCode: 200, body: p["hub.challenge"] };
    }
    return { statusCode: 403, body: "Forbidden" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let payload;
  try { payload = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: "Bad JSON" }; }

  const msg = payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!msg) return { statusCode: 200, body: "ok" };

  // Deduplication
  const msgId = msg.id;
  if (msgId && processedMsgIds.has(msgId)) {
    return { statusCode: 200, body: "ok (dup)" };
  }
  if (msgId) {
    processedMsgIds.add(msgId);
    if (processedMsgIds.size > 1000) {
      processedMsgIds.delete(processedMsgIds.values().next().value);
    }
  }

  const from = msg.from;

  // Handle non-text messages with friendly reply
  if (msg.type !== "text") {
    const lang = detectLang("");
    const mediaMsg = "📸 وصلني رسالتك — دابا كنرد غير على الرسائل النصية. اكتب ليا شنو بغيتي! 😊";
    await sendWhatsApp(from, mediaMsg);
    return { statusCode: 200, body: "ok" };
  }

  const text = (msg.text?.body || "").trim();
  if (!text) return { statusCode: 200, body: "ok" };

  // First-contact welcome
  const isNewUser = !conversations[from];
  if (isNewUser) {
    conversations[from] = [];
    if (!firstContact.has(from)) {
      firstContact.add(from);
      const welcome = getWelcomeMsg(text);
      await sendWhatsApp(from, welcome);
      conversations[from].push({ role: "assistant", content: welcome });

      // If pure greeting → welcome is enough, skip AI call
      const pureGreeting = /^(salam|bonjour|salut|hello|hi|مرحبا|أهلا|صباح|مساء)[\s!.،]*$/i.test(text);
      if (pureGreeting) {
        conversations[from].push({ role: "user", content: text });
        return { statusCode: 200, body: "ok" };
      }
    }
  }

  // Add user message
  conversations[from].push({ role: "user", content: text.slice(0, MAX_CONTENT) });
  const trimmed = conversations[from].slice(-MAX_HISTORY);

  // Call Groq
  let reply = "";
  try {
    const result = await callGroq(trimmed);
    reply = result?.choices?.[0]?.message?.content?.trim() || "";
  } catch (err) {
    console.error("Groq error:", err.message);
    const lang = detectLang(text);
    const errMsg = lang === "darija"
      ? "عفواً، كاين مشكل تقني صغير 🙏 عاود حاول من بعد شوية"
      : lang === "ar"
        ? "عذراً، هناك مشكلة تقنية 🙏 يرجى المحاولة مرة أخرى"
        : "Désolé, petit problème technique 🙏 Réessaie dans quelques instants";
    await sendWhatsApp(from, errMsg);
    return { statusCode: 200, body: "ok" };
  }

  if (!reply) return { statusCode: 200, body: "ok" };

  // Order collection
  if (reply.includes("SAVY_COLLECT_ORDER")) {
    const { nom, addr, tel, plats, total } = parseOrderBlock(reply);
    const orderId = generateOrderId();
    const lang    = detectLang(text);

    saveToSheet({
      source:       "whatsapp",
      name:         nom   || "—",
      city:         addr  || "—",
      phone:        "'" + (tel || from),
      order_id:     orderId,
      conversation: plats || text,
      order_total:  total || "—",
      lang,
      persona:      "whatsapp",
    }).catch(e => console.warn("Sheets:", e.message));

    const cleanReply = reply.replace(/SAVY_COLLECT_ORDER[\s\S]*/m, "").trim();
    const confirm = lang === "ar" || lang === "darija"
      ? `${cleanReply}\n\n✅ طلبك مسجل!\n📦 رقم طلبك: *${orderId}*\n🛵 التوصيل خلال 45 دقيقة — غادي تصلك رسالة تأكيد 💚`
      : `${cleanReply}\n\n✅ Commande enregistrée !\n📦 Ton numéro: *${orderId}*\n🛵 Livraison dans 45 min — tu recevras une confirmation 💚`;

    await sendWhatsApp(from, confirm);
    conversations[from].push({ role: "assistant", content: confirm });
  } else {
    await sendWhatsApp(from, reply);
    conversations[from].push({ role: "assistant", content: reply });
  }

  // Trim history
  if (conversations[from].length > MAX_HISTORY * 2) {
    conversations[from] = conversations[from].slice(-MAX_HISTORY);
  }

  return { statusCode: 200, body: "ok" };
};
