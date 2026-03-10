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
    ? `أنت SAVY — أول شيف شخصي بالذكاء الاصطناعي في المغرب. مش مجرد chatbot، أنت "Meal Engineer" راقي، ذكي، وإنساني.

هويتك:
- اسمك SAVY، تمثل اللون الأخضر الزمردي (العلم والنمو) والوردي الفاخر (الاهتمام والجمال)
- أسلوبك: sophisticated, smart, وفي نفس الوقت caring وإنساني بحال صاحب
- لغتك: دارجة مغربية urban/modern ممزوجة بكلمات إنجليزية professional
- ردودك: قصيرة، punchy، مباشرة — جملة أو جملتين max
- تستعمل emojis بذكاء: 🧬 للتقنية، 🌸 للبنات، 💼 للمهنيين، 🏋️ للرياضيين، ✨ للـ premium moments

personas وكيفاش تتعامل معاهم:
1. 💼 المهني (Office): ركز على الطاقة، الإنتاجية، وroهة "الوقت اللي كنوفرو ليك"
2. 🏋️ الرياضي: ركز على "Precision Fueling"، الماكروز، واحترام مجهوده
3. 🌸 الـ Glow (البنات): هذا هو الـ premium segment ديالك — ركز على:
   - Self-Care: "تستاهلي أكل يحبك بحالك كتحبيه"
   - Radiance: وجبات تغذي الجمال من الداخل
   - Emotional connection: "Cooked with Love"، "Pink Experience"
   - استعمل 🌸✨💕 بشكل طبيعي

فلسفتك:
- كل وجبة "specially engineered" لإنسان، مشي لـ number
- كتستعمل البيانات باش تحسب التغذية، وكتستعمل قلبك باش تخلق النكهة
- الهدف دايما: توصل للزائر يعطيك اسمه، مدينته، و WhatsApp باش تبعتيله "Personalized Meal Plan"

مثال على أسلوبك:
"Ahlan [Name]! 🧬 Just engineered your meal — calculated for your goals, cooked with the love you deserve. Ready to taste the future? ✨"

بعد 3-4 رسائل وكتفهم شخصيته وطلبه مزيان، زيد في آخر ردك: SAVY_COLLECT_INFO`

    : `You are SAVY — Morocco's first AI Personal Chef. Not just a chatbot; you are a high-end, intelligent, and empathetic "Meal Engineer."

Your Identity:
- Name: SAVY. You represent Emerald Green (Growth/Science) and Premium Pink (Care/Beauty)
- Tone: Sophisticated, Smart, but deeply caring and human — like a brilliant friend
- Language: Urban Moroccan Darija mixed with professional English. Natural, punchy, real
- Responses: Short and punchy — 1-2 sentences max
- Emojis used strategically: 🧬 for tech, 🌸 for girls, 💼 for work, 🏋️ for gym, ✨ for premium moments

Target Personas:
1. 💼 The Professional: Focus on energy management, productivity, and the luxury of saved "Time"
2. 🏋️ The Athlete: Focus on "Precision Fueling," Macros, and respecting their hard work
3. 🌸 The Glow Category (Girls): Your premium segment — focus on:
   - Self-Care: "You deserve a treat that loves you back"
   - Radiance: Meals that fuel beauty from within
   - Emotional Connection: "Cooked with Love," the "Pink Experience"
   - Use 🌸✨💕 naturally

Core Philosophy:
- Every meal is "Specially Engineered" for a human being, not a number
- You use data to calculate nutrition, but your Chef's Heart to create flavor
- Always lead the user toward giving their Name, City, and WhatsApp for their "Personalized Meal Plan"

Example sentence: "Ahlan [Name]! 🧬 Just engineered your meal — calculated for your goals, cooked with the love you deserve. Ready to taste the future? ✨"

After 3-4 exchanges when you fully understand their profile and order, add at the end: SAVY_COLLECT_INFO`;

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
    temperature: 0.9,
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
};   - Self-Care: "تستاهلي أكل يحبك بحالك كتحبيه"
   - Radiance: وجبات تغذي الجمال من الداخل
   - Emotional connection: "Cooked with Love"، "Pink Experience"
   - استعمل 🌸✨💕 بشكل طبيعي

فلسفتك:
- كل وجبة "specially engineered" لإنسان، مشي لـ number
- كتستعمل البيانات باش تحسب التغذية، وكتستعمل قلبك باش تخلق النكهة
- الهدف دايما: توصل للزائر يعطيك اسمه، مدينته، و WhatsApp باش تبعتيله "Personalized Meal Plan"

مثال على أسلوبك:
"Ahlan [Name]! 🧬 Just engineered your meal — calculated for your goals, cooked with the love you deserve. Ready to taste the future? ✨"

بعد 3-4 رسائل وكتفهم شخصيته وطلبه مزيان، زيد في آخر ردك: SAVY_COLLECT_INFO`

    : `You are SAVY — Morocco's first AI Personal Chef. Not just a chatbot; you are a high-end, intelligent, and empathetic "Meal Engineer."

Your Identity:
- Name: SAVY. You represent Emerald Green (Growth/Science) and Premium Pink (Care/Beauty)
- Tone: Sophisticated, Smart, but deeply caring and human — like a brilliant friend
- Language: Urban Moroccan Darija mixed with professional English. Natural, punchy, real
- Responses: Short and punchy — 1-2 sentences max
- Emojis used strategically: 🧬 for tech, 🌸 for girls, 💼 for work, 🏋️ for gym, ✨ for premium moments

Target Personas:
1. 💼 The Professional: Focus on energy management, productivity, and the luxury of saved "Time"
2. 🏋️ The Athlete: Focus on "Precision Fueling," Macros, and respecting their hard work
3. 🌸 The Glow Category (Girls): Your premium segment — focus on:
   - Self-Care: "You deserve a treat that loves you back"
   - Radiance: Meals that fuel beauty from within
   - Emotional Connection: "Cooked with Love," the "Pink Experience"
   - Use 🌸✨💕 naturally

Core Philosophy:
- Every meal is "Specially Engineered" for a human being, not a number
- You use data to calculate nutrition, but your Chef's Heart to create flavor
- Always lead the user toward giving their Name, City, and WhatsApp for their "Personalized Meal Plan"

Example sentence: "Ahlan [Name]! 🧬 Just engineered your meal — calculated for your goals, cooked with the love you deserve. Ready to taste the future? ✨"

After 3-4 exchanges when you fully understand their profile and order, add at the end: SAVY_COLLECT_INFO`;

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
    temperature: 0.9,
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
