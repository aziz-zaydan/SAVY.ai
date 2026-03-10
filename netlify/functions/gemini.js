const https = require("https");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: CORS, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: "Method Not Allowed" }) };

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "GEMINI_API_KEY not set" }) };

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  const { messages, lang } = body;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "messages required" }) };
  }

  const systemPrompt = lang === "ar"
    ? `أنت "شيف SAVY"، مساعد ذكي وودود لمنصة توصيل الأكل الصحي SAVY في تطوان، مديق ومرتيل بالمغرب. مهمتك: افهم هل الزائر موظف/طالب أو رياضي، اسأله عن نوع الأكل المفضل، وإذا رياضي احسب له الماكروز. بعد 3-4 رسائل وعندما تفهم طلبه تماماً أضف في آخر ردك فقط: SAVY_COLLECT_INFO — تحدث بالدارجة المغربية، قصير وودود، جملة أو جملتين فقط في كل رد.`
    : `Tu es "Chef SAVY", l'assistant IA de SAVY — livraison repas sains à Tétouan, M'diq et Martil. Comprends le profil (employé/étudiant/sportif), les préférences alimentaires, calcule les macros si sportif. Après 3-4 échanges quand tu comprends bien la commande, ajoute uniquement à la fin: SAVY_COLLECT_INFO — réponds en 1-2 phrases max, ton chaleureux et naturel.`;

  // Inject system prompt into first user message
  const contents = messages.map((m, i) => {
    if (i === 0 && m.role === "user") {
      return { role: "user", parts: [{ text: systemPrompt + "\n\n" + m.parts[0].text }] };
    }
    return m;
  });

  const geminiBody = JSON.stringify({
    contents,
    generationConfig: { temperature: 0.85, maxOutputTokens: 300 }
  });

  return new Promise((resolve) => {
    const options = {
      hostname: "generativelanguage.googleapis.com",
      path: `/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(geminiBody)
      }
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            resolve({ statusCode: 200, headers: CORS, body: JSON.stringify({ reply: text }) });
          } else {
            const errInfo = parsed?.error?.message || parsed?.promptFeedback?.blockReason || JSON.stringify(parsed).slice(0, 200);
            resolve({ statusCode: 200, headers: CORS, body: JSON.stringify({ reply: "", error: errInfo }) });
          }
        } catch(e) {
          resolve({ statusCode: 500, headers: CORS, body: JSON.stringify({ error: "Parse error: " + data.slice(0, 200) }) });
        }
      });
    });

    req.on("error", (e) => resolve({ statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) }));
    req.write(geminiBody);
    req.end();
  });
};
