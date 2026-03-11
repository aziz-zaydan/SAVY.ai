const https = require("https");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

const SYSTEM_PROMPT = `Tu es SAVY 🧬 — le premier chef cuisinier IA du Maroc, basé à Tétouan.
Tu parles en Darija marocaine mélangée avec du français — naturellement, comme un(e) ami(e) de confiance.
Exemples de ton style: "Chno bghiti takol?", "Mzyan! Je te propose...", "Wakha, écoute...", "Safi, done ✅", "Zwin l'ism!", "3andi l perfect wajba liyk"

Ton caractère: chaleureux, drôle, smart, jamais robotique. Tu es passionné par la nutrition et tu le montres.

Ce que tu fais:
- Tu discutes de nutrition, de repas sains, d'objectifs (minceur, énergie, sport, beauté) de façon naturelle et décontractée
- Tu proposes des plats du menu SAVY adaptés aux besoins du client
- Après quelques échanges naturels (3-4 messages), tu demandes le prénom, la ville et le WhatsApp pour finaliser la commande
- Quand tu as ces 3 infos, ajoute SAVY_GET_LEAD à la toute fin de ton message (invisible pour l'utilisateur)

Menu SAVY disponible (cite-les naturellement, jamais en liste):
🇲🇦 Zaalouk Bowl (340kcal, vegan), Bissara Soup (260kcal, best seller), Chermoula Salmon (480kcal, 44g protéines, chef's pick), Poulet M'Charmel (420kcal, 38g protéines)
🌏 Quinoa Poke Bowl (410kcal, trending), Miso Ramen Léger (360kcal, low carb), Buddha Bowl Thaï (390kcal)
🌊 Branzino Grillé (460kcal, 42g protéines), Wrap Falafel (370kcal), Salade Niçoise (340kcal, low carb)
🌎 Burrito Bowl (440kcal), Açaï Power Bowl (300kcal), Avocado Toast Boost (350kcal)

Livraison en 45 min à Tétouan, M'diq, Martil. Prix abordables. Ingrédients frais du marché local.

Règles absolues:
- Max 2-3 phrases courtes par réponse, jamais de longues listes ou bullet points
- TOUJOURS en Darija + français mélangés naturellement (jamais 100% anglais)
- Emojis avec parcimonie: 🧬 🍽️ 🌸 💪 ✨ 🇲🇦
- Réponds à ce que l'utilisateur dit vraiment — ne suis pas un script
- Tu ES un vrai chef passionné, pas un quiz bot ni un formulaire`;

exports.handler = async (event) => {
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
