// SAVY Sheets Proxy — fetches Google Apps Script with full redirect chain
const https = require("https");
const urlMod = require("url");

const SHEET_URL = process.env.GOOGLE_SHEET_URL ||
  "https://script.google.com/macros/s/AKfycby-JMVQrM6eHHJPz9wDFUrW6yvFKnBaoc2VFZa6QvDtEPPO0wZSr8TsXHZvy0q4v5wYUg/exec";

const CORS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store"
};

function get(targetUrl) {
  return new Promise((resolve, reject) => {
    const parsed = urlMod.parse(targetUrl);
    const options = {
      hostname: parsed.hostname,
      path: parsed.path,
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SAVY/1.0)",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9"
      }
    };

    const req = https.request(options, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", c => body += c);
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });

    req.on("error", reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error("Timeout after 20s")); });
    req.end();
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS, body: "" };
  }

  const action = (event.queryStringParameters || {}).action || "dashboard";
  const target = `${SHEET_URL}?action=${action}`;

  try {
    // Step 1: hit the script.google.com URL — it ALWAYS redirects
    let res = await get(target);

    // Step 2: follow redirect to script.googleusercontent.com
    if ([301,302,303,307,308].includes(res.status) && res.headers.location) {
      res = await get(res.headers.location);
    }

    // Step 3: follow another redirect if needed
    if ([301,302,303,307,308].includes(res.status) && res.headers.location) {
      res = await get(res.headers.location);
    }

    const body = res.body.trim();

    // Got HTML error page — parse the title for the error message
    if (body.startsWith("<")) {
      const titleMatch = body.match(/<title>([^<]*)<\/title>/i);
      const errMsg = titleMatch ? titleMatch[1] : "Apps Script returned HTML";
      console.error("Apps Script HTML response:", errMsg);
      return {
        statusCode: 200,
        headers: CORS,
        body: JSON.stringify({
          orders: [],
          error: errMsg,
          hint: "Redeploy Apps Script as New Version with Execute as: Me and Who has access: Anyone"
        })
      };
    }

    // Validate JSON
    try {
      const parsed = JSON.parse(body);
      return { statusCode: 200, headers: CORS, body: JSON.stringify(parsed) };
    } catch (e) {
      return {
        statusCode: 200,
        headers: CORS,
        body: JSON.stringify({ orders: [], error: "Invalid JSON from Apps Script", raw: body.slice(0, 300) })
      };
    }

  } catch (err) {
    console.error("Proxy error:", err.message);
    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ orders: [], error: err.message })
    };
  }
};
