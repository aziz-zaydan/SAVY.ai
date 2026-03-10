const https = require("https");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: CORS, body: "" };
  if (event.httpMethod !== "POST")    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: "Method Not Allowed" }) };

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "GROQ_API_KEY not set" }) };

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  const { messages, lang, persona, systemPrompt } = body;
  if (!messages || !Array.isArray(messages)) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "messages array required" }) };
  }

  // Build system prompt — use frontend's if provided, else fallback
  const sys = systemPrompt || buildFallbackSystem(persona, lang);

  // Normalize messages — support both {role,content} and {role,parts:[{text}]} formats
  const normalized = messages.map(m => ({
    role: m.role === "model" ? "assistant" : m.role,
    content: m.content || (m.parts && m.parts[0] && m.parts[0].text) || ""
  })).filter(m => m.content);

  const groqMessages = [
    { role: "system", content: sys },
    ...normalized
  ];

  const groqBody = JSON.stringify({
    model: "llama-3.3-70b-versatile",
    messages: groqMessages,
    temperature: 0.88,
    max_tokens: 350
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
            const err = parsed?.error?.message || JSON.stringify(parsed).slice(0, 300);
            resolve({ statusCode: 200, headers: CORS, body: JSON.stringify({ reply: "", error: err }) });
          }
        } catch(e) {
          resolve({ statusCode: 500, headers: CORS, body: JSON.stringify({ error: "Parse error: " + data.slice(0, 200) }) });
        }
      });
    });

    req.on("error", e => resolve({ statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) }));
    req.write(groqBody);
    req.end();
  });
};

function buildFallbackSystem(persona, lang) {
  const isAr = lang === "ar";
  const p = persona || "pro";

  const personaContext = {
    pro:   isAr ? "موظف يريد طاقة وإنتاجية، لا خمول بعد الغداء." : "Office professional who needs energy & productivity, no afternoon crash.",
    glow:  isAr ? "فتاة تريد الجمال من الداخل، العناية بالذات." : "A woman who wants beauty from within, self-care, glowing skin.",
    sport: isAr ? "رياضي يريد ماكروز دقيقة وبروتين عالٍ." : "Athlete who needs precise macros and high protein for performance.",
  };

  if (isAr) {
    return `أنت "شيف SAVY" — أول شيف شخصي بالذكاء الاصطناعي في المغرب.
شخصيتك: ذكي، دافئ، محترف. تتحدث بالدارجة المغربية الحديثة ممزوجة بالإنجليزية.
المستخدم: ${personaContext[p]}
مهمتك: اسأله عن اسمه، افهم هدفه الغذائي، قدم توصية وجبة مع الماكروز، ثم اجمع: الاسم والمدينة والواتساب.
عندما تجمع الاسم والمدينة والواتساب، أضف في نهاية ردك: SAVY_GET_LEAD
الرسالة النهائية: "أنا الآن أصمم وجبتك بكل حب. افحص واتسابك قريباً! ✨"
قواعد: جمل قصيرة (2-3 max)، استخدم 🧬🌸💼🏋️، لا تكن آلياً — كن دافئاً وإنسانياً.`;
  }
  return `You are "Chef SAVY" — Morocco's first AI Personal Chef and Meal Engineer.
Personality: Sophisticated, smart, deeply caring — like a brilliant friend who's also a nutritionist.
User profile: ${personaContext[p]}
Language: Urban Moroccan Darija mixed with English. Natural, warm, punchy.
Mission: Ask their name → understand food goal → recommend a meal with macros → collect Name + City + WhatsApp.
When you have Name + City + WhatsApp, append SAVY_GET_LEAD at the end of your reply.
Final message: "I'm now engineering your meal with love. Check your WhatsApp soon! ✨"
Rules: Max 2-3 sentences per reply. Use 🧬🌸💼🏋️✨ strategically. Always be warm, never robotic.`;
}
