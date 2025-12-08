# Product Analytics Chatbot API

An AI-powered conversational interface for analyzing restaurant product sales and ratings data from Swiggy and Zomato platforms.

## Overview

The chatbot uses Google's Gemini AI to provide natural language responses to questions about product performance, sales, and customer ratings.

## API Endpoint

**POST** `/api/product-chat`

## Request Format

```json
{
  "message": "Your question here",
  "conversationHistory": [
    {
      "role": "user",
      "content": "previous question"
    },
    {
      "role": "assistant",
      "content": "previous response"
    }
  ]
}
```

### Parameters

- `message` (required): The user's question/query as a string
- `conversationHistory` (optional): Array of previous conversation messages for context

## Response Format

```json
{
  "success": true,
  "response": "AI-generated natural language response",
  "data": {
    "topProducts": [...],
    "problematicProducts": [...]
  },
  "timestamp": "2025-12-08T12:00:00.000Z"
}
```

### Response Fields

- `success`: Boolean indicating if the request was successful
- `response`: Natural language response from the AI
- `data`: Structured data (when applicable) containing relevant products
- `timestamp`: ISO timestamp of the response

## Example Questions

The chatbot can answer various questions about your product data:

### Sales Performance
- "What was the best selling item?"
- "Which products have the most orders?"
- "Show me the top 5 selling products"

### Rating Analysis
- "What items have good ratings?"
- "Show me products with low ratings"
- "What's the average rating across all products?"

### Combined Analysis
- "What was the best selling item with good ratings?"
- "Which high-rated products are selling well?"
- "Are there any products with many orders but low ratings?"

### Problem Identification
- "Which products need attention?"
- "Show me problematic items"
- "What products have high complaint rates?"

## Data Sources

The chatbot analyzes data from:
- **ProductDetails Sheet**: Core product information
- **zomato_orders Sheet**: Zomato platform orders and ratings
- **swiggy_review Sheet**: Swiggy platform reviews and ratings

## Features

### Real-time Data
- Fetches fresh data from Google Sheets on every query
- Always provides up-to-date insights

### Conversation Context
- Maintains conversation history
- Understands follow-up questions
- Provides contextual responses

### Structured Data
- Returns formatted data alongside text responses
- Suitable for displaying in tables or charts
- Includes product names, orders, ratings, and percentages

### Smart Analysis
- Automatically identifies top performers
- Highlights problematic products
- Calculates relevant statistics
- Provides actionable insights

## Testing

Run the included test script to verify the chatbot:

```bash
node test-chatbot.js
```

This will test various question types and conversation contexts.

## Integration with Frontend

### Basic Example (React)

```javascript
const [messages, setMessages] = useState([]);
const [input, setInput] = useState('');

const sendMessage = async () => {
  // Add user message
  const newMessages = [...messages, { role: 'user', content: input }];
  setMessages(newMessages);

  // Call API
  const response = await fetch('http://localhost:5000/api/product-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: input,
      conversationHistory: messages
    })
  });

  const data = await response.json();

  // Add assistant response
  setMessages([
    ...newMessages,
    { role: 'assistant', content: data.response }
  ]);

  setInput('');
};
```

### With Structured Data Display

```javascript
const [chatResponse, setChatResponse] = useState(null);

const sendMessage = async (message) => {
  const response = await fetch('http://localhost:5000/api/product-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message })
  });

  const data = await response.json();
  setChatResponse(data);

  // Display text response
  console.log(data.response);

  // Display structured data in a table if available
  if (data.data?.topProducts) {
    renderProductTable(data.data.topProducts);
  }
};
```

## Configuration

The chatbot requires:
- `GEMINI_API_KEY`: Set in `.env` file
- `DASHBOARD_SPREADSHEET_ID`: Google Sheets ID for product data
- Google Sheets API access configured

## Error Handling

The chatbot includes:
- Fallback responses if AI service fails
- Basic statistics provided on error
- Graceful error messages
- Request validation

## Performance Considerations

- Response time: 2-5 seconds (depending on data size and AI processing)
- Rate limiting: Consider implementing rate limits for production
- Caching: Product data is fetched fresh each time (could be cached for faster responses)

## Future Enhancements

Potential improvements:
- Add data caching for faster responses
- Implement rate limiting
- Add user authentication
- Support image/chart generation
- Add more specific queries (date ranges, specific outlets, etc.)
- Implement conversation persistence (database storage)

## Support

For issues or questions about the chatbot API, check:
1. Gemini API key is valid and has credits
2. Google Sheets data is accessible
3. Server logs for detailed error messages
4. Test script output for debugging
