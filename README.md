# 🤖 SAVY — Smart Healthy Food Delivery | توصيل الطعام الصحي بالذكاء الاصطناعي

**SAVY** is an AI-powered healthy food delivery app launching in Tetouan, Morocco.

🌐 **Live site:** [savy-maroc.netlify.app](https://savy-maroc.netlify.app)

---

## 🚀 What's Inside

A single-file landing page (`index.html`) with:

- 🇫🇷 / 🇲🇦 Bilingual — French & Arabic (full RTL support)
- 📧 Mailchimp waitlist form integration
- 🍽️ Interactive menu — 16 dishes across 4 cuisines
- 🔍 Live search + diet filters + cuisine tabs
- 🛒 Add to cart with order bar
- 📱 Fully mobile responsive
- ✅ Zero dependencies — pure HTML, CSS, JavaScript

---

## 📁 Structure

```
savy/
├── index.html      ← The entire website (one file)
└── README.md       ← This file
```

---

## ⚙️ Setup — Connect Mailchimp

Open `index.html` in any text editor and find this line:

```js
const MAILCHIMP_URL = "PASTE_YOUR_MAILCHIMP_URL_HERE";
```

Replace it with your Mailchimp form action URL:

```js
const MAILCHIMP_URL = "https://yourapp.us1.list-manage.com/subscribe/post?u=xxx&id=yyy";
```

**How to get your Mailchimp URL:**
1. Log in to Mailchimp
2. Go to **Audience → Signup Forms → Embedded Forms**
3. Copy the URL from the `action="..."` attribute

---

## 🌍 Deploy

### Netlify (Recommended)
1. Go to [netlify.com/drop](https://netlify.com/drop)
2. Drag and drop `index.html`
3. Live instantly ✅

### GitHub Pages
1. Push this repo to GitHub
2. Go to **Settings → Pages**
3. Set source to `main` branch → `/root`
4. Your site is live at `https://yourusername.github.io/savy`

### Vercel
1. Import this GitHub repo into Vercel
2. No configuration needed
3. Deploy ✅

---

## 🇲🇦 Brand

- **Primary color:** `#008060` (Emerald Green)
- **Font:** Syne (headings) + DM Sans (body) + Tajawal (Arabic)
- **Concept:** Modern, clean, tech-forward — matches the SAVY app UI

---

## 📬 Contact

Instagram: [@savy.mar](https://www.instagram.com/savy.mar?igsh=MWdzNjNkeWZ0NW93Zw==)  
TikTok: [@savy.ma](https://www.tiktok.com/@savy.ma?_r=1&_t=ZS-94R6uvkwfhN)

---

*Built with ❤️ for Morocco 🇲🇦*
