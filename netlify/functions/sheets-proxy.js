const https = require("https");

exports.handler = async (event) => {
  const SHEET_URL = process.env.GOOGLE_SHEET_URL ||
    "https://script.google.com/macros/s/AKfycby-JMVQrM6eHHJPz9wDFUrW6yvFKnBaoc2VFZa6QvDtEPPO0wZSr8TsXHZvy0q4v5wYUg/exec";

  const action = event.queryStringParameters?.action || "dashboard";

  const url = `${SHEET_URL}?action=${action}`;

  return new Promise((resolve) => {
    function doRequest(targetUrl, redirects) {
      if (redirects > 5) {
        resolve({ statusCode: 502, body: JSON.stringify({ error: "Too many redirects" }) });
        return;
      }

      const lib = targetUrl.startsWith("https") ? https : require("http");
      lib.get(targetUrl, { headers: { "Accept": "application/json" } }, (res) => {
        // Follow redirects
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          doRequest(res.headers.location, redirects + 1);
          return;
        }

        let data = "";
        res.on("data", chunk => data += chunk);
        res.on("end", () => {
          // Try to extract JSON if wrapped in HTML
          let json = data;
          if (data.includes("</html>")) {
            const match = data.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
            if (match) json = match[1];
          }

          resolve({
            statusCode: 200,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
              "Cache-Control": "no-store",
            },
            body: json,
          });
        });
      }).on("error", (err) => {
        resolve({
          statusCode: 502,
          headers: { "Access-Control-Allow-Origin": "*" },
          body: JSON.stringify({ error: err.message }),
        });
      });
    }

    doRequest(url, 0);
  });
};
