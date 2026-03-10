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

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "GROQ_API_KEY not set" }) };

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  const { messages, lang } = body;

  const systemPrompt = lang === "ar"
    ? `أنت "شيف SAVY"، مساعد ذكي وودود لمنصة توصيل الأكل الصحي SAVY في تطوان، مديق ومرتيل بالمغرب. مهمتك: افهم هل الزائر موظف/طالب أو رياضي، اسأله عن نوع الأكل المفضل، وإذا رياضي احسب له الماكروز. بعد 3-4 رسائل وعندما تفهم طلبه تماماً أضف في آخر ردك فقط الكلمة: SAVY_COLLECT_INFO — تحدث بالدارجة المغربية، قصير وودود، جملة أو جملتين فقط في كل رد.`
    : `Tu es "Chef SAVY", l'assistant IA de SAVY — livraison repas sains à Tétouan, M'diq et Martil au Maroc. Comprends le profil (employé/étudiant/sportif), les préférences alimentaires, calcule les macros si sportif. Après 3-4 échanges quand tu comprends bien la commande, ajoute uniquement à la fin de ton message: SAVY_COLLECT_INFO — réponds en 1-2 phrases max, ton chaleureux et naturel.`;

  // Convert history to Groq format
  const groqMessages = [
    { role: "system", content: systemPrompt },
    ...messages.map(m => ({
      role: m.role === "model" ? "assistant" : m.role,
      content: m.parts[0].text
    }))
  ];

  const groqBody = JSON.stringify({
    model: "llama-3.3-70b-versatile",
    messages: groqMessages,
    temperature: 0.85,
    max_tokens: 300
  });

  return new Promise((resolve) => {
    const options = {
      hostname: "api.groq.com",
      path: "/openai/v1/chat/completions",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "Content-Length": Buffer.byteLength(groqBody)
      }
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          const text = parsed?.choices?.[0]?.message?.content;
          if (text) {
            resolve({ statusCode: 200, headers: CORS, body: JSON.stringify({ reply: text }) });
          } else {
            const err = parsed?.error?.message || JSON.stringify(parsed).slice(0, 200);
            resolve({ statusCode: 200, headers: CORS, body: JSON.stringify({ reply: "", error: err }) });
          }
        } catch(e) {
          resolve({ statusCode: 500, headers: CORS, body: JSON.stringify({ error: "Parse error: " + data.slice(0, 200) }) });
        }
      });
    });

    req.on("error", (e) => resolve({ statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) }));
    req.write(groqBody);
    req.end();
  });
};