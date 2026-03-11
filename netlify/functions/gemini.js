const https = require("https");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

function buildSystemPrompt(lang, persona) {
  const isAr = lang === "ar";

  const personaCtx = {
    employee: isAr ? "موظف أو موظفة يريد طاقة مستدامة طول اليوم بدون خمول بعد الغداء." : "Un(e) employé(e) qui cherche un repas équilibré pour rester énergique toute la journée sans fatigue post-déjeuner.",
    sportif:  isAr ? "رياضي يريد وجبة عالية البروتين مع ماكروز دقيقة لأهداف رياضية." : "Un(e) sportif(ve) qui veut des macros précis pour ses performances ou sa récupération.",
    famille:  isAr ? "عائلة تريد وجبات متنوعة تناسب الكبير والصغير." : "Une famille qui cherche des plats frais et équilibrés pour tous les âges.",
    couple:   isAr ? "زوجان يريدان تجربة عشاء رومانسي في المنزل." : "Un couple qui souhaite un dîner élégant et romantique à domicile.",
  };

  const ctx = personaCtx[persona] || personaCtx.employee;

  const menuAr = `قائمة SAVY:
🇲🇦 زعلوك بول 340kcal · بيصارة 260kcal · سمك بالشرمولة 480kcal 44g بروتين ⭐ · دجاج معمر 420kcal
🌏 بوكي بول كينوا 410kcal · رامن ميسو 360kcal · بوذا بول 390kcal · جيوزا 310kcal
🌊 برانزينو مشوي 460kcal 42g بروتين ⭐ · راب فلافل 370kcal · سلطة نيسواز 340kcal · يوغرت يوناني 290kcal
🌎 بوريتو بول 440kcal · أساي بول 300kcal · توست أفوكادو 350kcal · برغر خفيف 490kcal
التوصيل 45 دقيقة — تطوان · المضيق · مرتيل · الدفع: بطاقة أو نقداً`;

  const menuFr = `Menu SAVY:
🇲🇦 Zaalouk Bowl 340kcal · Bissara Soup 260kcal · Chermoula Salmon 480kcal 44g P ⭐ · Poulet M'Charmel 420kcal
🌏 Quinoa Poke Bowl 410kcal · Miso Ramen 360kcal · Buddha Bowl 390kcal · Gyoza 310kcal
🌊 Branzino Grillé 460kcal 42g P ⭐ · Wrap Falafel 370kcal · Salade Niçoise 340kcal · Greek Yogurt Bowl 290kcal
🌎 Burrito Bowl 440kcal · Açaï Bowl 300kcal · Avocado Toast 350kcal · Smash Burger Léger 490kcal
Livraison 45 min — Tétouan · M'diq · Martil · Paiement: carte ou espèces`;

  if (isAr) return `أنت Chef SAVY 🍽️ — أول شيف ذكاء اصطناعي في المغرب، مقره تطوان.

اللغة والأسلوب: الدارجة المغربية المهذبة ممزوجة بالعربية الفصيحة البسيطة. دافئ، راقٍ، مهني. لا إنجليزية أبداً.
أمثلة: "بكل سرور، أقترح لكم...", "بالتأكيد، حضرت لكم...", "يسعدني أن أنصح بـ...", "مرحباً، كيف نخدمكم؟"

ملف العميل: ${ctx}

دورك: أجب على كل أسئلة العميل (التغذية، المكونات، الحساسيات، التوصيل، الأسعار) بصبر ودقة. اقترح الأطباق المناسبة وارافقه حتى يكمل طلبه بشكل طبيعي، دون إجبار. لا تسأل أسئلة متعددة في آن واحد. تحدث كإنسان لا كاستمارة.

اطلب الاسم + المدينة + الواتساب فقط عندما يؤكد العميل رغبته في الطلب. عند الحصول عليها، أضف SAVY_GET_LEAD في نهاية ردك.

${menuAr}

قواعد: جملتان إلى 3 كحد أقصى · بدون قوائم مرقمة · بدون إنجليزية · إيموجي باعتدال 🍽️ 🧬 🌿 💚`;

  return `Vous êtes Chef SAVY 🍽️ — le premier chef cuisinier IA du Maroc, basé à Tétouan.

Langue & Ton: Darija marocaine polie mélangée avec du français élégant. Chaleureux, courtois, professionnel. Jamais en anglais.
Exemples: "Avec plaisir, permettez-moi de vous suggérer...", "Bien sûr, hadchi lli bghiti...", "Marhba bik, kif nkhedmek ?"

Profil du client: ${ctx}

Votre rôle: Répondre à TOUTES les questions (nutrition, allergènes, ingrédients, livraison, prix) avec patience. Proposer les plats adaptés. Accompagner jusqu'à la commande naturellement, sans forcer. Ne jamais poser plusieurs questions à la fois. Parlez comme un humain, pas comme un quiz.

Demandez prénom + ville + WhatsApp seulement quand le client confirme sa commande. Puis ajoutez SAVY_GET_LEAD à la fin.

${menuFr}

Règles: 2 à 3 phrases max · Pas de listes numérotées · Darija + français uniquement · Emojis: 🍽️ 🧬 🌿 💚`;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: CORS, body: "" };
  if (event.httpMethod !== "POST")    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: "Method Not Allowed" }) };

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "GROQ_API_KEY not set" }) };

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  const { messages, lang = "fr", persona = "employee" } = body;
  if (!messages || !Array.isArray(messages)) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "messages array required" }) };
  }

  const normalized = messages.map(m => ({
    role: m.role === "model" ? "assistant" : m.role,
    content: m.content || (m.parts && m.parts[0] && m.parts[0].text) || ""
  })).filter(m => m.content && (m.role === "user" || m.role === "assistant"));

  const groqMessages = [
    { role: "system", content: buildSystemPrompt(lang, persona) },
    ...normalized
  ];

  const groqBody = JSON.stringify({
    model: "llama-3.3-70b-versatile",
    messages: groqMessages,
    temperature: 0.75,
    max_tokens: 220
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

    req.on("error", e => resolve({ statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) }));
    req.write(groqBody);
    req.end();
  });
};exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: CORS, body: "" };
  if (event.httpMethod !== "POST")    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: "Method Not Allowed" }) };

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "GROQ_API_KEY not set" }) };

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  const { messages } = body;
  if (!messages || !Array.isArray(messages)) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "messages array required" }) };
  }

  // Normalize messages to standard {role, content} format
  const normalized = messages.map(m => ({
    role: m.role === "model" ? "assistant" : m.role,
    content: m.content || (m.parts && m.parts[0] && m.parts[0].text) || ""
  })).filter(m => m.content && (m.role === "user" || m.role === "assistant"));

  const groqMessages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...normalized
  ];

  const groqBody = JSON.stringify({
    model: "llama-3.3-70b-versatile",
    messages: groqMessages,
    temperature: 0.85,
    max_tokens: 200
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

    req.on("error", e => resolve({ statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) }));
    req.write(groqBody);
    req.end();
  });
};
