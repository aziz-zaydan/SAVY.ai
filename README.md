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

### 4. Add your custom domain (optional)
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

## 📍 Delivery zones
Tétouan · M'diq · Martil
