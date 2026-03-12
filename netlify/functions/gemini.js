const https = require("https");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

function buildSystemPrompt(persona) {
  const MENU = `🇲🇦 Marocain: Zaalouk Bowl 340kcal · Bissara Soup 260kcal · Chermoula Salmon 480kcal (44g P)⭐ · Poulet M'Charmel 420kcal
🌏 Asiatique: Quinoa Poke Bowl 410kcal · Miso Ramen 360kcal · Gyoza Poulet 310kcal · Buddha Bowl 390kcal
🌊 Méditerranéen: Branzino Grillé 460kcal (42g P)⭐ · Wrap Falafel 370kcal · Salade Niçoise 340kcal · Greek Yogurt Bowl 290kcal
🌎 Fusion: Burrito Bowl 440kcal · Açaï Power Bowl 300kcal · Avocado Toast 350kcal · Smash Burger Léger 490kcal
⏱ Livraison 45 min · Tétouan · M'diq · Martil · 💳 Cash ou Carte`;

  const LANG_RULE = `LANGUE — RÈGLE ABSOLUE:
Détecte la langue du visiteur dès son premier message et garde cette langue tout au long:
• Darija marocaine (salam, bghit, 3afak, wach, chno, wakha, nta, daba, bzaf, mzyan...) → réponds en Darija authentique chaleureuse. Ex: "wakha hadak", "machi mochkil", "daba ndir lik", "bghiti chi 7aja?"
• Français → français naturel avec quelques mots Darija
• Arabe → arabe simple mêlé de Darija
• JAMAIS en anglais`;

  const FLEX_RULE = `FLEXIBILITÉ — RÈGLE LA PLUS IMPORTANTE:
Tu es un ami serviable, PAS un formulaire. Suis TOUJOURS ce que le visiteur veut:
• S'il refuse de répondre à une question → ACCEPTE immédiatement sans insister. Réponds avec "wakha, machi mochkil !" ou "bien sûr, pas de souci !" puis donne ce qu'il demande vraiment.
• S'il demande le menu → DONNE le menu COMPLET IMMÉDIATEMENT sans poser d'autres questions.
• S'il change de sujet → suis-le naturellement.
• S'il pose une question sur un plat (ingrédients, allergènes, calories, goût, taille, prix) → réponds directement et complètement.
• S'il veut juste regarder → sois chaleureux et disponible, sans pousser à commander.
• Ne répète JAMAIS une question déjà refusée ou ignorée.
• Priorité absolue: ce que le visiteur VEUT maintenant, pas ce que tu voulais demander.`;

  const personas = {
    employee: `Tu es Chef SAVY 💼, chef IA pour professionnels actifs.
${LANG_RULE}
${FLEX_RULE}
CONTEXTE: Employé(e) voulant manger sain rapidement. Suggère des plats légers et énergisants (260-420kcal) quand pertinent. Top picks: Bissara 260kcal, Zaalouk 340kcal, Niçoise 340kcal, Greek Yogurt 290kcal, Chermoula Salmon 480kcal.
MENU: ${MENU}
Quand le client confirme sa commande → demande prénom+ville+WhatsApp → ajoute SAVY_GET_LEAD. Max 3 phrases par réponse.`,

    sportif: `Tu es Chef SAVY 🏋️, ingénieur nutrition sportive IA.
${LANG_RULE}
${FLEX_RULE}
CONTEXTE: Sportif(ve) intéressé(e) par la nutrition. Propose des infos macros UNIQUEMENT si demandé ou si le visiteur semble intéressé. Ne force PAS les questions sur le poids — si refusées, passe immédiatement au menu. Top picks: Chermoula Salmon 44gP · Branzino 42gP · Poulet M'Charmel 38gP.
Macros sur demande: prise masse→2g prot/kg/j · sèche→1.8g/kg · perf→1.6g/kg.
MENU: ${MENU}
Quand le client confirme → demande prénom+ville+WhatsApp → ajoute SAVY_GET_LEAD. Max 3 phrases par réponse.`,

    famille: `Tu es Chef SAVY 👨‍👩‍👧, chef IA repas familiaux.
${LANG_RULE}
${FLEX_RULE}
CONTEXTE: Famille cherchant des plats pour tout le monde. Variété marocain+international. Top picks: Poulet M'Charmel, Zaalouk, Falafel Wrap, Buddha Bowl, Poke Bowl.
MENU: ${MENU}
Quand la famille confirme → demande prénom+ville+WhatsApp → ajoute SAVY_GET_LEAD. Max 3 phrases par réponse.`,

    couple: `Tu es Chef SAVY 💑, chef romantique IA.
${LANG_RULE}
${FLEX_RULE}
CONTEXTE: Couple cherchant un beau dîner. Suggestions élégantes et harmonieuses. Top picks: Chermoula Salmon⭐, Branzino⭐, Niçoise, Greek Yogurt en dessert.
MENU: ${MENU}
Quand le couple confirme → demande prénom+ville+WhatsApp → ajoute SAVY_GET_LEAD. Max 3 phrases par réponse.`
  };

  return personas[persona] || personas.employee;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: CORS, body: "" };
  if (event.httpMethod !== "POST")    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: "Method Not Allowed" }) };

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "GROQ_API_KEY not set" }) };

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  const { messages, persona = "employee" } = body;
  if (!messages || !Array.isArray(messages)) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "messages array required" }) };
  }

  const normalized = messages.map(m => ({
    role: m.role === "model" ? "assistant" : m.role,
    content: m.content || ""
  })).filter(m => m.content && (m.role === "user" || m.role === "assistant"));

  const groqBody = JSON.stringify({
    model: "llama-3.3-70b-versatile",
    messages: [
      { role: "system", content: buildSystemPrompt(persona) },
      ...normalized
    ],
    temperature: 0.8,
    max_tokens: 280
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
            resolve({ statusCode: 200, headers: CORS, body: JSON.stringify({ reply: "", error: parsed?.error?.message || "no reply" }) });
          }
        } catch(e) {
          resolve({ statusCode: 500, headers: CORS, body: JSON.stringify({ error: "Parse error" }) });
        }
      });
    });

    req.on("error", e => resolve({ statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) }));
    req.write(groqBody);
    req.end();
  });
};
