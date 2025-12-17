# 🚀 Groq Setup Guide (FREE AI with No Rate Limits!)

## Why Groq?
- ✅ **Completely FREE** - no credit card needed
- ✅ **No rate limit errors** - 30 requests/minute (vs Gemini: 2/minute)
- ✅ **FASTER** - responses in <1 second
- ✅ **Better quality** - Llama 3.3 70B model
- ✅ **Automatic failover** - if Gemini fails, Groq takes over

## Quick Setup (2 minutes)

### Step 1: Get Free Groq API Key
1. Go to https://console.groq.com/
2. Sign up with email (no credit card required)
3. Go to "API Keys" section
4. Click "Create API Key"
5. Copy your key (starts with `gsk_...`)

### Step 2: Add to .env File
Open `backend/.env` and add:
```bash
GROQ_API_KEY=gsk_your_key_here
```

### Step 3: Restart Server
```bash
cd backend
npm start
```

You'll see:
```
✅ Groq AI initialized (Provider: gemini)
```

## How It Works

### Smart Failover System
```
Query 1 → Try Gemini → ✅ Success
Query 2 → Try Gemini → ✅ Success
Query 3 → Try Gemini → ⚠️  Rate Limited → Try Groq → ✅ Success
Query 4 → Try Gemini → ⚠️  Rate Limited → Try Groq → ✅ Success
...all future queries use Groq (FREE & FAST)
```

### Console Output
When working, you'll see:
```
🔑 Trying Gemini (key 1/4, attempt 1)
⚠️  Gemini rate limit hit (key 1). Resource exhausted
🔄 Rotating to next Gemini key...
🔑 Trying Gemini (key 2/4, attempt 2)
⚠️  All Gemini keys exhausted. Trying Groq...
🚀 Trying Groq (fallback)...
✅ Groq succeeded (FREE!)
```

## Recommended Setup

**Best Practice:** Use BOTH Gemini and Groq
```bash
# In .env file:
GEMINI_API_KEY=your_gemini_key      # Uses this first
GEMINI_API_KEY1=backup_key_1        # Rotates if rate limited
GROQ_API_KEY=your_groq_key          # Ultimate fallback (unlimited)
```

This gives you:
- Gemini when available (fast & good)
- Automatic fallback to Groq (never fails)
- Zero downtime from rate limits

## Groq Models Available (All FREE)

The system uses `llama-3.3-70b-versatile` - best for chatbot tasks.

Other available models (can change in server.js line 6796):
- `llama-3.3-70b-versatile` ← Default (best balance)
- `llama-3.1-8b-instant` (faster, slightly less smart)
- `mixtral-8x7b-32768` (good for long context)
- `gemma2-9b-it` (smaller, very fast)

## Troubleshooting

### "Groq also failed"
- Check your GROQ_API_KEY is correct
- Verify it starts with `gsk_`
- Make sure you have internet connection

### Still getting rate limits?
- Add GROQ_API_KEY to your .env
- Restart the server
- Groq has 30 req/min limit (way more than Gemini)

### Want to use ONLY Groq?
Remove or comment out Gemini keys:
```bash
# GEMINI_API_KEY=...  (commented out)
GROQ_API_KEY=your_groq_key
```

## Performance Comparison

| Provider | Free Tier Limit | Speed | Quality | Cost |
|----------|----------------|-------|---------|------|
| Gemini   | ~2 req/min    | Fast  | Great   | FREE |
| **Groq** | **30 req/min**| **Fastest** | **Great** | **FREE** |

## Support

- Groq Docs: https://console.groq.com/docs
- Models: https://console.groq.com/docs/models
- Discord: https://discord.gg/groq

---

**TL;DR:** Add `GROQ_API_KEY=your_key` to `.env` and never worry about rate limits again!
