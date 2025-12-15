# Gemini API Key Failover System

## Overview
This system provides automatic failover between multiple Gemini API keys when rate limits are reached. When one API key hits its quota, the system automatically switches to the next available key.

## How It Works

### 1. Key Loading
The system loads up to 5 Gemini API keys from environment variables:
- `GEMINI_API_KEY` (primary key)
- `GEMINI_API_KEY1` (backup key 1)
- `GEMINI_API_KEY2` (backup key 2)
- `GEMINI_API_KEY3` (backup key 3)
- `GEMINI_API_KEY4` (backup key 4)

Only keys that are defined and non-empty are loaded.

### 2. Rate Limit Detection
The system detects rate limit errors by checking for:
- HTTP 429 status code
- Error messages containing keywords like:
  - "rate limit"
  - "quota exceeded"
  - "too many requests"
  - "resource exhausted"
  - "RESOURCE_EXHAUSTED"

### 3. Automatic Rotation
When a rate limit error is detected:
1. The system logs the issue: `⚠️  Rate limit hit on Gemini API key N`
2. Rotates to the next available key
3. Logs the rotation: `🔄 Rotated Gemini API key: Key N → Key M`
4. Retries the request with the new key
5. Continues until a key works or all keys are exhausted

### 4. Failure Handling
If all API keys reach their rate limits:
- The system returns a clear error message: "All Gemini API keys have reached their rate limit. Please try again later."
- The error is logged: `❌ All API keys exhausted or rotation failed`

## Configuration

### Adding API Keys to .env

```bash
# Primary key (required)
GEMINI_API_KEY=your-primary-api-key

# Backup keys (optional)
GEMINI_API_KEY1=your-second-api-key
GEMINI_API_KEY2=your-third-api-key
GEMINI_API_KEY3=your-fourth-api-key
GEMINI_API_KEY4=your-fifth-api-key
```

**Note:** You can use anywhere from 1 to 5 keys. The system will work with whatever keys are provided.

## Server Startup

When the server starts, you'll see:
```
✅ Loaded N Gemini API key(s) for failover
```

This confirms how many valid API keys were loaded.

## During Operation

### Successful Request (No Rotation Needed)
```
[No special logs - request completes normally]
```

### Rate Limit Hit - Successful Rotation
```
⚠️  Rate limit hit on Gemini API key 1
🔄 Rotated Gemini API key: Key 1 → Key 2
🔄 Retrying with next API key...
[Request completes successfully with new key]
```

### All Keys Exhausted
```
⚠️  Rate limit hit on Gemini API key 5
🔄 Rotated Gemini API key: Key 5 → Key 1
🔄 Retrying with key 1... (Attempt 5/5)
⚠️  Rate limit hit on Gemini API key 1
❌ All API keys exhausted or rotation failed
[Error returned to user]
```

## Implementation Details

### Helper Functions

#### `getCurrentGeminiKey()`
Returns the currently active API key.

#### `rotateGeminiKey()`
Rotates to the next available key in round-robin fashion.
Returns `true` if rotation succeeded, `false` if only one key available.

#### `isRateLimitError(error)`
Checks if an error is a rate limit error.
Returns `true` if rate limit detected, `false` otherwise.

#### `callGeminiWithFailover(url, data, maxRetries)`
Makes a Gemini API call with automatic failover.
- `url`: The Gemini API endpoint (without key parameter)
- `data`: Request payload
- `maxRetries`: Maximum retry attempts (defaults to number of keys)
- Returns: Axios response object
- Throws: Error if all retries fail

### Modified Functions

The following chatbot functions now use `callGeminiWithFailover()`:
- `generateChatbotResponse()` - Standard chatbot responses
- `generateComparisonChatbotResponse()` - Comparison queries

## Best Practices

### 1. Use Multiple Keys
- Obtain multiple Gemini API keys from Google Cloud Console
- Each key should be from a separate project for independent quotas
- Recommended: Use at least 2-3 keys for production

### 2. Monitor Usage
- Check server logs for rotation patterns
- If keys rotate frequently, consider:
  - Increasing API quotas
  - Adding more backup keys
  - Implementing request caching

### 3. Key Management
- Keep keys secure (never commit .env file)
- Rotate keys periodically for security
- Use different keys for dev/staging/production

## Troubleshooting

### Issue: "No Gemini API keys available"
**Cause:** No valid API keys in .env file
**Solution:** Add at least `GEMINI_API_KEY` to your .env file

### Issue: Keys rotate constantly
**Cause:** High traffic or low API quotas
**Solution:**
- Add more backup keys
- Increase API quotas in Google Cloud Console
- Implement rate limiting on your application

### Issue: "All Gemini API keys have reached their rate limit"
**Cause:** All configured keys exhausted
**Solution:**
- Wait for quota reset (typically daily)
- Add more backup keys
- Upgrade API quotas

## Testing

To test the failover system:
1. Use a key with very low quota
2. Send multiple chat requests
3. Watch server logs for rotation messages
4. Verify requests continue with backup keys

## Performance Impact

- **No impact** when rate limits not hit (normal operation)
- **Minimal delay** during key rotation (~100ms for rotation logic)
- **Network retry overhead** when rate limits hit (1 additional request per key)

## Security Considerations

- All API keys are loaded from environment variables (not hardcoded)
- Keys are never logged or exposed in responses
- Failed authentication errors don't trigger rotation (only rate limits)
- Rotation state is in-memory only (no persistence)

## Future Enhancements

Potential improvements for the future:
- Track key usage statistics
- Implement smart key selection based on historical usage
- Add time-based key rotation
- Implement request queuing during rate limits
- Add webhook notifications for quota alerts
