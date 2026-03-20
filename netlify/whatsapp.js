const https = require("https");

// ─── Config ────────────────────────────────────────────────────
const VERIFY_TOKEN  = process.env.WHATSAPP_VERIFY_TOKEN;
const WA_TOKEN      = process.env.WHATSAPP_TOKEN;
const PHONE_ID      = process.env.WHATSAPP_PHONE_ID;
const GROQ_API_KEY  = process.env.GROQ_API_KEY;
const SHEET_URL     = process.env.GOOGLE_SHEET_URL;
const REDIS_URL     = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN   = process.env.UPSTASH_REDIS_REST_TOKEN;

const MAX_HISTORY   = 12;
const MAX_CONTENT   = 1500;
const GROQ_TIMEOUT  = 12000;
const TTL_SECONDS   = 60 * 60 * 24 * 7; // keep conversations 7 days

// ─── In-memory dedup only (ok to reset — just prevents double replies) ──
const processedMsgIds = new Set();

// ─── Redis helpers via Upstash REST API ───────────────────────
// No npm install needed — pure HTTPS calls to Upstash REST endpoint

async function redisGet(key) {
  if (!REDIS_URL || !REDIS_TOKEN) return null;
  try {
    const url = `${REDIS_URL}/get/${encodeURIComponent(key)}`;
    const res = await fetchJSON(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
    return res?.result ?? null;
  } catch { return null; }
}

async function redisSet(key, value, ttl = TTL_SECONDS) {
  if (!REDIS_URL || !REDIS_TOKEN) return;
  try {
    const url = `${REDIS_URL}/set/${encodeURIComponent(key)}`;
    await fetchJSON(url, {
      method: "POST",
      headers: {
        Authorization:  `Bearer ${REDIS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([value, "EX", ttl]),
    });
  } catch (e) { console.warn("Redis set error:", e.message); }
}

// ─── Generic HTTPS fetch returning parsed JSON ─────────────────
function fetchJSON(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const reqOptions = {
      hostname: parsed.hostname,
      path:     parsed.pathname + parsed.search,
      method:   options.method || "GET",
      headers:  options.headers || {},
    };

    let body = options.body || null;
    if (body && typeof body === "string") {
      reqOptions.headers["Content-Length"] = Buffer.byteLength(body);
    }

    const req = https.request(reqOptions, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(data); }
      });
    });

    req.on("error", reject);
    req.setTimeout(6000, () => { req.destroy(); reject(new Error("Redis timeout")); });
    if (body) req.write(body);
    req.end();
  });
}

// ─── Conversation memory via Redis ────────────────────────────
// Key: "savy:conv:{phone}"  Value: JSON array of messages

async function getHistory(phone) {
  const raw = await redisGet(`savy:conv:${phone}`);
  if (!raw) return [];
  try { return JSON.parse(raw); }
  catch { return []; }
}

async function saveHistory(phone, messages) {
  const trimmed = messages.slice(-MAX_HISTORY);
  await redisSet(`savy:conv:${phone}`, JSON.stringify(trimmed));
}

async function isFirstContact(phone) {
  const flag = await redisGet(`savy:first:${phone}`);
  return flag === null; // null means key doesn't exist = first contact
}

async function markContacted(phone) {
  await redisSet(`savy:first:${phone}`, "1", TTL_SECONDS * 52); // keep 1 year
}

// ─── Menu ─────────────────────────────────────────────────────
const MENU = `
MENU SAVY — disponible a Tetouan · M'diq · Martil
Livraison 45 min · Commande avant 21h · Cash ou Carte:

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

IDENTITE: Tu es un ami, pas un bot. Un chef passionne, pas un vendeur.

LANGUE — REGLE ABSOLUE:
• Darija (salam, bghit, 3afak, wakha, daba, mzyan, kifash, wach, labas...) → reponds en Darija chaleureuse et authentique
• Francais → francais naturel
• Arabe standard → arabe simple
• Anglais → anglais uniquement
Ne melange JAMAIS deux langues dans un meme message.

MEMOIRE: Tu te souviens de TOUT ce que le client a dit dans cette conversation. Utilise son prenom si tu le connais. Si il a deja commande avant, felicite-le pour sa fidelite.

REGLES DE CONVERSATION:
1. Reponds D'ABORD a ce que la personne dit
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

// ─── Send WhatsApp message ─────────────────────────────────────
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

// ─── Save to Google Sheets ─────────────────────────────────────
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

// ─── Utilities ─────────────────────────────────────────────────
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

  // Webhook verification (GET from Meta)
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

  // Deduplication (in-memory is fine here — prevents same invocation double-reply)
  const msgId = msg.id;
  if (msgId && processedMsgIds.has(msgId)) {
    return { statusCode: 200, body: "ok (dup)" };
  }
  if (msgId) {
    processedMsgIds.add(msgId);
    if (processedMsgIds.size > 500) {
      processedMsgIds.delete(processedMsgIds.values().next().value);
    }
  }

  const from = msg.from;

  // Handle non-text messages
  if (msg.type !== "text") {
    const lang = detectLang("");
    await sendWhatsApp(from, "📸 وصلني رسالتك — دابا كنرد غير على الرسائل النصية. اكتب ليا شنو بغيتي! 😊");
    return { statusCode: 200, body: "ok" };
  }

  const text = (msg.text?.body || "").trim();
  if (!text) return { statusCode: 200, body: "ok" };

  // ── Load history from Redis ────────────────────────────────
  let history = await getHistory(from);

  // ── First contact welcome (checked in Redis — survives cold starts) ──
  const newUser = await isFirstContact(from);
  if (newUser) {
    await markContacted(from);
    const welcome = getWelcomeMsg(text);
    await sendWhatsApp(from, welcome);

    // Store welcome in history
    history.push({ role: "assistant", content: welcome });

    // Pure greeting → welcome is enough
    const pureGreeting = /^(salam|bonjour|salut|hello|hi|مرحبا|أهلا|صباح|مساء)[\s!.،]*$/i.test(text);
    if (pureGreeting) {
      history.push({ role: "user", content: text });
      await saveHistory(from, history);
      return { statusCode: 200, body: "ok" };
    }
  }

  // Add user message to history
  history.push({ role: "user", content: text.slice(0, MAX_CONTENT) });

  // ── Call Groq ──────────────────────────────────────────────
  let reply = "";
  try {
    const result = await callGroq(history.slice(-MAX_HISTORY));
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
    await saveHistory(from, history);
    return { statusCode: 200, body: "ok" };
  }

  if (!reply) return { statusCode: 200, body: "ok" };

  // ── Order collection ───────────────────────────────────────
  if (reply.includes("SAVY_COLLECT_ORDER")) {
    const { nom, addr, tel, plats, total } = parseOrderBlock(reply);
    const orderId = generateOrderId();
    const lang    = detectLang(text);

    // Save order to Google Sheets (non-blocking)
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
    history.push({ role: "assistant", content: confirm });

  } else {
    await sendWhatsApp(from, reply);
    history.push({ role: "assistant", content: reply });
  }

  // ── Save updated history to Redis ──────────────────────────
  await saveHistory(from, history);

  return { statusCode: 200, body: "ok" };
};
