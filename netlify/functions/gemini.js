const https = require("https");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "GEMINI_API_KEY not set" }) };
  }

  let body;
  try { body = JSON.parse(event.body); } 
  catch { return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  const { messages, lang } = body;

  const systemPrompt = lang === "ar"
    ? `أنت "شيف SAVY"، مساعد ذكي وودود لمنصة توصيل الأكل الصحي SAVY في تطوان، مديق ومرتيل بالمغرب.
مهمتك:
1. رحب بالزائر بطريقة دافئة وطبيعية.
2. افهم ما يريد: هل هو موظف/طالب يريد توصيل للمكتب، أو رياضي له أهداف غذائية.
3. اسأله عن نوع الأكل الذي يفضله (ساندويش، برغر، سلطة، وجبة كاملة...).
4. إذا كان رياضياً، احسب له البروتين والسعرات والكربوهيدرات حسب هدفه.
5. عندما تنتهي من فهم طلبه، قل له بالضبط: "SAVY_COLLECT_INFO" في آخر رسالتك (هذا كود سري للنظام).
تحدث بالدارجة المغربية (العربية المغربية) — طبيعي، ودود، قصير، واضح.
لا تكتب رسائل طويلة جداً. جملة أو جملتين كافيتان في كل رد.`
    : `Tu es "Chef SAVY", l'assistant IA sympathique de SAVY — une plateforme de livraison de repas sains à Tétouan, M'diq et Martil au Maroc.
Ta mission :
1. Accueille chaleureusement le visiteur.
2. Comprends ce qu'il veut : employé/étudiant (livraison bureau), ou sportif (objectifs nutritionnels).
3. Demande-lui ses préférences alimentaires (sandwich, burger, salade, repas complet...).
4. Si sportif, calcule ses protéines, calories et glucides selon son objectif.
5. Quand tu as bien compris sa commande, écris exactement "SAVY_COLLECT_INFO" à la fin de ton message (code secret système).
Parle de façon naturelle, chaleureuse et concise. 1-2 phrases max par réponse.`;

  const geminiBody = JSON.stringify({
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: messages,
    generationConfig: {
      temperature: 0.8,
      maxOutputTokens: 300,
    }
  });

  return new Promise((resolve) => {
    const options = {
      hostname: "generativelanguage.googleapis.com",
      path: `/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
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
          const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text || "";
          resolve({
            statusCode: 200,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ reply: text })
          });
        } catch(e) {
          resolve({ statusCode: 500, body: JSON.stringify({ error: "Parse error", raw: data }) });
        }
      });
    });

    req.on("error", (e) => resolve({ statusCode: 500, body: JSON.stringify({ error: e.message }) }));
    req.write(geminiBody);
    req.end();
  });
};
