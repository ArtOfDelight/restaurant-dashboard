# Stock Dashboard Integration with AI Chatbot

## Overview

The AI chatbot has been successfully integrated with the stock dashboard to provide intelligent analysis of sales performance in relation to stock availability. This enables the bot to:

1. **Correlate sales deprecation with out-of-stock events**
2. **Validate growth by checking stock availability**
3. **Provide context-aware insights** about why products may have lower/higher sales

## Key Features

### 1. Automatic Stock Correlation

When users query the chatbot about product performance, the system automatically:
- Fetches stock tracker data for the analyzed products
- Identifies out-of-stock events within the relevant time period
- Correlates stock issues with sales patterns
- Includes this context in the AI's analysis

### 2. Smart Analysis

The chatbot can now distinguish between:

**Sales Deprecation**
- Quality issues (low ratings) → Genuine problem that needs fixing
- Stock issues (out-of-stock events) → Supply problem, not demand problem

**Sales Growth**
- With stock issues → Recovery from supply constraints
- Without stock issues → Genuine demand growth, production keeping pace

### 3. Supported Query Types

The integration works with:

**Single Period Queries:**
- "What are the best selling products last week?"
- "Why did Chocolate Brownie sales drop?"
- "Was Red Velvet Cake out of stock?"

**Comparison Queries:**
- "Compare this week vs last week"
- "How did sales change comparing last 7 days to previous 7 days?"
- "Did we improve from last month?"

**Stock-Specific Queries:**
- "Which products were out of stock?"
- "Did stock issues affect sales?"
- "Is our production keeping up with demand?"

## Technical Implementation

### New Functions Added

#### 1. `getStockDataForProducts(productNames, daysBack, outlet)`
```javascript
// Fetches stock tracker data for specific products
// Returns: { stockEvents, productStockMap, summary }
```

**Features:**
- Fuzzy matching to correlate product names with stock tracker entries
- Date filtering to match analysis period
- Outlet filtering for outlet-specific analysis
- Tracks out-of-stock events per product per outlet

#### 2. `correlateSalesWithStock(productData, dateRangeInfo, filters)`
```javascript
// Correlates sales data with stock availability
// Returns: { hasStockIssues, affectedProducts, summary }
```

**Features:**
- Analyzes all products in the current dataset
- Identifies products with both sales data AND stock issues
- Calculates impact metrics (event count, affected outlets)
- Provides actionable summary

### Enhanced Chatbot Responses

#### Enhanced Prompts
- Added "STOCK AVAILABILITY ANALYSIS" section to AI context
- Includes out-of-stock events for relevant products
- Provides guidance on interpreting sales patterns with stock context

#### Example Responses

**Before Integration:**
```
User: "Why did Chocolate Brownie sales drop?"
Bot: "Chocolate Brownie had 45 orders with a 4.3 star rating.
Sales appear to be lower than usual."
```

**After Integration:**
```
User: "Why did Chocolate Brownie sales drop?"
Bot: "Looking at Chocolate Brownie in the last 7 days:

SALES PERFORMANCE:
- 45 orders (below average for this product)
- 4.3 star rating (good quality)

STOCK AVAILABILITY ISSUE DETECTED:
- 3 out-of-stock events across 2 outlets (Koramangala, HSR Layout)
- Stock unavailable on multiple days during this period

ANALYSIS:
The sales drop is NOT due to quality issues (4.3 stars is solid).
The main factor is stock availability - the product was out of stock
at key outlets, preventing customers from ordering it.

RECOMMENDATION:
Improve inventory management for Chocolate Brownie. The demand is
there (good ratings), but stock constraints are limiting sales."
```

## Data Sources

### Stock Spreadsheet
- **Spreadsheet ID:** `16ut6A_7EHEjVbzEne23dhoQtPtDvoMt8P478huFaGS8`
- **Tracker Tab:** `Copy of Tracker`
- **Columns Used:**
  - Column B: Time (timestamp of out-of-stock event)
  - Column C: Outlet (which outlet reported out-of-stock)
  - Column D: Items (comma-separated list of out-of-stock items)

### Product Sales Data
- **Source:** ProductDetails sheet in dashboard spreadsheet
- **Aggregation:** By product name, outlet, channel, and date range
- **Metrics:** Total orders, average rating, low-rated percentage

## API Response Structure

The chatbot endpoint (`/api/product-chat`) now returns:

```json
{
  "success": true,
  "response": "AI-generated response with stock context...",
  "data": {
    "topProducts": [...],
    "stockAnalysis": {
      "hasStockIssues": true,
      "affectedProducts": [
        {
          "name": "Chocolate Brownie",
          "orders": 45,
          "rating": 4.3,
          "stockEvents": 3,
          "outletCount": 2,
          "outlets": "Koramangala (2x), HSR Layout (1x)"
        }
      ],
      "summary": "3 product(s) had stock availability issues..."
    }
  },
  "stockCorrelation": {
    "hasStockIssues": true,
    "affectedProducts": [...],
    "summary": "...",
    "totalStockEvents": 3
  },
  "dateRangeInfo": "Last 7 days",
  "timestamp": "2025-12-17T..."
}
```

## Usage Examples

### Example 1: Detecting Stock-Related Sales Drop
```javascript
POST /api/product-chat
{
  "message": "Why did ice cream sales drop in Koramangala?",
  "dateFilter": 7
}

// Bot will check stock tracker and if out-of-stock events exist,
// will attribute sales drop to stock issues rather than demand/quality
```

### Example 2: Validating Growth
```javascript
POST /api/product-chat
{
  "message": "Our brownie sales grew 30%. Is production keeping up?",
  "dateFilter": 7
}

// Bot will check stock tracker and confirm if growth is sustainable
// (no stock issues) or if it's recovery from previous stock problems
```

### Example 3: Comparison with Stock Context
```javascript
POST /api/product-chat
{
  "message": "Compare this week vs last week",
  "conversationHistory": []
}

// Bot will analyze stock issues in both periods and provide
// context on whether sales changes are demand-driven or supply-driven
```

## Benefits

1. **Accurate Root Cause Analysis**
   - Distinguishes between demand issues vs supply issues
   - Prevents false negatives (flagging good products as problematic)

2. **Actionable Insights**
   - "Fix quality" vs "Improve inventory management"
   - Clear recommendations based on actual cause

3. **Production Validation**
   - Confirms if production levels match demand
   - Identifies opportunities where demand exists but supply is constrained

4. **Better Decision Making**
   - Data-driven insights combining sales + inventory
   - Holistic view of product performance

## Future Enhancements

Potential improvements:
1. Real-time stock alerts in chatbot responses
2. Predictive analytics for stock-out risk
3. Integration with procurement systems
4. Historical stock trend analysis
5. Multi-factor analysis (weather, events, stock, promotions)

## Testing

To test the integration:

```bash
# Start the backend server
cd backend
npm start

# Test with a sample query
curl -X POST http://localhost:5000/api/product-chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Were there any stock issues affecting sales last week?",
    "dateFilter": 7
  }'
```

## Notes

- Stock data lookup adds ~1-2 seconds to chatbot response time
- Uses fuzzy matching (80%+ similarity) to correlate product names
- Stock correlation is automatic - no configuration needed
- Works with all existing chatbot features (filters, comparisons, etc.)
