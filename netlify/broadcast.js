// /.netlify/functions/broadcast.js
// SAVY WhatsApp Broadcast Sender
// Protected by BROADCAST_SECRET env variable
// POST { secret, message, numbers: ["212XXXXXXXXX", ...] }

const https = require("https");

const WA_TOKEN   = process.env.WHATSAPP_TOKEN;
const PHONE_ID   = process.env.WHATSAPP_PHONE_ID;
const SECRET     = process.env.BROADCAST_SECRET; // set in Netlify env vars
const DELAY_MS   = 1000; // 1 second between messages (Meta rate limit safe)

const CORS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function sendWhatsApp(to, text) {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      messaging_product: "whatsapp",
      to: to.replace(/\s+/g, "").replace(/^0/, "212"),
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
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.messages?.[0]?.id) {
            resolve({ to, status: "sent", id: parsed.messages[0].id });
          } else {
            resolve({ to, status: "failed", error: parsed.error?.message || "Unknown error" });
          }
        } catch {
          resolve({ to, status: "failed", error: "Parse error" });
        }
      });
    });

    req.on("error", (err) => resolve({ to, status: "failed", error: err.message }));
    req.setTimeout(8000, () => { req.destroy(); resolve({ to, status: "failed", error: "Timeout" }); });
    req.write(body);
    req.end();
  });
}

exports.handler = async (event) => {

  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: "POST only" }) };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Bad JSON" }) }; }

  // Auth check
  if (!SECRET || body.secret !== SECRET) {
    return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  const { message, numbers } = body;

  if (!message || !message.trim()) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "message required" }) };
  }

  if (!Array.isArray(numbers) || numbers.length === 0) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "numbers array required" }) };
  }

  if (numbers.length > 500) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Max 500 numbers per broadcast" }) };
  }

  // Send with delay between each
  const results = [];
  let sent = 0, failed = 0;

  for (const num of numbers) {
    const result = await sendWhatsApp(num, message);
    results.push(result);
    if (result.status === "sent") sent++;
    else failed++;
    if (numbers.indexOf(num) < numbers.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  return {
    statusCode: 200,
    headers: CORS,
    body: JSON.stringify({
      summary: { total: numbers.length, sent, failed },
      results,
    }),
  };
};
