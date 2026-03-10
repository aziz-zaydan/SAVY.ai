const https = require("https");

exports.handler = async () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { statusCode: 500, body: "NO KEY SET" };

  return new Promise((resolve) => {
    const options = {
      hostname: "generativelanguage.googleapis.com",
      path: `/v1beta/models?key=${apiKey}`,
      method: "GET"
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => resolve({
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: data
      }));
    });
    req.on("error", e => resolve({ statusCode: 500, body: e.message }));
    req.end();
  });
};
