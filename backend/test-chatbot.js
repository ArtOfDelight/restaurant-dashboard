// Test the Product Analytics Chatbot API
// Usage: node test-chatbot.js

const axios = require('axios');

const API_URL = 'http://localhost:5000/api/product-chat';

// Example questions to test
const testQuestions = [
  "What was the best selling item with good ratings?",
  "Show me products with low ratings that need improvement",
  "What's the average rating across all products?",
  "Which items have the most orders?",
  "Are there any problematic products I should be concerned about?"
];

async function testChatbot(question, conversationHistory = []) {
  try {
    console.log('\n' + '='.repeat(70));
    console.log('QUESTION:', question);
    console.log('='.repeat(70));

    const response = await axios.post(API_URL, {
      message: question,
      conversationHistory: conversationHistory
    });

    console.log('\nRESPONSE:');
    console.log(response.data.response);

    if (response.data.data) {
      console.log('\nSTRUCTURED DATA:');
      console.log(JSON.stringify(response.data.data, null, 2));
    }

    console.log('\nTimestamp:', response.data.timestamp);

    return response.data;
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    return null;
  }
}

async function runTests() {
  console.log('🤖 Testing Product Analytics Chatbot\n');

  // Test individual questions
  for (const question of testQuestions) {
    await testChatbot(question);
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s between requests
  }

  // Test conversation with context
  console.log('\n' + '='.repeat(70));
  console.log('TESTING CONVERSATION WITH CONTEXT');
  console.log('='.repeat(70));

  const conversationHistory = [];

  // First question
  const response1 = await testChatbot("What are the top 3 selling products?");
  if (response1) {
    conversationHistory.push(
      { role: 'user', content: "What are the top 3 selling products?" },
      { role: 'assistant', content: response1.response }
    );
  }

  await new Promise(resolve => setTimeout(resolve, 1000));

  // Follow-up question with context
  if (response1) {
    await testChatbot("What are their ratings?", conversationHistory);
  }
}

// Run all tests
runTests().then(() => {
  console.log('\n✅ All tests completed');
}).catch(error => {
  console.error('Test suite failed:', error);
});
