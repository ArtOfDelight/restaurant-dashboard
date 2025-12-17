# Groq API Key Rotation

## Overview

The chatbot now supports **automatic key rotation for Groq API keys**, similar to the existing Gemini key rotation. When one Groq key hits rate limits, the system automatically rotates to the next available key, maximizing API availability and reducing downtime.

## Setup

### Environment Variables

Add your Groq API keys to the `.env` file:

```env
# Groq API Keys (Free Alternative to Gemini)
GROQ_API_KEY=gsk_your_first_key_here
GROQ_API_KEY1=gsk_your_second_key_here
GROQ_API_KEY2=gsk_your_third_key_here
GROQ_API_KEY3=gsk_your_fourth_key_here
```

**Notes:**
- You can use 1-4 Groq API keys
- Empty or undefined keys are automatically filtered out
- At least one key is required for Groq to work

### How to Get Groq API Keys

1. Visit [https://console.groq.com](https://console.groq.com)
2. Sign up for a free account
3. Navigate to API Keys section
4. Create new API keys (you can create multiple for redundancy)
5. Add them to your `.env` file

## How It Works

### 1. Initialization

On server startup, the system:
- Loads all configured Groq API keys
- Creates a client instance for each key
- Logs the number of available keys

```javascript
✅ Loaded 4 Groq API key(s) for failover (Provider: gemini)
```

### 2. Automatic Failover Chain

The chatbot uses a multi-tier failover strategy:

```
User Query
    ↓
[Try Gemini Key 1]
    ↓ (rate limit)
[Try Gemini Key 2]
    ↓ (rate limit)
[Try Gemini Key 3]
    ↓ (all Gemini keys exhausted)
[Try Groq Key 1] ← FREE
    ↓ (rate limit)
[Try Groq Key 2]
    ↓ (rate limit)
[Try Groq Key 3]
    ↓ (rate limit)
[Try Groq Key 4]
    ↓
Success or Error
```

### 3. Key Rotation

When a Groq key hits rate limits:

```javascript
⚠️  Groq rate limit hit (key 1). rate_limit_exceeded
🔄 Rotated Groq API key: Key 1 → Key 2
🚀 Trying Groq (key 2/4, attempt 2)...
✅ Groq succeeded (FREE!)
```

### 4. Rate Limit Detection

The system automatically detects Groq rate limit errors:
- HTTP 429 status codes
- Error messages containing:
  - "rate_limit_exceeded"
  - "rate limit"
  - "quota exceeded"
  - "too many requests"

## Key Functions

### `getCurrentGroqClient()`
Returns the currently active Groq client based on rotation index.

### `rotateGroqKey()`
Rotates to the next available Groq API key.
- Returns `true` if rotation successful
- Returns `false` if only one key available
- Logs rotation events

### `isGroqRateLimitError(error)`
Checks if an error is a Groq rate limit error.
- Returns `true` for rate limit errors
- Returns `false` for other errors

## Benefits

### 1. Maximum Uptime
- **Before:** Single Groq key = one rate limit → service down
- **After:** 4 Groq keys = 4x the capacity before exhaustion

### 2. Cost Savings
Groq is 100% free, so using multiple Groq keys gives you:
- Zero cost for chatbot AI
- High availability without paid API plans
- Automatic fallback from paid Gemini to free Groq

### 3. Seamless Experience
Users never see:
- "Rate limit exceeded" errors
- Service interruptions
- Degraded performance

The system automatically handles all key rotation behind the scenes.

## Rate Limits

### Groq Free Tier Limits (per key)
- **Requests:** 30 requests per minute
- **Tokens:** 6,000 tokens per minute
- **Daily:** 14,400 requests per day

### With 4 Keys
- **Requests:** 120 requests per minute
- **Tokens:** 24,000 tokens per minute
- **Daily:** 57,600 requests per day

This should handle most restaurant analytics use cases comfortably.

## Monitoring

### Console Logs

The system provides detailed logging for debugging:

```bash
# Successful request
✅ Loaded 4 Groq API key(s) for failover
🚀 Trying Groq (key 1/4, attempt 1)...
✅ Groq succeeded (FREE!)

# Rate limit hit with rotation
⚠️  Groq rate limit hit (key 1). rate_limit_exceeded
🔄 Rotated Groq API key: Key 1 → Key 2
🚀 Trying Groq (key 2/4, attempt 2)...
✅ Groq succeeded (FREE!)

# All keys exhausted
⚠️  All Groq keys exhausted.
Error: Both Gemini and Groq rate limited. All 5 Gemini + 4 Groq keys exhausted.
```

### What to Watch For

1. **Frequent Rotations:** If you see constant key rotation, you may need more keys or to optimize query frequency
2. **All Keys Exhausted:** If all keys are exhausted, consider:
   - Adding more Groq API keys
   - Implementing query caching
   - Rate limiting on the frontend

## Architecture

### Key Management

```javascript
// Array of Groq API keys
const GROQ_API_KEYS = [
  process.env.GROQ_API_KEY,
  process.env.GROQ_API_KEY1,
  process.env.GROQ_API_KEY2,
  process.env.GROQ_API_KEY3
].filter(key => key && key.trim());

// Current key index for rotation
let currentGroqKeyIndex = 0;

// Array of client instances
let groqClients = GROQ_API_KEYS.map(key => new Groq({ apiKey: key }));
```

### Failover Logic

The `callAIWithFailover()` function handles the complete failover chain:

1. Try all Gemini keys (if configured)
2. If all Gemini keys fail, try Groq keys
3. Rotate through Groq keys on rate limits
4. Return error only if ALL keys exhausted

## Comparison: Before vs After

### Before (Single Groq Key)
```
Request 1-30: ✅ Success
Request 31+:  ❌ Rate limit → Service down
```

### After (4 Groq Keys)
```
Request 1-30:   ✅ Groq Key 1
Request 31-60:  ✅ Groq Key 2 (auto-rotated)
Request 61-90:  ✅ Groq Key 3 (auto-rotated)
Request 91-120: ✅ Groq Key 4 (auto-rotated)
Request 121+:   ⏳ Wait for rate limit reset
```

## Best Practices

1. **Use Multiple Keys:** Configure at least 2-3 Groq keys for redundancy
2. **Monitor Logs:** Watch for frequent rotation patterns
3. **Implement Caching:** Cache common queries to reduce API calls
4. **Frontend Rate Limiting:** Don't spam the API with rapid-fire requests
5. **Key Rotation:** Rotate API keys periodically for security

## Troubleshooting

### "No Groq API keys available"
- Check `.env` file has at least one `GROQ_API_KEY`
- Verify keys are not empty or contain only whitespace
- Restart the server after adding keys

### "All Groq keys exhausted"
- You've exceeded the combined rate limits of all keys
- Wait for rate limits to reset (typically 1 minute)
- Add more Groq API keys
- Implement request caching

### Keys Not Rotating
- Check console logs for rotation messages
- Verify error is actually a rate limit (not a different error)
- Ensure you have multiple keys configured

## Integration with Existing Features

The Groq key rotation works seamlessly with:

✅ **Stock Dashboard Integration** - Correlates sales with inventory using Groq AI
✅ **Product Analytics** - Analyzes product performance with Groq fallback
✅ **Comparison Queries** - Compares time periods using rotating Groq keys
✅ **Channel-Wise Analysis** - Breaks down by channel with Groq support

All existing chatbot features automatically benefit from Groq key rotation.

## Summary

Groq API key rotation provides:
- 🔄 **Automatic rotation** on rate limits
- 💰 **Zero cost** (Groq is free)
- ⚡ **High availability** with multiple keys
- 🤖 **Seamless failover** from Gemini
- 📊 **Detailed logging** for monitoring

Your chatbot now has enterprise-grade reliability using 100% free Groq API keys!
