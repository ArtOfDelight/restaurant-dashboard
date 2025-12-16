// Test script for improved chatbot prompts
const axios = require('axios');

const API_URL = 'http://localhost:5000';

async function testChatbot() {
  console.log('🧪 Testing Improved Product Chatbot Prompts\n');
  console.log('='.repeat(60));

  const testQueries = [
    {
      name: 'Test 1: Best Selling Products (Generic Question)',
      message: 'What are the best selling products?',
      expectedImprovement: 'Should mention specific product names with numbers'
    },
    {
      name: 'Test 2: Problem Detection (Vague Question)',
      message: 'Any problems?',
      expectedImprovement: 'Should identify specific products with low ratings and explain why they\'re problematic'
    },
    {
      name: 'Test 3: Combined Quality + Sales (Complex Question)',
      message: 'What sold well with good ratings?',
      expectedImprovement: 'Should cross-reference sales volume with ratings and name specific products'
    },
    {
      name: 'Test 4: Ambiguous Question',
      message: 'How are we doing?',
      expectedImprovement: 'Should provide overview with specific metrics and product names'
    }
  ];

  for (const test of testQueries) {
    console.log(`\n📝 ${test.name}`);
    console.log(`   Question: "${test.message}"`);
    console.log(`   Expected: ${test.expectedImprovement}\n`);

    try {
      const startTime = Date.now();
      const response = await axios.post(`${API_URL}/api/product-chat`, {
        message: test.message
      });

      const duration = Date.now() - startTime;

      if (response.data.success) {
        console.log(`   ✅ SUCCESS (${duration}ms)`);
        console.log(`\n   RESPONSE:\n   ${response.data.response.split('\n').join('\n   ')}\n`);

        // Check if response contains specific product names (not generic)
        const hasSpecificNames = !/Product \d+|your products|the items/i.test(response.data.response);
        const hasNumbers = /\d+/.test(response.data.response);

        console.log(`   Analysis:`);
        console.log(`   - Uses specific product names: ${hasSpecificNames ? '✓' : '✗'}`);
        console.log(`   - Includes specific numbers: ${hasNumbers ? '✓' : '✗'}`);
        console.log(`   - Response length: ${response.data.response.length} characters`);
      } else {
        console.log(`   ❌ FAILED: ${response.data.error}`);
      }
    } catch (error) {
      console.log(`   ❌ ERROR: ${error.message}`);
      if (error.response) {
        console.log(`   Details: ${JSON.stringify(error.response.data, null, 2)}`);
      }
    }

    console.log('\n' + '-'.repeat(60));
  }

  console.log('\n✅ Testing Complete!\n');
  console.log('KEY IMPROVEMENTS TO LOOK FOR:');
  console.log('1. Specific product names (not "Product 1" or generic references)');
  console.log('2. Concrete numbers (orders, ratings, percentages)');
  console.log('3. Contextual date range mentions');
  console.log('4. Explanations of WHY products are good/bad');
  console.log('5. Clear, structured formatting without markdown\n');
}

// Run the test
testChatbot().catch(console.error);
