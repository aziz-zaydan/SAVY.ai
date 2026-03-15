# SAVY — Landing Page

AI-powered Moroccan meal delivery landing page.  
Built with vanilla HTML/CSS/JS + Netlify Functions + Groq API (llama-3.3-70b-versatile).

---

## 📁 Repo structure

```
savy/
├── index.html                  ← Full single-page frontend
├── netlify.toml                ← Netlify build & function config
├── .gitignore
└── netlify/
    └── functions/
        └── gemini.js           ← Serverless function → Groq API
```

---

## 🚀 Deploy to Netlify (from GitHub)

### 1. Push to GitHub
```bash
git init
git add .
git commit -m "initial deploy"
git remote add origin https://github.com/YOUR_USERNAME/savy.git
git push -u origin main
```

### 2. Connect to Netlify
1. Go to [app.netlify.com](https://app.netlify.com) → **Add new site** → **Import from Git**
2. Choose your GitHub repo
3. Build settings are auto-detected from `netlify.toml` — leave as-is
4. Click **Deploy site**

### 3. Add environment variable ⚠️ required
Without this the chat will not work.

1. Netlify dashboard → your site → **Site configuration** → **Environment variables**
2. Add:
   - Key: `GROQ_API_KEY`
   - Value: your key from [console.groq.com/keys](https://console.groq.com/keys)
3. **Deploys** → **Trigger deploy** → **Deploy site**

### 4. Update allowed CORS origins ⚠️ important
After your Netlify URL is assigned (e.g. `https://savy-xyz.netlify.app`), open `netlify/functions/gemini.js` and update `ALLOWED_ORIGINS`:

```js
const ALLOWED_ORIGINS = [
  "https://savy-xyz.netlify.app",  // ← your real Netlify URL
  "https://www.yourdomain.com",    // ← your custom domain (if any)
];
```

### 5. Add your custom domain (optional)
Netlify dashboard → **Domain management** → **Add custom domain** → follow DNS instructions.

---

## 🔑 Getting a Groq API key (free)
1. Go to [console.groq.com](https://console.groq.com)
2. Sign up / log in
3. **API Keys** → **Create API Key**
4. Copy and paste into Netlify environment variables

---

## 🤖 AI Chat personas
| Icon | Persona | Focus |
|------|---------|-------|
| 💼 | Employé(e) | Quick healthy lunch, energy for the afternoon |
| 🏋️ | Sportif(ve) | Macros, protein, performance goals |
| 👨‍👩‍👧 | Famille | Family-size orders, kids-friendly dishes |
| 💑 | Couple | Romantic dinner for two, elegant menu |

---

## 📍 Delivery zones & hours
- **Zones:** Tétouan · M'diq · Martil
- **Hours:** Orders accepted until **21h00** for same-day delivery
- **Delay:** 45 minutes maximum

---

## 🧩 How the AI chat works
1. Visitor picks a persona (employee / sportif / famille / couple)
2. Frontend sends a `[SYSTEM_OPEN:persona]` seed message to the Netlify function
3. The function builds a persona-specific system prompt and calls Groq
4. Groq returns a personalized greeting in the visitor's language (auto-detected)
5. Conversation continues; when the visitor confirms an order, the AI appends `SAVY_GET_LEAD` (hidden token) which triggers the lead capture form in the frontend
6. Lead data is sent to Google Sheets via Apps Script

---

## ⚙️ Environment variables
| Variable | Required | Description |
|----------|----------|-------------|
| `GROQ_API_KEY` | ✅ Yes | From [console.groq.com](https://console.groq.com/keys) |

---

## 🔒 Security notes
- API key is server-side only — never exposed to the browser
- CORS is restricted to your Netlify domain (update `ALLOWED_ORIGINS` in `gemini.js`)
- Message content is truncated to 2000 chars max per turn
- Conversation history is capped at 20 turns to prevent prompt injection via long histories
- `netlify.toml` sets security headers on all routes
