# SAVY WhatsApp Bot — Setup Guide

## How it works
```
Customer messages your WhatsApp number
        ↓
Meta sends webhook to Netlify function
        ↓
/.netlify/functions/whatsapp
        ↓
Groq AI generates Darija/FR/AR reply
        ↓
Auto-reply sent back to customer
        ↓
When order confirmed → saved to Google Sheets
```

---

## Step 1 — Meta Business Setup (free)

1. Go to [developers.facebook.com](https://developers.facebook.com)
2. **Create App** → choose **Business** → name it "SAVY"
3. Add **WhatsApp** product to your app
4. Go to **WhatsApp → Getting Started**
5. You get a **test phone number** — use it first for testing
6. Note down:
   - `Phone Number ID` (looks like: 123456789012345)
   - `WhatsApp Business Account ID`
   - `Temporary access token` (valid 24h for testing)

---

## Step 2 — Get permanent token

1. Go to [business.facebook.com](https://business.facebook.com)
2. **Settings → System Users** → Create System User (Admin)
3. **Generate Token** → select your app → grant `whatsapp_business_messaging` permission
4. Copy the permanent token

---

## Step 3 — Add environment variables in Netlify

Go to Netlify → your site → **Site configuration → Environment variables**

Add these 4 variables:

| Key | Value |
|-----|-------|
| `WHATSAPP_TOKEN` | Your permanent token from Step 2 |
| `WHATSAPP_PHONE_ID` | Phone Number ID from Step 1 |
| `WHATSAPP_VERIFY_TOKEN` | Make up any secret string e.g. `savy_webhook_2025` |
| `GOOGLE_SHEET_URL` | Your existing Google Sheet URL (already in index.html) |

> `GROQ_API_KEY` is already set — no need to add again.

---

## Step 4 — Configure Webhook in Meta

1. In Meta Developer Console → **WhatsApp → Configuration → Webhooks**
2. **Callback URL**: `https://YOUR-SITE.netlify.app/.netlify/functions/whatsapp`
3. **Verify Token**: same string you set in `WHATSAPP_VERIFY_TOKEN`
4. Click **Verify and Save**
5. Subscribe to: **messages**

---

## Step 5 — Connect your real WhatsApp number

1. Meta Console → **WhatsApp → Phone Numbers** → **Add Phone Number**
2. Enter your real Moroccan business number
3. Verify via SMS or call
4. Update `WHATSAPP_PHONE_ID` in Netlify with the new number's ID

---

## Step 6 — Test it

Send a message to your WhatsApp number:
> "salam bghit ncommande"

You should get a reply from Chef SAVY AI within 3 seconds.

---

## File location in repo

```
savy/
└── netlify/
    └── functions/
        ├── gemini.js      ← AI chat (existing)
        └── whatsapp.js    ← WhatsApp bot (NEW)
```

---

## What the bot does automatically

✅ Detects language (Darija / French / Arabic / English)  
✅ Suggests dishes based on context  
✅ Takes the full order (name + address + phone)  
✅ Saves to Google Sheets  
✅ Sends order confirmation with #SAVY-XXXX  
✅ Remembers conversation context  

## Current limitation

Conversation history resets on server cold start (every ~10min on free Netlify).
For production, upgrade to Netlify KV store or add Redis.
