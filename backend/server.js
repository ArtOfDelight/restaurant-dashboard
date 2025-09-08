require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const axios = require('axios'); // Added for HTTP requests to Gemini API

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000' }));
app.use(express.json());

// Google Sheets setup
let sheets;
let drive;
let authClient;

async function initializeGoogleSheets() {
  try {
    const serviceAccount = require('./service-account-key.json');
    
    authClient = new google.auth.JWT({
      email: serviceAccount.client_email,
      key: serviceAccount.private_key,
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive'
      ],
    });

    await authClient.authorize();
    console.log('✅ Google Auth successful');

    sheets = google.sheets({ version: 'v4', auth: authClient });
    drive = google.drive({ version: 'v3', auth: authClient });
    console.log('✅ Google Sheets and Drive connected');
    console.log(`Service account email: ${serviceAccount.client_email}`);
    
    return true;
  } catch (error) {
    console.error('❌ Error connecting to Google APIs:', error.message);
    return false;
  }
}

// Initialize on startup
initializeGoogleSheets();

// Environment variable validation
const CHECKLIST_SPREADSHEET_ID = process.env.CHECKLIST_SPREADSHEET_ID || '1FYXr8Wz0ddN3mFi-0AQbI6J_noi2glPbJLh44CEMUnE';
const SUBMISSIONS_TAB = process.env.CHECKLIST_SUBMISSIONS_TAB || 'ChecklistSubmissions';
const RESPONSES_TAB = process.env.CHECKLIST_RESPONSES_TAB || 'ChecklistResponses';
const DASHBOARD_SPREADSHEET_ID = process.env.SPREADSHEET_ID || '1XmKondedSs_c6PZflanfB8OFUsGxVoqi5pUPvscT8cs';
const DASHBOARD_SHEET_NAME = process.env.SHEET_NAME || 'Zomato Dashboard';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; // Add Gemini API key to .env

if (!DASHBOARD_SPREADSHEET_ID || !DASHBOARD_SHEET_NAME) {
  console.error('❌ Missing environment variables: SPREADSHEET_ID and SHEET_NAME are required for dashboard endpoints');
}
if (!GEMINI_API_KEY) {
  console.error('❌ Missing environment variable: GEMINI_API_KEY is required for Gemini API integration');
}

// Helper function to create empty data structure for dashboard
function createEmptyDataStructure() {
  return {
    outlets: [],
    m2o: [],
    m2oTrend: [],
    marketShare: [],
    onlinePercent: [],
    foodAccuracy: [],
    delayedOrders: [],
    newUsers: [],
    repeatUsers: [],
    lapsedUsers: [],
    summary: {
      avgM2O: '0',
      avgMarketShare: '0',
      avgOnlinePercent: '0',
      avgFoodAccuracy: '0',
      avgM2OTrend: '0',
      totalOutlets: 0,
    },
  };
}

// Process sheet data function for dashboard - FIXED COLUMN MAPPING
function processSheetData(rawData, requestedPeriod = '7 Day') {
  console.log(`Processing data for period: ${requestedPeriod}`);
  
  if (!rawData || rawData.length === 0) {
    console.log('No data found in sheet');
    return createEmptyDataStructure();
  }

  let startRow = -1;
  const columnOffset = 2; // Column C (index 2) is where headers start
  
  // Set specific row positions based on period
  if (requestedPeriod === '1 Day') {
    // 1 Day: Headers at row 11 (index 10), data from row 12-23 (index 11-22)
    if (rawData[10]) {
      console.log('Found 1 Day headers at row 11');
      startRow = 11; // Row 12 (index 11)
      console.log(`Found 1 Day headers at row 11, data starts at row 12, column offset ${columnOffset}`);
    }
  } else if (requestedPeriod === '7 Day') {
    // 7 Day: Headers at row 27 (index 26), data from row 28-39 (index 27-38)
    if (rawData[26]) {
      console.log('Found 7 Day headers at row 27');
      startRow = 27; // Row 28 (index 27)
      console.log(`Found 7 Day headers at row 27, data starts at row 28, column offset ${columnOffset}`);
    }
  }
  
  if (startRow === -1) {
    console.log(`Could not find ${requestedPeriod} section`);
    return createEmptyDataStructure();
  }

  const data = {
    outlets: [],
    m2o: [],
    m2oTrend: [],
    marketShare: [],
    onlinePercent: [],
    foodAccuracy: [],
    delayedOrders: [],
    newUsers: [],
    repeatUsers: [],
    lapsedUsers: [],
    period: requestedPeriod,
  };
  
  // Set end row based on period
  let endRow;
  if (requestedPeriod === '1 Day') {
    endRow = 22; // Row 23 (index 22) - last data row for 1 Day
  } else if (requestedPeriod === '7 Day') {
    endRow = 38; // Row 39 (index 38) - last data row for 7 Day
  }
  
  console.log(`Processing ${requestedPeriod} Data from row ${startRow + 1} to row ${endRow + 1} with column offset ${columnOffset}`);
  
  // Process each data row within the specified range
  for (let i = startRow; i <= endRow && i < rawData.length; i++) {
    const row = rawData[i];
    
    if (!row) {
      console.log(`Stopping at row ${i + 1}: empty row`);
      break;
    }
    
    // Column mapping based on your headers starting from Column C (index 2):
    // C=Outlet(2), D=Location(3), E=M2O(4), F=M2O Trend(5), G=% of Ad Orders(6), 
    // H=% of Ad Orders Trend(7), I=Order Trend(8), J=New Users%(9), K=Repeat Users%(10), 
    // L=Lapsed Users%(11), M=New Users Trend(12), N=Repeat Users Trend(13), O=Lapsed Users Trend(14), 
    // P=Market Share(15), Q=Market Share Trend(16), R=Online %(17), S=Kitchen Prep Time(18), 
    // T=Food order ready accuracy(19), U=Delayed Order(20)
    
    const outletCode = row[columnOffset]; // Column C - Outlet
    const outletLocation = row[columnOffset + 1]; // Column D - Location
    
    if (!outletLocation || outletLocation === '') {
      console.log(`Stopping at row ${i + 1}: no outlet location`);
      break;
    }
    
    console.log(`Processing outlet: ${outletLocation} (Code: ${outletCode})`);
    data.outlets.push(outletLocation);
    
    // Enhanced value parser to handle #DIV/0!, percentages, and other edge cases
    const parseValue = (val) => {
      if (!val && val !== 0) return 0;
      const str = val.toString().trim();
      
      // Handle error values
      if (str === '#DIV/0!' || str === '#N/A' || str === '#VALUE!' || str === '') return 0;
      
      // Remove percentage signs and clean the string
      const cleanStr = str.replace(/%/g, '').replace(/,/g, '').trim();
      
      const num = parseFloat(cleanStr);
      return isNaN(num) ? 0 : num;
    };
    
    // Correct column mapping based on your header specification:
    data.m2o.push(parseValue(row[columnOffset + 2]));              // Column E - M2O(%)
    data.m2oTrend.push(parseValue(row[columnOffset + 3]));         // Column F - M2O Trend
    data.newUsers.push(parseValue(row[columnOffset + 7]));         // Column J - New Users%
    data.repeatUsers.push(parseValue(row[columnOffset + 8]));      // Column K - Repeat Users%
    data.lapsedUsers.push(parseValue(row[columnOffset + 9]));      // Column L - Lapsed Users%
    data.marketShare.push(parseValue(row[columnOffset + 13]));     // Column P - Market Share
    data.onlinePercent.push(parseValue(row[columnOffset + 15]));   // Column R - Online %
    data.foodAccuracy.push(parseValue(row[columnOffset + 17]));    // Column T - Food order ready accuracy
    data.delayedOrders.push(parseValue(row[columnOffset + 18]));   // Column U - Delayed Order
    
    // Debug log for the first few outlets to verify correct mapping
    if (data.outlets.length <= 2) {
      console.log(`\n🔍 COLUMN MAPPING DEBUG for "${outletLocation}":`);
      console.log(`  M2O (Column E, index ${columnOffset + 2}): "${row[columnOffset + 2]}" -> ${parseValue(row[columnOffset + 2])}`);
      console.log(`  M2O Trend (Column F, index ${columnOffset + 3}): "${row[columnOffset + 3]}" -> ${parseValue(row[columnOffset + 3])}`);
      console.log(`  New Users (Column J, index ${columnOffset + 7}): "${row[columnOffset + 7]}" -> ${parseValue(row[columnOffset + 7])}`);
      console.log(`  Market Share (Column P, index ${columnOffset + 13}): "${row[columnOffset + 13]}" -> ${parseValue(row[columnOffset + 13])}`);
      console.log(`  Online % (Column R, index ${columnOffset + 15}): "${row[columnOffset + 15]}" -> ${parseValue(row[columnOffset + 15])}`);
      console.log(`  Food Accuracy (Column T, index ${columnOffset + 17}): "${row[columnOffset + 17]}" -> ${parseValue(row[columnOffset + 17])}`);
      console.log(`  Delayed Orders (Column U, index ${columnOffset + 18}): "${row[columnOffset + 18]}" -> ${parseValue(row[columnOffset + 18])}\n`);
    }
  }
  
  // Calculate summary statistics
  data.summary = {
    avgM2O: data.m2o.length > 0 ? (data.m2o.reduce((a, b) => a + b, 0) / data.m2o.length).toFixed(2) : '0',
    avgMarketShare: data.marketShare.length > 0 ? (data.marketShare.reduce((a, b) => a + b, 0) / data.marketShare.length).toFixed(2) : '0',
    avgOnlinePercent: data.onlinePercent.length > 0 ? (data.onlinePercent.reduce((a, b) => a + b, 0) / data.onlinePercent.length).toFixed(2) : '0',
    avgFoodAccuracy: data.foodAccuracy.length > 0 ? (data.foodAccuracy.reduce((a, b) => a + b, 0) / data.foodAccuracy.length).toFixed(2) : '0',
    avgM2OTrend: data.m2oTrend.length > 0 ? (data.m2oTrend.reduce((a, b) => a + b, 0) / data.m2oTrend.length).toFixed(2) : '0',
    totalOutlets: data.outlets.length,
  };
  
  console.log(`✅ Processed ${data.outlets.length} outlets for ${requestedPeriod}`);
  console.log('Summary:', data.summary);
  
  return data;
}
// === AI ANALYSIS FUNCTIONS ===

// AI-powered insight generation
async function generateInsightsWithGemini(data, period, analysisType = 'comprehensive') {
  if (!GEMINI_API_KEY) {
    return {
      keyFindings: ['AI insights unavailable - API key not configured'],
      recommendations: ['Please configure GEMINI_API_KEY environment variable'],
      confidence: 0
    };
  }

  try {
    console.log(`🤖 Generating AI insights for ${period} data with ${data.outlets.length} outlets`);
    
    // Prepare data summary for AI analysis
    const dataSummary = {
      period: period,
      totalOutlets: data.outlets.length,
      averageM2O: data.summary.avgM2O,
      averageMarketShare: data.summary.avgMarketShare,
      averageOnlinePercent: data.summary.avgOnlinePercent,
      averageFoodAccuracy: data.summary.avgFoodAccuracy,
      topPerformer: {
        outlet: data.outlets[data.m2o.indexOf(Math.max(...data.m2o))],
        m2o: Math.max(...data.m2o).toFixed(2)
      },
      bottomPerformer: {
        outlet: data.outlets[data.m2o.indexOf(Math.min(...data.m2o))],
        m2o: Math.min(...data.m2o).toFixed(2)
      },
      performanceSpread: (Math.max(...data.m2o) - Math.min(...data.m2o)).toFixed(2),
      outletsNeedingAttention: data.outlets.filter((_, i) => data.m2o[i] < 12).length
    };

    // Create detailed outlet performance array
    const outletPerformance = data.outlets.map((outlet, i) => ({
      name: outlet,
      m2o: data.m2o[i],
      trend: data.m2oTrend[i],
      marketShare: data.marketShare[i],
      onlinePercent: data.onlinePercent[i],
      foodAccuracy: data.foodAccuracy[i],
      newUsers: data.newUsers[i],
      repeatUsers: data.repeatUsers[i],
      lapsedUsers: data.lapsedUsers[i]
    })).sort((a, b) => b.m2o - a.m2o);

    const prompt = `You are an expert restaurant business analyst. Analyze this ${period} performance data for ${dataSummary.totalOutlets} restaurant outlets and provide actionable insights.

PERFORMANCE SUMMARY:
- Average M2O: ${dataSummary.averageM2O}%
- Average Market Share: ${dataSummary.averageMarketShare}%
- Average Online Rate: ${dataSummary.averageOnlinePercent}%
- Average Food Accuracy: ${dataSummary.averageFoodAccuracy}%
- Performance Spread: ${dataSummary.performanceSpread}%
- Outlets Needing Attention: ${dataSummary.outletsNeedingAttention}

TOP 3 PERFORMERS:
${outletPerformance.slice(0, 3).map(o => `${o.name}: M2O ${o.m2o.toFixed(2)}%, Food Accuracy ${o.foodAccuracy.toFixed(2)}%`).join('\n')}

BOTTOM 3 PERFORMERS:
${outletPerformance.slice(-3).map(o => `${o.name}: M2O ${o.m2o.toFixed(2)}%, Food Accuracy ${o.foodAccuracy.toFixed(2)}%`).join('\n')}

ANALYSIS REQUEST:
Provide a JSON response with:
1. keyFindings: Array of 3-5 key insights about performance patterns
2. recommendations: Array of 3-5 specific, actionable recommendations
3. riskFactors: Array of 2-3 main risks identified
4. opportunities: Array of 2-3 growth opportunities

Focus on identifying patterns, correlations between metrics, and actionable business advice. Be specific and data-driven.`;

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.3,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 1000,
        }
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 30000
      }
    );

    if (response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
      const aiResponse = response.data.candidates[0].content.parts[0].text;
      console.log('AI Response received:', aiResponse.substring(0, 200) + '...');
      
      try {
        // Try to parse JSON from AI response
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const insights = JSON.parse(jsonMatch[0]);
          return {
            ...insights,
            confidence: 0.85,
            generatedAt: new Date().toISOString()
          };
        }
      } catch (parseError) {
        console.log('JSON parsing failed, using fallback parsing');
      }
      
      // Fallback: Extract insights from text format
      return {
        keyFindings: extractListFromText(aiResponse, 'findings') || [
          `Average M2O of ${dataSummary.averageM2O}% indicates ${parseFloat(dataSummary.averageM2O) > 12 ? 'good' : 'poor'} overall performance`,
          `Performance spread of ${dataSummary.performanceSpread}% shows significant variation between outlets`,
          `${dataSummary.outletsNeedingAttention} outlets require immediate attention`
        ],
        recommendations: extractListFromText(aiResponse, 'recommendations') || [
          'Focus on outlets with M2O below 12% for immediate intervention',
          'Implement standardized food quality processes across all outlets',
          'Leverage top performer strategies for struggling outlets'
        ],
        riskFactors: extractListFromText(aiResponse, 'risks') || [
          'Performance inconsistency across outlets',
          'Food accuracy below industry standards'
        ],
        opportunities: extractListFromText(aiResponse, 'opportunities') || [
          'Replicate top performer strategies',
          'Improve customer retention through quality consistency'
        ],
        confidence: 0.75,
        generatedAt: new Date().toISOString()
      };
    }

    throw new Error('No valid response from AI');

  } catch (error) {
    console.error('AI insight generation error:', error.message);
    
    // Return intelligent fallback based on data analysis
    return generateFallbackInsights(dataSummary, outletPerformance);
  }
}

// Fallback insights generation using data analysis
function generateFallbackInsights(dataSummary, outletPerformance) {
  const avgM2O = parseFloat(dataSummary.averageM2O);
  const avgAccuracy = parseFloat(dataSummary.averageFoodAccuracy);
  
  return {
    keyFindings: [
      `Average M2O of ${avgM2O.toFixed(2)}% is ${avgM2O > 14 ? 'excellent' : avgM2O > 12 ? 'good' : 'below target'}`,
      `Performance spread of ${dataSummary.performanceSpread}% indicates ${parseFloat(dataSummary.performanceSpread) > 5 ? 'high' : 'moderate'} inconsistency`,
      `${dataSummary.outletsNeedingAttention} outlets performing below 12% M2O threshold`,
      `Food accuracy averaging ${avgAccuracy.toFixed(2)}% ${avgAccuracy > 95 ? 'exceeds' : 'needs improvement to meet'} quality standards`
    ],
    recommendations: [
      avgM2O < 12 ? 'Immediate intervention needed for underperforming outlets' : 'Maintain current performance standards',
      avgAccuracy < 95 ? 'Implement food quality improvement program' : 'Sustain current food quality processes',
      'Deploy best practices from top performers to struggling outlets',
      'Monitor performance metrics weekly for early intervention'
    ],
    riskFactors: [
      dataSummary.outletsNeedingAttention > 0 ? 'Multiple outlets below performance threshold' : 'Performance consistency risk',
      avgAccuracy < 95 ? 'Food quality standards not met consistently' : 'Customer satisfaction risk'
    ],
    opportunities: [
      'Scale successful strategies from top performers',
      parseFloat(dataSummary.averageOnlinePercent) > 80 ? 'Leverage strong digital presence' : 'Improve online ordering adoption'
    ],
    confidence: 0.65,
    generatedAt: new Date().toISOString(),
    source: 'data-analysis-fallback'
  };
}

// Extract lists from AI text response
function extractListFromText(text, keyword) {
  const patterns = {
    findings: /(?:key findings|insights)[:\s]*((?:[-•*]\s*.*.*(?:\n|$))*)/i,
    recommendations: /(?:recommendations|actions)[:\s]*((?:[-•*]\s*.*(?:\n|$))*)/i,
    risks: /(?:risks?|concerns?)[:\s]*((?:[-•*]\s*.*(?:\n|$))*)/i,
    opportunities: /(?:opportunities)[:\s]*((?:[-•*]\s*.*(?:\n|$))*)/i
  };
  
  const match = text.match(patterns[keyword]);
  if (match && match[1]) {
    return match[1]
      .split('\n')
      .map(line => line.replace(/^[-•*]\s*/, '').trim())
      .filter(line => line.length > 0);
  }
  return null;
}

// Outlet-specific AI analysis
async function analyzeOutletWithGemini(outlet, period, allData) {
  if (!GEMINI_API_KEY) {
    return `AI analysis unavailable - API key not configured. Based on data: ${outlet.name} has M2O of ${outlet.m2o.toFixed(2)}% which is ${outlet.m2o > 14 ? 'excellent' : outlet.m2o > 12 ? 'good' : 'needs improvement'}.`;
  }

  try {
    const prompt = `Analyze this specific restaurant outlet performance for ${period}:

OUTLET: ${outlet.name}
METRICS:
- M2O: ${outlet.m2o.toFixed(2)}% (Trend: ${outlet.m2oTrend > 0 ? '+' : ''}${outlet.m2oTrend.toFixed(2)}%)
- Market Share: ${outlet.marketShare.toFixed(2)}%
- Online Rate: ${outlet.onlinePercent.toFixed(2)}%
- Food Accuracy: ${outlet.foodAccuracy.toFixed(2)}%
- New Users: ${outlet.newUsers.toFixed(2)}%
- Repeat Users: ${outlet.repeatUsers.toFixed(2)}%
- Lapsed Users: ${outlet.lapsedUsers.toFixed(2)}%

CONTEXT:
- Industry M2O benchmark: 12-15%
- Food accuracy target: 95%+
- Average M2O across all outlets: ${allData.summary.avgM2O}%

Provide a concise 2-3 sentence analysis focusing on:
1. Current performance assessment
2. Main strengths/weaknesses
3. Specific actionable recommendation`;

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 200
        }
      },
      { timeout: 15000 }
    );

    if (response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
      return response.data.candidates[0].content.parts[0].text.trim();
    }

    throw new Error('No AI response');

  } catch (error) {
    console.error('Outlet AI analysis error:', error.message);
    
    // Fallback analysis
    const performance = outlet.m2o > 14 ? 'excellent' : outlet.m2o > 12 ? 'good' : outlet.m2o > 10 ? 'average' : 'poor';
    const trend = outlet.m2oTrend > 0 ? 'improving' : 'declining';
    const foodQuality = outlet.foodAccuracy > 95 ? 'excellent' : outlet.foodAccuracy > 90 ? 'acceptable' : 'concerning';
    
    return `${outlet.name} shows ${performance} performance with ${outlet.m2o.toFixed(2)}% M2O and ${trend} trend. Food accuracy is ${foodQuality} at ${outlet.foodAccuracy.toFixed(2)}%. ${
      outlet.m2o < 12 ? 'Immediate focus needed on customer satisfaction and operational efficiency.' : 
      'Maintain current strategies while monitoring key metrics.'
    }`;
  }
}

// Helper function to safely get cell value
function getCellValue(row, index, defaultValue = '') {
  if (!row || !row[index]) return defaultValue;
  return row[index].toString().trim();
}

// Helper function to format date for consistency
function formatDate(dateString) {
  if (!dateString) return '';
  
  try {
    let date;
    const serialNum = parseFloat(dateString);
    if (!isNaN(serialNum) && dateString.trim() === serialNum.toString()) {
      // Handle Google Sheets serial date (days since 1899-12-30)
      date = new Date((serialNum - 25569) * 86400 * 1000);
    } else if (dateString.includes('/')) {
      const parts = dateString.split('/');
      if (parts.length === 3) {
        date = new Date(parts[2], parts[1] - 1, parts[0]);
      }
    } else if (dateString.includes('-')) {
      date = new Date(dateString);
    } else {
      date = new Date(dateString);
    }
    
    if (date && !isNaN(date.getTime())) {
      return date.getFullYear() + '-' + 
             String(date.getMonth() + 1).padStart(2, '0') + '-' + 
             String(date.getDate()).padStart(2, '0');
    }
    
    return dateString;
  } catch (error) {
    console.error('Date formatting error:', error);
    return dateString;
  }
}

// Helper function to validate Google Drive image accessibility
async function validateImageLink(imageLink) {
  if (!imageLink || !imageLink.trim()) {
    console.warn('⚠️ Empty or invalid image link');
    return { accessible: false, error: 'Empty link', fileId: null, url: null };
  }

  try {
    const patterns = [
      /\/file\/d\/([a-zA-Z0-9-_]+)/,
      /\/open\?id=([a-zA-Z0-9-_]+)/,
      /^([a-zA-Z0-9-_]+)$/,
    ];

    let fileId = null;
    for (const pattern of patterns) {
      const match = imageLink.match(pattern);
      if (match) {
        fileId = match[1];
        break;
      }
    }

    if (!fileId) {
      console.warn(`⚠️ Invalid Google Drive link format: ${imageLink}`);
      return { accessible: false, error: 'Invalid link format', fileId: null, url: null };
    }

    const proxyUrl = `/api/image-proxy/${fileId}`;

    try {
      const response = await drive.files.get({
        fileId,
        fields: 'id, mimeType, webViewLink, parents',
      });

      const mimeType = response.data.mimeType;
      if (!mimeType.startsWith('image/')) {
        console.warn(`⚠️ File is not an image: ${fileId}, MIME: ${mimeType}`);
        return { accessible: false, error: `Not an image file (MIME: ${mimeType})`, fileId, url: proxyUrl };
      }

      console.log(`✅ Valid image file: ${fileId}`);
      return {
        accessible: true,
        fileId,
        url: proxyUrl,
      };
    } catch (error) {
      console.error(`❌ Error validating image ${imageLink}: ${error.message}`);
      let errorMessage = error.message;
      if (error.message.includes('File not found')) {
        errorMessage = `File not found: ${fileId}. Ensure the file is shared with the service account (${authClient.email || 'unknown'})`;
        console.warn(`⚠️ ${errorMessage}. Attempting proxy URL: ${proxyUrl}`);
      } else if (error.code === 403) {
        errorMessage = `Permission denied for file ${fileId}. Share the file with the service account (${authClient.email || 'unknown'})`;
        console.warn(`⚠️ ${errorMessage}. Attempting proxy URL: ${proxyUrl}`);
      }
      return {
        accessible: false,
        fileId,
        url: proxyUrl,
        error: errorMessage
      };
    }
  } catch (error) {
    console.error(`❌ Unexpected error validating image ${imageLink}: ${error.message}`);
    return { accessible: false, error: `Unexpected error: ${error.message}`, fileId: null, url: null };
  }
}

// Image proxy endpoint to bypass CORS - FIXED VERSION
app.get('/api/image-proxy/:fileId', async (req, res) => {
  try {
    const fileId = req.params.fileId;
    console.log(`📷 Proxying image for fileId: ${fileId}`);
    
    // Add CORS headers
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    
    const response = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'stream' }
    );
    
    // Set content type and cache headers
    const contentType = response.headers['content-type'] || 'image/jpeg';
    res.set({
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*'
    });
    
    response.data.pipe(res);
    
  } catch (error) {
    console.error(`❌ Image proxy error for file ${req.params.fileId}: ${error.message}`);
    
    // Set CORS headers even for errors
    res.header('Access-Control-Allow-Origin', '*');
    
    if (error.code === 404) {
      res.status(404).json({
        error: 'Image not found',
        fileId: req.params.fileId,
        message: 'The requested image file was not found or is not accessible.'
      });
    } else if (error.code === 403) {
      res.status(403).json({
        error: 'Access denied',
        fileId: req.params.fileId,
        message: 'Permission denied. Make sure the file is shared with the service account.',
        serviceAccount: authClient.email
      });
    } else {
      res.status(500).json({
        error: 'Internal server error',
        fileId: req.params.fileId,
        message: error.message
      });
    }
  }
});

// Add OPTIONS handler for CORS preflight
app.options('/api/image-proxy/:fileId', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.sendStatus(200);
});

// Checklist data endpoint - FIXED WITH PARALLEL IMAGE VALIDATION
// Checklist data endpoint - FIXED FOR DUPLICATES
app.get('/api/checklist-data', async (req, res) => {
  try {
    console.log('📋 Fetching checklist data...');

    if (!sheets || !drive) {
      const initialized = await initializeGoogleSheets();
      if (!initialized) {
        throw new Error('Failed to initialize Google APIs');
      }
    }

    console.log(`Using spreadsheet: ${CHECKLIST_SPREADSHEET_ID}`);
    console.log(`Submissions tab: ${SUBMISSIONS_TAB}`);
    console.log(`Responses tab: ${RESPONSES_TAB}`);

    console.log(`Fetching ${SUBMISSIONS_TAB}...`);
    const submissionsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: CHECKLIST_SPREADSHEET_ID,
      range: `${SUBMISSIONS_TAB}!A:Z`,
    });

    console.log(`Fetching ${RESPONSES_TAB}...`);
    const responsesResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: CHECKLIST_SPREADSHEET_ID,
      range: `${RESPONSES_TAB}!A:Z`,
    });

    const submissionsData = submissionsResponse.data.values || [];
    const responsesData = responsesResponse.data.values || [];
    console.log(`Found ${submissionsData.length} submission rows and ${responsesData.length} response rows`);

    // Process submissions with deduplication
    const submissionsMap = new Map(); // Use Map to track unique submissionIds
    if (submissionsData.length > 1) {
      const headers = submissionsData[0];
      console.log('Submission headers:', headers);

      for (let i = 1; i < submissionsData.length; i++) {
        const row = submissionsData[i];

        // Skip completely empty rows
        if (!row || (Array.isArray(row) && row.every(cell => !cell && cell !== 0))) {
          console.log(`Skipping completely empty row ${i + 1}`);
          continue;
        }

        const rawSubmissionId = getCellValue(row, 0);
        const submissionId = rawSubmissionId || `AUTO-${i}`;
        const submission = {
          submissionId,
          date: formatDate(getCellValue(row, 1)),
          timeSlot: getCellValue(row, 2),
          outlet: getCellValue(row, 3),
          submittedBy: getCellValue(row, 4),
          timestamp: getCellValue(row, 5),
          rowNumber: i + 1,
        };

        // Only add if not a duplicate
        if (submissionsMap.has(submissionId)) {
          console.warn(`⚠️ Duplicate submissionId detected: ${submissionId} at row ${i + 1}, keeping first occurrence`);
        } else {
          submissionsMap.set(submissionId, submission);
          console.log(`Processed submission at row ${i + 1}:`, {
            submissionId,
            outlet: submission.outlet,
            submittedBy: submission.submittedBy,
            date: submission.date,
          });
        }
      }
    }

    const submissions = Array.from(submissionsMap.values());
    console.log(`After deduplication, ${submissions.length} unique submissions remain`);

    // Process responses
    const tempResponses = [];
    if (responsesData.length > 1) {
      const headers = responsesData[0];
      console.log('Response headers:', headers);

      for (let i = 1; i < responsesData.length; i++) {
        const row = responsesData[i];

        // Skip completely empty rows
        if (!row || (Array.isArray(row) && row.every(cell => !cell && cell !== 0))) {
          continue;
        }

        const submissionId = getCellValue(row, 0) || `AUTO-${i}`;
        const question = getCellValue(row, 1);
        const answer = getCellValue(row, 2);
        const imageLink = getCellValue(row, 3);
        const imageCode = getCellValue(row, 4);

        // Only include responses with minimal data
        if (question || answer || submissionId) {
          tempResponses.push({
            submissionId,
            question,
            answer,
            imageLink,
            imageCode,
            rowNumber: i + 1,
          });
        }
      }
    }

    // Parallelize image validations
    console.log(`Validating ${tempResponses.length} responses with images`);
    const validationPromises = tempResponses.map(r =>
      r.imageLink
        ? validateImageLink(r.imageLink)
        : Promise.resolve({ accessible: false, error: 'No image link', fileId: null, url: null })
    );

    const validations = await Promise.all(validationPromises);

    // Build final responses array
    const responses = tempResponses.map((r, idx) => {
      const v = validations[idx];
      return {
        submissionId: r.submissionId,
        question: r.question || '',
        answer: r.answer || '',
        image: v.url || r.imageLink || '',
        imageCode: r.imageCode || '',
        imageAccessible: v.accessible || false,
        imageError: v.error || null,
        fileId: v.fileId || null,
        rowNumber: r.rowNumber,
      };
    });

    // Filter responses to match unique submission IDs
    const submissionIds = new Set(submissions.map(s => s.submissionId));
    const filteredResponses = responses.filter(r => {
      const included = submissionIds.has(r.submissionId);
      if (!included) {
        console.log(`Filtered out response for submissionId ${r.submissionId} at row ${r.rowNumber}: no matching submission`);
      }
      return included;
    });

    // Log unmatched responses for debugging
    const unmatchedSubmissionIds = [...new Set(responses.map(r => r.submissionId))].filter(id => !submissionIds.has(id));
    if (unmatchedSubmissionIds.length > 0) {
      console.warn(`⚠️ Found ${unmatchedSubmissionIds.length} submissionIds in responses with no matching submissions:`, unmatchedSubmissionIds);
    }

    console.log(`✅ Processed ${submissions.length} submissions and ${filteredResponses.length} responses`);

    // Calculate metadata
    const droppedSubmissions = (submissionsData.length - 1) - submissions.length;
    const droppedResponses = (responsesData.length - 1) - responses.length;

    res.set('Content-Type', 'application/json');
    res.json({
      success: true,
      submissions,
      responses: filteredResponses,
      metadata: {
        spreadsheetId: CHECKLIST_SPREADSHEET_ID,
        submissionsTab: SUBMISSIONS_TAB,
        responsesTab: RESPONSES_TAB,
        submissionCount: submissions.length,
        responseCount: filteredResponses.length,
        originalSubmissionRows: submissionsData.length - 1,
        originalResponseRows: responsesData.length - 1,
        droppedSubmissions,
        droppedResponses,
        unmatchedSubmissionIds,
        duplicateSubmissionIds: Array.from(submissionsMap.keys()).filter(id => submissionsMap.get(id).rowNumber !== submissionsMap.get(id).rowNumber),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('❌ Error fetching checklist data:', error.message, error.stack);
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.data || 'No additional details',
      timestamp: new Date().toISOString(),
    });
  }
});

// Enhanced getCellValue helper function
function getCellValue(row, index, defaultValue = '') {
  if (!row || index >= row.length) return defaultValue;
  const value = row[index];
  if (value === null || value === undefined) return defaultValue;
  return value.toString().trim();
}

// Checklist statistics endpoint
app.get('/api/checklist-stats', async (req, res) => {
  try {
    console.log('📊 Calculating checklist statistics...');
    
    if (!sheets || !drive) {
      const initialized = await initializeGoogleSheets();
      if (!initialized) {
        throw new Error('Failed to initialize Google APIs');
      }
    }

    const submissionsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: CHECKLIST_SPREADSHEET_ID,
      range: `${SUBMISSIONS_TAB}!A:Z`,
    });

    const responsesResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: CHECKLIST_SPREADSHEET_ID,
      range: `${RESPONSES_TAB}!A:Z`,
    });

    const submissionsData = submissionsResponse.data.values || [];
    const responsesData = responsesResponse.data.values || [];

    const submissions = [];
    if (submissionsData.length > 1) {
      for (let i = 1; i < submissionsData.length; i++) {
        const row = submissionsData[i];
        if (!row || row.length === 0) continue;
        
        const submission = {
          date: formatDate(getCellValue(row, 1)),
          outlet: getCellValue(row, 3),
          submittedBy: getCellValue(row, 4),
        };
        
        if (submission.outlet) {
          submissions.push(submission);
        }
      }
    }

    let imageCount = 0;
    if (responsesData.length > 1) {
      for (let i = 1; i < responsesData.length; i++) {
        const row = responsesData[i];
        if (!row || row.length === 0) continue;
        
        const image = getCellValue(row, 3);
        if (image && image.trim() && image !== '') {
          const validation = await validateImageLink(image);
          if (validation.accessible) {
            imageCount++;
          }
        }
      }
    }

    const today = new Date().toISOString().split('T')[0];
    const todaySubmissions = submissions.filter(s => s.date === today).length;
    const uniqueOutlets = [...new Set(submissions.map(s => s.outlet).filter(o => o))];
    const uniqueEmployees = [...new Set(submissions.map(s => s.submittedBy).filter(e => e))];

    const stats = {
      totalSubmissions: submissions.length,
      todaySubmissions,
      uniqueOutlets: uniqueOutlets.length,
      totalImages: imageCount,
      outlets: uniqueOutlets.sort(),
      employees: uniqueEmployees.sort(),
    };

    console.log('✅ Statistics calculated:', stats);

    res.set('Content-Type', 'application/json');
    res.json({
      success: true,
      stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('❌ Error calculating checklist stats:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Filter checklist data endpoint - FIXED FOR CONSISTENCY WITH DEDUPLICATED DATA
app.post('/api/checklist-filter', async (req, res) => {
  try {
    const filters = req.body;
    console.log('🔍 Filtering checklist data with:', filters);

    // Validate filters
    if (!filters || typeof filters !== 'object') {
      console.error('Invalid filters provided:', filters);
      return res.status(400).json({
        success: false,
        error: 'Invalid or missing filters in request body',
        timestamp: new Date().toISOString(),
      });
    }

    // Normalize filters for consistent comparison
    const normalizedFilters = {
      date: filters.date ? formatDate(filters.date.trim()) : null,
      outlet: filters.outlet ? filters.outlet.trim().toLowerCase() : null,
      timeSlot: filters.timeSlot ? filters.timeSlot.trim().toLowerCase() : null,
      employee: filters.employee ? filters.employee.trim().toLowerCase() : null,
    };
    console.log('Normalized filters:', normalizedFilters);

    // Reuse logic from /api/checklist-data
    if (!sheets || !drive) {
      const initialized = await initializeGoogleSheets();
      if (!initialized) {
        throw new Error('Failed to initialize Google APIs');
      }
    }

    console.log(`Fetching ${SUBMISSIONS_TAB}...`);
    const submissionsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: CHECKLIST_SPREADSHEET_ID,
      range: `${SUBMISSIONS_TAB}!A:Z`,
      majorDimension: 'ROWS',
    });

    console.log(`Fetching ${RESPONSES_TAB}...`);
    const responsesResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: CHECKLIST_SPREADSHEET_ID,
      range: `${RESPONSES_TAB}!A:Z`,
      majorDimension: 'ROWS',
    });

    const submissionsData = submissionsResponse.data.values || [];
    const responsesData = responsesResponse.data.values || [];
    console.log(`Found ${submissionsData.length} submission rows and ${responsesData.length} response rows`);

    // Process submissions with deduplication
    const submissionsMap = new Map();
    if (submissionsData.length > 1) {
      const headers = submissionsData[0];
      console.log('Submission headers:', headers);

      for (let i = 1; i < submissionsData.length; i++) {
        const row = submissionsData[i];

        // Skip completely empty rows
        if (!row || (Array.isArray(row) && row.every(cell => !cell && cell !== 0))) {
          console.log(`Skipping completely empty row ${i + 1}`);
          continue;
        }

        const rawSubmissionId = getCellValue(row, 0);
        const submissionId = rawSubmissionId || `AUTO-${i}`;
        const submission = {
          submissionId,
          date: formatDate(getCellValue(row, 1)),
          timeSlot: getCellValue(row, 2),
          outlet: getCellValue(row, 3),
          submittedBy: getCellValue(row, 4),
          timestamp: getCellValue(row, 5),
          rowNumber: i + 1,
        };

        // Apply filters
        let passesFilter = true;
        if (normalizedFilters.date && submission.date !== normalizedFilters.date) {
          passesFilter = false;
        }
        if (normalizedFilters.outlet && (!submission.outlet || !submission.outlet.toLowerCase().includes(normalizedFilters.outlet))) {
          passesFilter = false;
        }
        if (normalizedFilters.timeSlot && (!submission.timeSlot || !submission.timeSlot.toLowerCase().includes(normalizedFilters.timeSlot))) {
          passesFilter = false;
        }
        if (normalizedFilters.employee && (!submission.submittedBy || !submission.submittedBy.toLowerCase().includes(normalizedFilters.employee))) {
          passesFilter = false;
        }

        // Only add if it passes filters and is not a duplicate
        if (passesFilter) {
          if (submissionsMap.has(submissionId)) {
            console.warn(`⚠️ Duplicate submissionId detected: ${submissionId} at row ${i + 1}, keeping first occurrence`);
          } else {
            submissionsMap.set(submissionId, submission);
            console.log(`Processed submission at row ${i + 1}:`, {
              submissionId,
              outlet: submission.outlet,
              submittedBy: submission.submittedBy,
              date: submission.date,
              timeSlot: submission.timeSlot,
            });
          }
        } else {
          console.log(`Filtered out row ${i + 1}:`, {
            submissionId,
            outlet: submission.outlet,
            submittedBy: submission.submittedBy,
            date: submission.date,
            timeSlot: submission.timeSlot,
          });
        }
      }
    }

    const submissions = Array.from(submissionsMap.values());
    console.log(`After deduplication and filtering, ${submissions.length} unique submissions remain`);

    // Process responses
    const tempResponses = [];
    if (responsesData.length > 1) {
      const headers = responsesData[0];
      console.log('Response headers:', headers);

      for (let i = 1; i < responsesData.length; i++) {
        const row = responsesData[i];

        // Skip completely empty rows
        if (!row || (Array.isArray(row) && row.every(cell => !cell && cell !== 0))) {
          continue;
        }

        const submissionId = getCellValue(row, 0) || `AUTO-${i}`;
        const question = getCellValue(row, 1);
        const answer = getCellValue(row, 2);
        const imageLink = getCellValue(row, 3);
        const imageCode = getCellValue(row, 4);

        // Only include responses with minimal data
        if (question || answer || submissionId) {
          tempResponses.push({
            submissionId,
            question,
            answer,
            imageLink,
            imageCode,
            rowNumber: i + 1,
          });
        }
      }
    }

    // Parallelize image validations
    console.log(`Validating ${tempResponses.length} responses with images`);
    const validationPromises = tempResponses.map(r =>
      r.imageLink
        ? validateImageLink(r.imageLink)
        : Promise.resolve({ accessible: false, error: 'No image link', fileId: null, url: null })
    );

    const validations = await Promise.all(validationPromises);

    // Build final responses array
    const responses = tempResponses.map((r, idx) => {
      const v = validations[idx];
      return {
        submissionId: r.submissionId,
        question: r.question || '',
        answer: r.answer || '',
        image: v.url || r.imageLink || '',
        imageCode: r.imageCode || '',
        imageAccessible: v.accessible || false,
        imageError: v.error || null,
        fileId: v.fileId || null,
        rowNumber: r.rowNumber,
      };
    });

    // Filter responses to match unique submission IDs
    const submissionIds = new Set(submissions.map(s => s.submissionId));
    const filteredResponses = responses.filter(r => {
      const included = submissionIds.has(r.submissionId);
      if (!included) {
        console.log(`Filtered out response for submissionId ${r.submissionId} at row ${r.rowNumber}: no matching submission`);
      }
      return included;
    });

    // Log unmatched responses for debugging
    const unmatchedSubmissionIds = [...new Set(responses.map(r => r.submissionId))].filter(id => !submissionIds.has(id));
    if (unmatchedSubmissionIds.length > 0) {
      console.warn(`⚠️ Found ${unmatchedSubmissionIds.length} submissionIds in responses with no matching submissions:`, unmatchedSubmissionIds);
    }

    console.log(`✅ Filtered to ${submissions.length} submissions and ${filteredResponses.length} responses`);

    // Calculate metadata
    const droppedSubmissions = (submissionsData.length - 1) - submissions.length;
    const droppedResponses = (responsesData.length - 1) - responses.length;

    res.set('Content-Type', 'application/json');
    res.json({
      success: true,
      submissions,
      responses: filteredResponses,
      metadata: {
        spreadsheetId: CHECKLIST_SPREADSHEET_ID,
        submissionsTab: SUBMISSIONS_TAB,
        responsesTab: RESPONSES_TAB,
        submissionCount: submissions.length,
        responseCount: filteredResponses.length,
        originalSubmissionRows: submissionsData.length - 1,
        originalResponseRows: responsesData.length - 1,
        droppedSubmissions,
        droppedResponses,
        appliedFilters: normalizedFilters,
        unmatchedSubmissionIds,
        duplicateSubmissionIds: Array.from(submissionsMap.keys()).filter(id => submissionsMap.get(id).rowNumber !== submissionsMap.get(id).rowNumber),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('❌ Error filtering checklist data:', error.message, error.stack);
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.data || 'No additional details',
      timestamp: new Date().toISOString(),
    });
  }
});
// Debug checklist endpoint
app.get('/api/debug-checklist', async (req, res) => {
  try {
    if (!sheets) {
      await initializeGoogleSheets();
    }

    console.log(`Debug: Checking spreadsheet ${CHECKLIST_SPREADSHEET_ID}`);
    console.log(`Debug: Submissions tab: ${SUBMISSIONS_TAB}`);
    console.log(`Debug: Responses tab: ${RESPONSES_TAB}`);
    
    const submissionsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: CHECKLIST_SPREADSHEET_ID,
      range: `${SUBMISSIONS_TAB}!A:Z`,
    });

    const responsesResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: CHECKLIST_SPREADSHEET_ID,
      range: `${RESPONSES_TAB}!A:Z`,
    });
    
    res.set('Content-Type', 'application/json');
    res.json({
      success: true,
      spreadsheetId: CHECKLIST_SPREADSHEET_ID,
      tabs: {
        submissions: SUBMISSIONS_TAB,
        responses: RESPONSES_TAB,
      },
      submissionsData: submissionsResponse.data.values || [],
      responsesData: responsesResponse.data.values || [],
      rowCounts: {
        submissions: submissionsResponse.data.values ? submissionsResponse.data.values.length : 0,
        responses: responsesResponse.data.values ? responsesResponse.data.values.length : 0,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('❌ Debug checklist error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      spreadsheetId: CHECKLIST_SPREADSHEET_ID,
    });
  }
});

// Dashboard data endpoint - UPDATED
app.get('/api/dashboard-data', async (req, res) => {
  try {
    const period = req.query.period || '28 Day';
    console.log(`📊 Dashboard data requested for period: ${period}`);
    
    if (!['7 Day', '1 Day'].includes(period)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid period. Must be one of: 7 Day, 1 Day',
      });
    }

    if (!sheets) {
      const initialized = await initializeGoogleSheets();
      if (!initialized) {
        throw new Error('Failed to initialize Google Sheets');
      }
    }

    if (!DASHBOARD_SPREADSHEET_ID || !DASHBOARD_SHEET_NAME) {
      throw new Error('Missing SPREADSHEET_ID or SHEET_NAME environment variables');
    }

    console.log(`Fetching dashboard data for ${period} from: ${DASHBOARD_SPREADSHEET_ID} Range: ${DASHBOARD_SHEET_NAME}!A1:Z300`);
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: DASHBOARD_SPREADSHEET_ID,
      range: `${DASHBOARD_SHEET_NAME}!A1:Z300`,
    });
    
    console.log(`Retrieved ${response.data.values ? response.data.values.length : 0} rows from Google Sheets`);
    
    const processedData = processSheetData(response.data.values, period);
    
    console.log(`✅ Successfully processed dashboard data for ${period}:`, {
      outlets: processedData.outlets.length,
      avgM2O: processedData.summary.avgM2O,
      avgMarketShare: processedData.summary.avgMarketShare
    });
    
    res.set('Content-Type', 'application/json');
    res.json({
      success: true,
      data: processedData,
      aiEnabled: !!GEMINI_API_KEY,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('❌ Error fetching dashboard data:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.data || 'No additional details',
    });
  }
});

// Debug dashboard endpoint
app.get('/api/debug-sheet', async (req, res) => {
  try {
    if (!sheets) {
      await initializeGoogleSheets();
    }

    console.log(`🔍 Debug: Fetching raw sheet data from ${DASHBOARD_SPREADSHEET_ID}`);
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: DASHBOARD_SPREADSHEET_ID,
      range: `${DASHBOARD_SHEET_NAME}!A1:Z50`, // Get first 50 rows for debugging
    });
    
    const rawData = response.data.values || [];
    console.log(`Debug: Retrieved ${rawData.length} rows`);
    
    // Find period markers
    const periodMarkers = [];
    rawData.forEach((row, index) => {
      if (row) {
        row.forEach((cell, colIndex) => {
          if (cell && cell.toString().includes('Day Data')) {
            periodMarkers.push({
              period: cell.toString(),
              row: index + 1,
              column: colIndex + 1
            });
          }
        });
      }
    });
    
    console.log('Debug: Found period markers:', periodMarkers);
    
    res.set('Content-Type', 'application/json');
    res.json({
      success: true,
      spreadsheetId: DASHBOARD_SPREADSHEET_ID,
      sheetName: DASHBOARD_SHEET_NAME,
      rawData: rawData.slice(0, 30), // Return first 30 rows
      totalRows: rawData.length,
      periodMarkers: periodMarkers,
      firstRow: rawData[0] || null,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('❌ Error fetching debug dashboard data:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      spreadsheetId: DASHBOARD_SPREADSHEET_ID,
      sheetName: DASHBOARD_SHEET_NAME,
    });
  }
});

// High Rated Dashboard Live data endpoint - COMPLETELY FIXED VERSION
app.get('/api/high-rated-data-gemini', async (req, res) => {
  try {
    const period = req.query.period || '7 Days';
    console.log(`📊 High Rated data requested for period: ${period}`);

    if (!['7 Days', '28 Day'].includes(period)) {
      // Set proper JSON headers even for errors
      res.set('Content-Type', 'application/json');
      return res.status(400).json({
        success: false,
        error: 'Invalid period. Must be one of: 7 Days, 28 Day',
      });
    }

    if (!sheets) {
      const initialized = await initializeGoogleSheets();
      if (!initialized) {
        res.set('Content-Type', 'application/json');
        return res.status(500).json({
          success: false,
          error: 'Failed to initialize Google Sheets',
        });
      }
    }

    const HIGH_RATED_SPREADSHEET_ID = '1FYXr8Wz0ddN3mFi-0AQbI6J_noi2glPbJLh44CEMUnE';
    const HIGH_RATED_SHEET_NAME = 'High Rated Dashboard Live';

    console.log(`Fetching High Rated data for ${period} from: ${HIGH_RATED_SPREADSHEET_ID}`);

    const sheetResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: HIGH_RATED_SPREADSHEET_ID,
      range: `${HIGH_RATED_SHEET_NAME}!A1:Z50`,
    });

    console.log(`Retrieved ${sheetResponse.data.values ? sheetResponse.data.values.length : 0} rows from Google Sheets`);

    // Process high rated data with fixed structure
    const processedData = processHighRatedSheetDataFixed(sheetResponse.data.values, period);

    console.log(`✅ Successfully processed High Rated data for ${period}:`, {
      outlets: processedData.length,
      sample: processedData[0] || {},
    });

    // CRITICAL: Set JSON headers before sending response
    res.set('Content-Type', 'application/json');
    res.json({
      success: true,
      data: processedData,
      metadata: {
        spreadsheetId: HIGH_RATED_SPREADSHEET_ID,
        sheetName: HIGH_RATED_SHEET_NAME,
        period: period,
        rowCount: sheetResponse.data.values ? sheetResponse.data.values.length : 0,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('❌ Error fetching High Rated data:', error.message);
    // Set JSON headers even for error responses
    res.set('Content-Type', 'application/json');
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.data || 'No additional details',
    });
  }
});

// FIXED High Rated data processing function based on your specifications
function processHighRatedSheetDataFixed(rawData, requestedPeriod = '7 Days') {
  console.log(`Processing High Rated data for period: ${requestedPeriod} with fixed structure`);
  
  if (!rawData || rawData.length === 0) {
    console.log('No data found in High Rated sheet');
    return [];
  }

  let startRow = -1;
  let endRow = -1;
  const columnOffset = 3; // Column D (index 3) contains outlet names
  
  if (requestedPeriod === '7 Days') {
    // 7 days header in row 1, data starts from row 2, ends at row 12
    if (rawData[0] && rawData[0].some(cell => cell && cell.toString().includes('7'))) {
      console.log('Found 7 Days header in row 1');
      startRow = 1; // Row 2 (index 1)
      endRow = 11;  // Row 12 (index 11)
    }
  } else if (requestedPeriod === '28 Day') {
    // 28 days headers in row 18, data starts from row 19
    if (rawData[17] && rawData[17].some(cell => cell && cell.toString().includes('28'))) {
      console.log('Found 28 Day header in row 18');
      startRow = 18; // Row 19 (index 18)
      endRow = 28;   // Adjust end row as needed
    }
  }
  
  if (startRow === -1) {
    console.log(`Could not find ${requestedPeriod} section in High Rated sheet`);
    return [];
  }

  const processedData = [];
  
  console.log(`Processing High Rated ${requestedPeriod} Data from row ${startRow + 1} to row ${endRow + 1}, using column D for outlet names`);
  
  // Process each data row within the specified range
  for (let i = startRow; i <= endRow && i < rawData.length; i++) {
    const row = rawData[i];
    
    if (!row) {
      console.log(`Stopping at row ${i + 1}: empty row`);
      break;
    }
    
    // Get outlet name from column D (index 3)
    const outletName = getCellValue(row, columnOffset, '').trim();
    
    if (!outletName || outletName === '' || outletName === 'TOTAL') {
      if (outletName === 'TOTAL') {
        // Process total row if needed
        const totalData = {
          outlet_code: "TOTAL",
          outlet_name: "All Outlets",
          start_date: getCellValue(row, 1, ''),
          end_date: getCellValue(row, 2, ''),
          total_orders: parseHighRatedValue(row[4]),
          low_rated: parseHighRatedValue(row[5]),
          igcc: parseHighRatedValue(row[6]),
          errors: parseHighRatedValue(row[7]),
          error_rate: parseHighRatedValue(row[8]),
          high_rated: parseHighRatedValue(row[9]),
          high_rated_percent: parseHighRatedValue(row[10]),
          high_minus_error: parseHighRatedValue(row[11]),
          incentive: parseHighRatedValue(row[12]),
          deduction: parseHighRatedValue(row[13]),
          incentives: parseHighRatedValue(row[14]),
          per_day: parseHighRatedValue(row[15])
        };
        processedData.push(totalData);
        console.log(`Processed TOTAL row:`, totalData);
      }
      console.log(`Stopping at row ${i + 1}: no outlet name or reached TOTAL`);
      continue;
    }
    
    console.log(`Processing High Rated outlet: ${outletName} at row ${i + 1}`);
    
    // Map data according to your sheet structure
    const outletData = {
      outlet_code: getCellValue(row, 0, ''), // Column A
      outlet_name: outletName,               // Column D
      start_date: getCellValue(row, 1, ''),  // Column B
      end_date: getCellValue(row, 2, ''),    // Column C
      total_orders: parseHighRatedValue(row[4]),     // Column E
      low_rated: parseHighRatedValue(row[5]),        // Column F
      igcc: parseHighRatedValue(row[6]),             // Column G
      errors: parseHighRatedValue(row[7]),           // Column H
      error_rate: parseHighRatedValue(row[8]),       // Column I
      high_rated: parseHighRatedValue(row[9]),       // Column J
      high_rated_percent: parseHighRatedValue(row[10]), // Column K
      high_minus_error: parseHighRatedValue(row[11]),   // Column L
      incentive: parseHighRatedValue(row[12]),       // Column M
      deduction: parseHighRatedValue(row[13]),       // Column N
      incentives: parseHighRatedValue(row[14]),      // Column O
      per_day: parseHighRatedValue(row[15])          // Column P
    };
    
    processedData.push(outletData);
    
    // Debug log for the first few outlets to verify correct mapping
    if (processedData.length <= 2) {
      console.log(`\n🔍 HIGH RATED FIXED COLUMN MAPPING DEBUG for "${outletName}":`);
      console.log(`  Row: ${i + 1}`);
      console.log(`  Total Orders (Column E): "${row[4]}" -> ${outletData.total_orders}`);
      console.log(`  Error Rate (Column I): "${row[8]}" -> ${outletData.error_rate}`);
      console.log(`  High Rated % (Column K): "${row[10]}" -> ${outletData.high_rated_percent}`);
      console.log(`  Incentives (Column O): "${row[14]}" -> ${outletData.incentives}\n`);
    }
  }
  
  console.log(`✅ Processed ${processedData.length} High Rated outlets for ${requestedPeriod}`);
  
  return processedData;
}

// Helper function to parse High Rated values
function parseHighRatedValue(val) {
  if (!val && val !== 0) return 0;
  const str = val.toString().trim();
  
  // Handle error values
  if (str === '#DIV/0!' || str === '#N/A' || str === '#VALUE!' || str === '') return 0;
  
  // Remove percentage signs, currency symbols, and commas
  const cleanStr = str.replace(/%/g, '').replace(/₹/g, '').replace(/,/g, '').replace(/\(/g, '-').replace(/\)/g, '').trim();
  
  const num = parseFloat(cleanStr);
  return isNaN(num) ? 0 : num;
}

// Debug High Rated endpoint - FIXED
app.get('/api/debug-high-rated', async (req, res) => {
  try {
    if (!sheets) {
      await initializeGoogleSheets();
    }

    const HIGH_RATED_SPREADSHEET_ID = '1FYXr8Wz0ddN3mFi-0AQbI6J_noi2glPbJLh44CEMUnE';
    const HIGH_RATED_SHEET_NAME = 'High Rated Dashboard Live';

    console.log(`🔍 Debug: Fetching raw High Rated data from ${HIGH_RATED_SPREADSHEET_ID}`);

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: HIGH_RATED_SPREADSHEET_ID,
      range: `${HIGH_RATED_SHEET_NAME}!A1:Z50`, // Get first 50 rows for debugging
    });

    const rawData = response.data.values || [];
    console.log(`Debug: Retrieved ${rawData.length} rows`);

    // Check specific rows you mentioned
    const debugInfo = {
      row1: rawData[0] || null,    // 7 days header should be here
      row18: rawData[17] || null,  // 28 days header should be here
      columnD_samples: []
    };

    // Sample column D data from different rows
    for (let i = 1; i <= 12 && i < rawData.length; i++) {
      if (rawData[i] && rawData[i][3]) {
        debugInfo.columnD_samples.push({
          row: i + 1,
          columnD_value: rawData[i][3]
        });
      }
    }

    console.log('Debug: Row structure analysis:', debugInfo);

    res.set('Content-Type', 'application/json');
    res.json({
      success: true,
      spreadsheetId: HIGH_RATED_SPREADSHEET_ID,
      sheetName: HIGH_RATED_SHEET_NAME,
      rawData: rawData.slice(0, 30), // Return first 30 rows
      totalRows: rawData.length,
      debugInfo: debugInfo,
      structure: {
        sevenDaysHeader: "Row 1",
        sevenDaysDataStart: "Row 2 (index 1)",
        sevenDaysDataEnd: "Row 12 (index 11)",
        twentyEightDaysHeader: "Row 18 (index 17)",
        twentyEightDaysDataStart: "Row 19 (index 18)",
        outletNamesColumn: "Column D (index 3)"
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('❌ Error fetching debug High Rated data:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      spreadsheetId: '1FYXr8Wz0ddN3mFi-0AQbI6J_noi2glPbJLh44CEMUnE',
      sheetName: 'High Rated Dashboard Live',
    });
  }
});

// Add these new functions and endpoints to your existing server.js file

// === SWIGGY DASHBOARD SPECIFIC FUNCTIONS ===

// Swiggy-specific data processing function
// Fixed Swiggy-specific data processing function
function processSwiggySheetData(rawData, requestedPeriod = '7 Day') {
  console.log(`Processing Swiggy data for period: ${requestedPeriod}`);
  
  if (!rawData || rawData.length === 0) {
    console.log('No data found in Swiggy sheet');
    return createEmptySwiggyDataStructure();
  }

  let startRow = -1;
  const columnOffset = 2; // Column C (index 2) is where data starts
  
  // Set specific row positions based on period - using your exact specifications
  if (requestedPeriod === '1 Day') {
    // 1 Day: Headers at C9 (row 9), data from C10-C21 (rows 10-21)
    if (rawData.length > 9) {
      console.log('Processing 1 Day data: headers at C9, data from C10-C21');
      startRow = 9; // Row 10 (index 9) - data starts here
    }
  } else if (requestedPeriod === '7 Day') {
    // 7 Day: Headers at C25 (row 25), data from C26-C37 (rows 26-37)  
    if (rawData.length > 25) {
      console.log('Processing 7 Day data: headers at C25, data from C26-C37');
      startRow = 25; // Row 26 (index 25) - data starts here
    }
  }
  
  if (startRow === -1) {
    console.log(`Could not find ${requestedPeriod} section for Swiggy data`);
    return createEmptySwiggyDataStructure();
  }

  const data = {
    outlets: [],
    m2o: [],
    m2oTrend: [],
    newCustomers: [],
    newCustomerTrend: [],
    repeatCustomers: [],
    repeatCustomerTrend: [],
    dormantCustomers: [],
    dormantCustomerTrend: [],
    totalCustomers: [],
    totalCustomerTrend: [],
    kitchenPrepTime: [],
    foodAccuracy: [],
    delayedOrders: [],
    adOrders: [],
    adOrdersTrend: [],
    adSpend: [],
    adM2o: [],
    adM2oTrend: [],
    organicM2o: [],
    organicM2oTrend: [],
    onlinePercent: [],
    period: requestedPeriod,
  };
  
  // Set end row based on period and your specifications
  let endRow;
  if (requestedPeriod === '1 Day') {
    endRow = Math.min(20, rawData.length - 1); // C10-C21 range (rows 10-21)
  } else if (requestedPeriod === '7 Day') {
    endRow = Math.min(36, rawData.length - 1); // C26-C37 range (rows 26-37)
  }
  
  console.log(`Processing Swiggy ${requestedPeriod} Data from row ${startRow + 1} to row ${endRow + 1}`);
  
  // Process each data row within the specified range
  for (let i = startRow; i <= endRow && i < rawData.length; i++) {
    const row = rawData[i];
    
    if (!row || !row[columnOffset]) {
      console.log(`Stopping at row ${i + 1}: empty row or no location data`);
      break;
    }
    
    // Column mapping based on your Swiggy sheet structure
    // Assuming: C=Location, D=M2O, E=M2O Trend, etc.
    const location = row[columnOffset]?.toString().trim(); // Column C - Location
    
    if (!location || location === '' || location.toLowerCase() === 'total') {
      console.log(`Stopping at row ${i + 1}: no location or reached total`);
      break;
    }
    
    console.log(`Processing Swiggy outlet: ${location} at row ${i + 1}`);
    data.outlets.push(location);
    
    // Parse values safely for Swiggy data
    const parseSwiggyValue = (val) => {
      if (!val && val !== 0) return 0;
      const str = val.toString().trim();
      
      // Handle error values
      if (str === '#DIV/0!' || str === '#N/A' || str === '#VALUE!' || str === '' || str === 'No Trend') return 0;
      
      // Remove percentage signs and clean the string
      const cleanStr = str.replace(/%/g, '').replace(/,/g, '').trim();
      
      const num = parseFloat(cleanStr);
      return isNaN(num) ? 0 : num;
    };
    
    // FIXED COLUMN MAPPING - corrected the last two columns
    data.m2o.push(parseSwiggyValue(row[columnOffset + 1]));              // Column D - M2O
    data.m2oTrend.push(parseSwiggyValue(row[columnOffset + 2]));         // Column E - M2O Trend  
    data.newCustomers.push(parseSwiggyValue(row[columnOffset + 3]));     // Column F - New Customer %
    data.newCustomerTrend.push(parseSwiggyValue(row[columnOffset + 4])); // Column G - New Customer Trend
    data.repeatCustomers.push(parseSwiggyValue(row[columnOffset + 5])); // Column H - Repeat Customer %
    data.repeatCustomerTrend.push(parseSwiggyValue(row[columnOffset + 6])); // Column I - Repeat Customer Trend
    data.dormantCustomers.push(parseSwiggyValue(row[columnOffset + 7])); // Column J - Dormant Customer %
    data.dormantCustomerTrend.push(parseSwiggyValue(row[columnOffset + 8])); // Column K - Dormant Customer Trend
    data.totalCustomers.push(parseSwiggyValue(row[columnOffset + 9]));   // Column L - Total Customers
    data.totalCustomerTrend.push(parseSwiggyValue(row[columnOffset + 10])); // Column M - Total Customer Trend
    data.kitchenPrepTime.push(parseSwiggyValue(row[columnOffset + 11])); // Column N - Kitchen Prep Time
    data.foodAccuracy.push(parseSwiggyValue(row[columnOffset + 12]));    // Column O - Food Accuracy
    data.delayedOrders.push(parseSwiggyValue(row[columnOffset + 13]));   // Column P - Delayed Orders
    data.adOrders.push(parseSwiggyValue(row[columnOffset + 14]));        // Column Q - % of Ad Orders
    data.adOrdersTrend.push(parseSwiggyValue(row[columnOffset + 15]));   // Column R - Ad Orders Trend
    data.adSpend.push(parseSwiggyValue(row[columnOffset + 16]));         // Column S - Ad Spend
    data.adM2o.push(parseSwiggyValue(row[columnOffset + 17]));           // Column T - Ad M2O
    data.adM2oTrend.push(parseSwiggyValue(row[columnOffset + 18]));      // Column U - Ad M2O Trend
    data.organicM2o.push(parseSwiggyValue(row[columnOffset + 19]));      // Column V - Organic M2O
    data.organicM2oTrend.push(parseSwiggyValue(row[columnOffset + 21])); // Column X - Organic M2O Trend (FIXED)
    data.onlinePercent.push(parseSwiggyValue(row[columnOffset + 23]));   // Column Z - Online % (FIXED)
    
    // Debug log for first few outlets
    if (data.outlets.length <= 2) {
      console.log(`\n🔍 SWIGGY COLUMN MAPPING DEBUG (FIXED) for "${location}":`);
      console.log(`  M2O (Column D): "${row[columnOffset + 1]}" -> ${parseSwiggyValue(row[columnOffset + 1])}`);
      console.log(`  Organic M2O Trend (Column X): "${row[columnOffset + 21]}" -> ${parseSwiggyValue(row[columnOffset + 21])}`);
      console.log(`  Online % (Column Z): "${row[columnOffset + 23]}" -> ${parseSwiggyValue(row[columnOffset + 23])}`);
      console.log(`  Food Accuracy (Column O): "${row[columnOffset + 12]}" -> ${parseSwiggyValue(row[columnOffset + 12])}`);
      console.log(`  Kitchen Prep Time (Column N): "${row[columnOffset + 11]}" -> ${parseSwiggyValue(row[columnOffset + 11])}\n`);
    }
  }
  
  // Calculate summary statistics
  data.summary = {
    avgM2O: data.m2o.length > 0 ? (data.m2o.reduce((a, b) => a + b, 0) / data.m2o.length).toFixed(2) : '0',
    avgOnlinePercent: data.onlinePercent.length > 0 ? (data.onlinePercent.reduce((a, b) => a + b, 0) / data.onlinePercent.length).toFixed(2) : '0',
    avgFoodAccuracy: data.foodAccuracy.length > 0 ? (data.foodAccuracy.reduce((a, b) => a + b, 0) / data.foodAccuracy.length).toFixed(2) : '0',
    avgKitchenPrepTime: data.kitchenPrepTime.length > 0 ? (data.kitchenPrepTime.reduce((a, b) => a + b, 0) / data.kitchenPrepTime.length).toFixed(2) : '0',
    totalOutlets: data.outlets.length,
  };
  
  console.log(`✅ Processed ${data.outlets.length} Swiggy outlets for ${requestedPeriod}`);
  console.log('Swiggy Summary:', data.summary);
  
  return data;
}
// Helper function to create empty Swiggy data structure
function createEmptySwiggyDataStructure() {
  return {
    outlets: [],
    m2o: [],
    m2oTrend: [],
    newCustomers: [],
    newCustomerTrend: [],
    repeatCustomers: [],
    repeatCustomerTrend: [],
    dormantCustomers: [],
    dormantCustomerTrend: [],
    totalCustomers: [],
    totalCustomerTrend: [],
    kitchenPrepTime: [],
    foodAccuracy: [],
    delayedOrders: [],
    adOrders: [],
    adOrdersTrend: [],
    adSpend: [],
    adM2o: [],
    adM2oTrend: [],
    organicM2o: [],
    organicM2oTrend: [],
    onlinePercent: [],
    summary: {
      avgM2O: '0',
      avgOnlinePercent: '0',
      avgFoodAccuracy: '0',
      avgKitchenPrepTime: '0',
      totalOutlets: 0,
    },
  };
}

// Swiggy-specific AI insights generation
async function generateSwiggyInsightsWithGemini(data, period) {
  if (!GEMINI_API_KEY) {
    return generateSwiggyFallbackInsights(data, period);
  }

  try {
    console.log(`🤖 Generating Swiggy AI insights for ${period} data with ${data.outlets.length} outlets`);
    
    // Find bottom 3 performers
    const outletPerformance = data.outlets.map((outlet, i) => ({
      name: outlet,
      m2o: data.m2o[i],
      onlinePercent: data.onlinePercent[i],
      foodAccuracy: data.foodAccuracy[i],
      kitchenPrepTime: data.kitchenPrepTime[i]
    })).sort((a, b) => a.m2o - b.m2o);

    const bottomThree = outletPerformance.slice(0, 3);
    const flaggedOutlets = outletPerformance.filter(outlet => 
      outlet.onlinePercent < 98 || 
      outlet.foodAccuracy < 85 || 
      outlet.kitchenPrepTime > 4
    );

    const prompt = `You are analyzing Swiggy restaurant performance data. Focus on identifying critical issues and bottom performers.

PERFORMANCE DATA (${period}):
- Total Outlets: ${data.outlets.length}
- Average M2O: ${data.summary.avgM2O}%
- Average Online Presence: ${data.summary.avgOnlinePercent}%
- Average Food Accuracy: ${data.summary.avgFoodAccuracy}%
- Average Kitchen Prep Time: ${data.summary.avgKitchenPrepTime} minutes

BOTTOM 3 PERFORMERS:
${bottomThree.map(o => `${o.name}: M2O ${o.m2o.toFixed(2)}%, Online ${o.onlinePercent.toFixed(1)}%, Accuracy ${o.foodAccuracy.toFixed(1)}%, Prep Time ${o.kitchenPrepTime.toFixed(1)}min`).join('\n')}

CRITICAL THRESHOLDS VIOLATED:
- Online Presence < 98%: ${outletPerformance.filter(o => o.onlinePercent < 98).length} outlets
- Food Accuracy < 85%: ${outletPerformance.filter(o => o.foodAccuracy < 85).length} outlets  
- Kitchen Prep Time > 4min: ${outletPerformance.filter(o => o.kitchenPrepTime > 4).length} outlets

Provide a JSON response focusing on immediate actions needed for bottom performers and critical threshold violations:
{
  "keyFindings": ["3-4 critical insights about bottom performers and threshold violations"],
  "recommendations": ["3-4 urgent interventions needed"],
  "bottomThreeAnalysis": ["Specific issues with bottom 3 outlets"],
  "flaggedOutlets": ["Details about outlets violating critical thresholds"]
}`;

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.3,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 800,
        }
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 30000
      }
    );

    if (response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
      const aiResponse = response.data.candidates[0].content.parts[0].text;
      
      try {
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const insights = JSON.parse(jsonMatch[0]);
          return {
            ...insights,
            bottomThreeOutlets: bottomThree,
            flaggedOutlets: flaggedOutlets,
            confidence: 0.85,
            generatedAt: new Date().toISOString()
          };
        }
      } catch (parseError) {
        console.log('JSON parsing failed for Swiggy insights, using fallback');
      }
    }

    throw new Error('No valid AI response');

  } catch (error) {
    console.error('Swiggy AI insight generation error:', error.message);
    return generateSwiggyFallbackInsights(data, period);
  }
}

// Fallback insights for Swiggy data
function generateSwiggyFallbackInsights(data, period) {
  const avgM2O = parseFloat(data.summary.avgM2O);
  const avgAccuracy = parseFloat(data.summary.avgFoodAccuracy);
  const avgOnline = parseFloat(data.summary.avgOnlinePercent);
  const avgPrepTime = parseFloat(data.summary.avgKitchenPrepTime);
  
  // Find bottom performers and flagged outlets
  const outletPerformance = data.outlets.map((outlet, i) => ({
    name: outlet,
    m2o: data.m2o[i],
    onlinePercent: data.onlinePercent[i],
    foodAccuracy: data.foodAccuracy[i],
    kitchenPrepTime: data.kitchenPrepTime[i]
  })).sort((a, b) => a.m2o - b.m2o);

  const bottomThree = outletPerformance.slice(0, 3);
  const flaggedOutlets = outletPerformance.filter(outlet => 
    outlet.onlinePercent < 98 || 
    outlet.foodAccuracy < 85 || 
    outlet.kitchenPrepTime > 4
  );

  return {
    keyFindings: [
      `Bottom 3 performers: ${bottomThree.map(o => o.name).join(', ')} require immediate intervention`,
      `${flaggedOutlets.length} outlets flagged for critical threshold violations`,
      `Average M2O of ${avgM2O.toFixed(2)}% is ${avgM2O > 20 ? 'excellent' : avgM2O > 15 ? 'good' : 'below target'}`,
      `${outletPerformance.filter(o => o.onlinePercent < 98).length} outlets below 98% online presence threshold`
    ],
    recommendations: [
      'Immediate intervention required for bottom 3 M2O performers',
      avgAccuracy < 85 ? 'Critical: Implement emergency food quality protocols' : 'Maintain food quality standards above 85%',
      avgPrepTime > 4 ? 'Urgent: Optimize kitchen workflows to reduce prep time' : 'Monitor kitchen efficiency',
      'Enhanced online presence strategy for outlets below 98%'
    ],
    bottomThreeAnalysis: [
      `${bottomThree[0].name}: Lowest performer with ${bottomThree[0].m2o.toFixed(2)}% M2O`,
      `${bottomThree[1].name}: Second lowest at ${bottomThree[1].m2o.toFixed(2)}% M2O`,
      `${bottomThree[2].name}: Third lowest at ${bottomThree[2].m2o.toFixed(2)}% M2O`
    ],
    flaggedOutlets: flaggedOutlets.map(outlet => 
      `${outlet.name}: ${outlet.onlinePercent < 98 ? 'Online Low' : ''} ${outlet.foodAccuracy < 85 ? 'Accuracy Critical' : ''} ${outlet.kitchenPrepTime > 4 ? 'Kitchen Slow' : ''}`.trim()
    ),
    bottomThreeOutlets: bottomThree,
    confidence: 0.75,
    generatedAt: new Date().toISOString(),
    source: 'fallback-analysis'
  };
}

// === SWIGGY DASHBOARD API ENDPOINTS ===

// Swiggy dashboard data endpoint
app.get('/api/swiggy-dashboard-data', async (req, res) => {
  try {
    const period = req.query.period || '7 Day';
    console.log(`📊 Swiggy dashboard data requested for period: ${period}`);
    
    // Only allow 1 Day and 7 Day for Swiggy dashboard
    if (!['7 Day', '1 Day'].includes(period)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid period for Swiggy dashboard. Must be one of: 7 Day, 1 Day',
      });
    }

    if (!sheets) {
      const initialized = await initializeGoogleSheets();
      if (!initialized) {
        throw new Error('Failed to initialize Google Sheets');
      }
    }

    const SWIGGY_SPREADSHEET_ID = '1XmKondedSs_c6PZflanfB8OFUsGxVoqi5pUPvscT8cs';
    const SWIGGY_SHEET_NAME = 'Swiggy Dashboard - AOD'; // Adjust sheet name as needed

    console.log(`Fetching Swiggy data for ${period} from: ${SWIGGY_SPREADSHEET_ID}`);
    console.log(`Sheet: ${SWIGGY_SHEET_NAME}, Range: A1:Z50`);
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SWIGGY_SPREADSHEET_ID,
      range: `${SWIGGY_SHEET_NAME}!A1:Z50`, // Adjust range as needed
    });
    
    console.log(`Retrieved ${response.data.values ? response.data.values.length : 0} rows from Swiggy sheet`);
    
    const processedData = processSwiggySheetData(response.data.values, period);
    
    console.log(`✅ Successfully processed Swiggy data for ${period}:`, {
      outlets: processedData.outlets.length,
      avgM2O: processedData.summary.avgM2O,
      avgOnlinePercent: processedData.summary.avgOnlinePercent
    });
    
    res.set('Content-Type', 'application/json');
    res.json({
      success: true,
      data: processedData,
      aiEnabled: !!GEMINI_API_KEY,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('❌ Error fetching Swiggy dashboard data:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.data || 'No additional details',
    });
  }
});

// Swiggy-specific AI insights endpoint
app.post('/api/swiggy-generate-insights', async (req, res) => {
  try {
    const { data, period, analysisType } = req.body;
    
    console.log(`Generating Swiggy AI insights for ${period} data with ${data.outlets.length} outlets`);
    
    const insights = await generateSwiggyInsightsWithGemini(data, period, analysisType);
    
    res.set('Content-Type', 'application/json');
    res.json({
      success: true,
      insights,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error generating Swiggy insights:', error.message);
    res.set('Content-Type', 'application/json');
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Swiggy outlet analysis endpoint
app.post('/api/swiggy-analyze-outlet', async (req, res) => {
  try {
    const { outlet, period, allData } = req.body;
    
    console.log(`Analyzing Swiggy outlet: ${outlet.name} for ${period}`);
    
    // Use existing analyzeOutletWithGemini function but with Swiggy context
    const analysis = await analyzeSwiggyOutletWithGemini(outlet, period, allData);
    
    res.set('Content-Type', 'application/json');
    res.json({
      success: true,
      analysis,
      outlet: outlet.name,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error analyzing Swiggy outlet:', error.message);
    res.set('Content-Type', 'application/json');
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Swiggy outlet-specific analysis function
async function analyzeSwiggyOutletWithGemini(outlet, period, allData) {
  if (!GEMINI_API_KEY) {
    return generateSwiggyOutletFallbackAnalysis(outlet, allData);
  }

  try {
    const prompt = `Analyze this Swiggy restaurant outlet performance for ${period}:

OUTLET: ${outlet.name}
METRICS:
- M2O: ${outlet.m2o.toFixed(2)}% (Trend: ${outlet.m2oTrend > 0 ? '+' : ''}${outlet.m2oTrend.toFixed(2)}%)
- Online Presence: ${outlet.onlinePercent.toFixed(2)}%
- Food Accuracy: ${outlet.foodAccuracy.toFixed(2)}%
- Kitchen Prep Time: ${outlet.kitchenPrepTime.toFixed(1)} minutes
- Delayed Orders: ${outlet.delayedOrders.toFixed(2)}%
- New Customers: ${outlet.newCustomers.toFixed(2)}%
- Repeat Customers: ${outlet.repeatCustomers.toFixed(2)}%
- Dormant Customers: ${outlet.dormantCustomers.toFixed(2)}%

SWIGGY CRITICAL THRESHOLDS:
- M2O benchmark: 20%+
- Online presence: 98%+
- Food accuracy: 85%+
- Kitchen prep time: <4 minutes

CONTEXT:
- Average M2O across all outlets: ${allData.summary.avgM2O}%
- Average online presence: ${allData.summary.avgOnlinePercent}%

Provide a concise 2-3 sentence analysis focusing on:
1. Critical threshold violations (if any)
2. Immediate actions needed
3. Performance relative to other outlets`;

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 200
        }
      },
      { timeout: 15000 }
    );

    if (response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
      return response.data.candidates[0].content.parts[0].text.trim();
    }

    throw new Error('No AI response');

  } catch (error) {
    console.error('Swiggy outlet AI analysis error:', error.message);
    return generateSwiggyOutletFallbackAnalysis(outlet, allData);
  }
}

// Fallback analysis for Swiggy outlet
function generateSwiggyOutletFallbackAnalysis(outlet, allData) {
  const criticalIssues = [];
  
  if (outlet.onlinePercent < 98) criticalIssues.push('online presence below 98%');
  if (outlet.foodAccuracy < 85) criticalIssues.push('food accuracy below 85%');
  if (outlet.kitchenPrepTime > 4) criticalIssues.push('kitchen prep time over 4 minutes');
  
  const performance = outlet.m2o > 20 ? 'excellent' : outlet.m2o > 15 ? 'good' : outlet.m2o > 10 ? 'average' : 'critical';
  const trend = outlet.m2oTrend > 0 ? 'improving' : 'declining';
  
  let analysis = `${outlet.name} shows ${performance} performance with ${outlet.m2o.toFixed(2)}% M2O and ${trend} trend.`;
  
  if (criticalIssues.length > 0) {
    analysis += ` CRITICAL ISSUES: ${criticalIssues.join(', ')}. Immediate intervention required.`;
  } else if (outlet.m2o < 15) {
    analysis += ' Focus needed on customer satisfaction and operational efficiency.';
  } else {
    analysis += ' Maintain current strategies while monitoring key metrics.';
  }
  
  return analysis;
}

// Debug Swiggy endpoint
app.get('/api/debug-swiggy', async (req, res) => {
  try {
    if (!sheets) {
      await initializeGoogleSheets();
    }

    const SWIGGY_SPREADSHEET_ID = '1XmKondedSs_c6PZflanfB8OFUsGxVoqi5pUPvscT8cs';
    const SWIGGY_SHEET_NAME = 'Swiggy Dashboard - AOD';

    console.log(`🔍 Debug: Fetching raw Swiggy data from ${SWIGGY_SPREADSHEET_ID}`);

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SWIGGY_SPREADSHEET_ID,
      range: `${SWIGGY_SHEET_NAME}!A1:Z50`,
    });

    const rawData = response.data.values || [];
    console.log(`Debug: Retrieved ${rawData.length} rows from Swiggy sheet`);

    res.set('Content-Type', 'application/json');
    res.json({
      success: true,
      spreadsheetId: SWIGGY_SPREADSHEET_ID,
      sheetName: SWIGGY_SHEET_NAME,
      rawData: rawData.slice(0, 30),
      totalRows: rawData.length,
      structure: {
        oneDayHeaders: "Row 9 (C9)",
        oneDayDataRange: "Rows 10-21 (C10:C21)",
        sevenDayHeaders: "Row 25 (C25)", 
        sevenDayDataRange: "Rows 26-37 (C26:C37)",
        dataStartsAtColumn: "C (index 2)"
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('❌ Error fetching debug Swiggy data:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      spreadsheetId: '1XmKondedSs_c6PZflanfB8OFUsGxVoqi5pUPvscT8cs',
      sheetName: 'Swiggy Dashboard - AOD',
    });
  }
});

// Update the health check endpoint to include Swiggy endpoints
// Add this to your existing /health endpoint response in the endpoints section:
/*
swiggy: {
  data: '/api/swiggy-dashboard-data?period=[7 Day|1 Day]',
  insights: '/api/swiggy-generate-insights (POST)',
  outletAnalysis: '/api/swiggy-analyze-outlet (POST)',
  debug: '/api/debug-swiggy',
  description: 'Swiggy-specific dashboard with bottom 3 outlet focus and critical threshold monitoring'
}
*/

// Add this to your existing backend code (server.js)

// Employee Dashboard data endpoint
// Employee Dashboard data endpoint with intelligent mapping
app.get('/api/employee-data', async (req, res) => {
  try {
    const period = req.query.period || '7 Days';
    console.log(`👥 Employee data requested for period: ${period}`);

    if (!['7 Days', '28 Days'].includes(period)) {
      res.set('Content-Type', 'application/json');
      return res.status(400).json({
        success: false,
        error: 'Invalid period. Must be one of: 7 Days, 28 Days',
      });
    }

    if (!sheets) {
      const initialized = await initializeGoogleSheets();
      if (!initialized) {
        res.set('Content-Type', 'application/json');
        return res.status(500).json({
          success: false,
          error: 'Failed to initialize Google Sheets',
        });
      }
    }

    const EMPLOYEE_SPREADSHEET_ID = '1FYXr8Wz0ddN3mFi-0AQbI6J_noi2glPbJLh44CEMUnE';
    const EMPLOYEE_SHEET_NAME = 'EmployeeDashboard';

    console.log(`Fetching Employee data for ${period} from: ${EMPLOYEE_SPREADSHEET_ID}`);

    const sheetResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: EMPLOYEE_SPREADSHEET_ID,
      range: `${EMPLOYEE_SHEET_NAME}!A:Z`,
    });

    console.log(`Retrieved ${sheetResponse.data.values ? sheetResponse.data.values.length : 0} rows from Google Sheets`);

    // Process employee data with intelligent mapping
    const processedData = await processEmployeeSheetData(sheetResponse.data.values, period);

    console.log(`✅ Successfully processed Employee data for ${period}:`, {
      employees: processedData.length,
      sample: processedData[0] || {},
      usingAI: !!GEMINI_API_KEY
    });

    res.set('Content-Type', 'application/json');
    res.json({
      success: true,
      data: processedData,
      metadata: {
        spreadsheetId: EMPLOYEE_SPREADSHEET_ID,
        sheetName: EMPLOYEE_SHEET_NAME,
        period: period,
        rowCount: sheetResponse.data.values ? sheetResponse.data.values.length : 0,
        intelligentMapping: !!GEMINI_API_KEY
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('❌ Error fetching Employee data:', error.message);
    res.set('Content-Type', 'application/json');
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.data || 'No additional details',
    });
  }
});


// === INTELLIGENT EMPLOYEE DATA MAPPING WITH GEMINI ===
async function mapEmployeeDataWithGemini(headers, sampleRows) {
  if (!GEMINI_API_KEY) {
    console.warn('Gemini API key not configured for employee mapping');
    return null;
  }

  try {
    const prompt = `You are analyzing an employee performance dashboard spreadsheet. Identify the correct column mapping.

Expected columns in the data:
- Employee Name (text)
- Type (text - values like "counter", "kitchen", etc.)
- High Rated orders for 7 days (number)
- High Rated orders for 28 days (number)
- Low Rated orders for 7 days (number)
- Low Rated orders for 28 days (number)
- Total Orders for 7 days (number)
- Total Orders for 28 days (number)
- High Rated % for 7 days (percentage)
- High Rated % for 28 days (percentage)
- Low Rated % for 7 days (percentage)
- Low Rated % for 28 days (percentage)
- IGCC for 7 days (number)
- IGCC for 28 days (number)

Headers found in spreadsheet:
${JSON.stringify(headers)}

Sample data rows:
${JSON.stringify(sampleRows)}

Analyze the headers and sample data to determine the correct column index for each field.
The Type column should contain values like "counter", "kitchen", etc.

Return ONLY a JSON object mapping field names to column indices, like:
{
  "employee_name": 0,
  "type": 1,
  "high_rated_7_days": 2,
  "high_rated_28_days": 3,
  "low_rated_7_days": 4,
  "low_rated_28_days": 5,
  "total_orders_7_days": 6,
  "total_orders_28_days": 7,
  "high_rated_percent_7_days": 8,
  "high_rated_percent_28_days": 9,
  "low_rated_percent_7_days": 10,
  "low_rated_percent_28_days": 11,
  "igcc_7_days": 12,
  "igcc_28_days": 13
}`;

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.1,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 500,
        }
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 15000
      }
    );

    if (response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
      const aiResponse = response.data.candidates[0].content.parts[0].text;
      console.log('Gemini column mapping response received');
      
      try {
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const mapping = JSON.parse(jsonMatch[0]);
          console.log('✅ Employee column mapping generated:', mapping);
          return mapping;
        }
      } catch (parseError) {
        console.error('Failed to parse Gemini mapping response:', parseError);
      }
    }

  } catch (error) {
    console.error('Gemini employee mapping error:', error.message);
  }

  return null;
}
// Employee data processing function with intelligent mapping
// Employee data processing function with intelligent mapping, filtering, and sorting
async function processEmployeeSheetData(rawData, requestedPeriod = '7 Days') {
  console.log(`Processing Employee data for period: ${requestedPeriod}`);
  
  if (!rawData || rawData.length === 0) {
    console.log('No data found in Employee sheet');
    return [];
  }

  // Find the header row
  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(rawData.length, 10); i++) {
    const row = rawData[i];
    if (row && row[0] && row[0].toString().toLowerCase().includes('employee')) {
      headerRowIndex = i;
      console.log(`Found header row at index ${i}`);
      break;
    }
  }

  if (headerRowIndex === -1) {
    console.log('Could not find header row in Employee sheet');
    return [];
  }

  const headers = rawData[headerRowIndex];
  console.log('Employee headers:', headers);

  // Get sample data rows for intelligent mapping
  const sampleRows = [];
  for (let i = headerRowIndex + 1; i < Math.min(headerRowIndex + 4, rawData.length); i++) {
    if (rawData[i] && rawData[i][0]) {
      sampleRows.push(rawData[i]);
    }
  }

  // Try to get intelligent mapping from Gemini
  let columnMapping = await mapEmployeeDataWithGemini(headers, sampleRows);
  
  // Fallback to default mapping if Gemini fails
  if (!columnMapping) {
    console.log('Using default column mapping');
    // Try to find Type column index
    let typeIndex = headers.findIndex(h => h && h.toString().toLowerCase().includes('type'));
    if (typeIndex === -1) typeIndex = 1; // Default to column 1
    
    columnMapping = {
      employee_name: 0,
      type: typeIndex,
      high_rated_7_days: 2,
      high_rated_28_days: 3,
      low_rated_7_days: 4,
      low_rated_28_days: 5,
      total_orders_7_days: 6,
      total_orders_28_days: 7,
      high_rated_percent_7_days: 8,
      high_rated_percent_28_days: 9,
      low_rated_percent_7_days: 10,
      low_rated_percent_28_days: 11,
      igcc_7_days: 12,
      igcc_28_days: 13
    };
  }

  const processedData = [];
  
  // Process each data row after headers
  for (let i = headerRowIndex + 1; i < rawData.length; i++) {
    const row = rawData[i];
    
    if (!row || !row[columnMapping.employee_name] || row[columnMapping.employee_name].toString().trim() === '') {
      continue; // Skip empty rows
    }
    
    const employeeName = getCellValue(row, columnMapping.employee_name, '').trim();
    
    // Skip if employee name is empty or is "overall"
    if (!employeeName || employeeName.toLowerCase() === 'overall' || employeeName.toLowerCase() === 'total') {
      console.log(`Skipping row ${i + 1}: ${employeeName || 'empty'}`);
      continue;
    }
    
    // Get the type value
    const employeeType = getCellValue(row, columnMapping.type, '').trim().toLowerCase();
    
    // Only include employees with type = "counter"
    if (employeeType !== 'counter') {
      console.log(`Skipping employee ${employeeName}: Type is "${employeeType}", not "counter"`);
      continue;
    }
    
    console.log(`Processing counter employee: ${employeeName} at row ${i + 1}`);
    
    // Map data using the intelligent column mapping
    const employeeData = {
      employee_name: employeeName,
      type: employeeType,
      high_rated_7_days: parseEmployeeValue(row[columnMapping.high_rated_7_days]),
      high_rated_28_days: parseEmployeeValue(row[columnMapping.high_rated_28_days]),
      low_rated_7_days: parseEmployeeValue(row[columnMapping.low_rated_7_days]),
      low_rated_28_days: parseEmployeeValue(row[columnMapping.low_rated_28_days]),
      total_orders_7_days: parseEmployeeValue(row[columnMapping.total_orders_7_days]),
      total_orders_28_days: parseEmployeeValue(row[columnMapping.total_orders_28_days]),
      high_rated_percent_7_days: parseEmployeeValue(row[columnMapping.high_rated_percent_7_days]),
      high_rated_percent_28_days: parseEmployeeValue(row[columnMapping.high_rated_percent_28_days]),
      low_rated_percent_7_days: parseEmployeeValue(row[columnMapping.low_rated_percent_7_days]),
      low_rated_percent_28_days: parseEmployeeValue(row[columnMapping.low_rated_percent_28_days]),
      igcc_7_days: parseEmployeeValue(row[columnMapping.igcc_7_days]),
      igcc_28_days: parseEmployeeValue(row[columnMapping.igcc_28_days])
    };
    
    // Calculate additional metrics
    const totalOrders = requestedPeriod === '7 Days' ? employeeData.total_orders_7_days : employeeData.total_orders_28_days;
    const highRated = requestedPeriod === '7 Days' ? employeeData.high_rated_7_days : employeeData.high_rated_28_days;
    const lowRated = requestedPeriod === '7 Days' ? employeeData.low_rated_7_days : employeeData.low_rated_28_days;
    const highRatedPercent = requestedPeriod === '7 Days' ? employeeData.high_rated_percent_7_days : employeeData.high_rated_percent_28_days;
    const lowRatedPercent = requestedPeriod === '7 Days' ? employeeData.low_rated_percent_7_days : employeeData.low_rated_percent_28_days;
    const igcc = requestedPeriod === '7 Days' ? employeeData.igcc_7_days : employeeData.igcc_28_days;

    // Add current period data for easier access
    employeeData.current_period = {
      total_orders: totalOrders,
      high_rated: highRated,
      low_rated: lowRated,
      high_rated_percent: highRatedPercent,
      low_rated_percent: lowRatedPercent,
      igcc: igcc,
      performance_score: totalOrders > 0 ? (highRatedPercent - lowRatedPercent) : 0
    };
    
    processedData.push(employeeData);
  }
  
  // Sort by high_rated_percent in descending order
  const sortField = requestedPeriod === '7 Days' ? 'high_rated_percent_7_days' : 'high_rated_percent_28_days';
  processedData.sort((a, b) => b[sortField] - a[sortField]);
  
  console.log(`✅ Processed ${processedData.length} counter employees for ${requestedPeriod}, sorted by ${sortField} (descending)`);
  
  return processedData;
}

// Helper function to parse employee values
function parseEmployeeValue(val) {
  if (!val && val !== 0) return 0;
  const str = val.toString().trim();
  
  // Handle error values
  if (str === '#DIV/0!' || str === '#N/A' || str === '#VALUE!' || str === '') return 0;
  
  // Remove percentage signs and clean the string
  const cleanStr = str.replace(/%/g, '').replace(/,/g, '').trim();
  
  const num = parseFloat(cleanStr);
  return isNaN(num) ? 0 : num;
}

// Debug Employee endpoint
app.get('/api/debug-employee', async (req, res) => {
  try {
    if (!sheets) {
      await initializeGoogleSheets();
    }

    const EMPLOYEE_SPREADSHEET_ID = '1FYXr8Wz0ddN3mFi-0AQbI6J_noi2glPbJLh44CEMUnE';
    const EMPLOYEE_SHEET_NAME = 'EmployeeDashboard';

    console.log(`🔍 Debug: Fetching raw Employee data from ${EMPLOYEE_SPREADSHEET_ID}`);

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: EMPLOYEE_SPREADSHEET_ID,
      range: `${EMPLOYEE_SHEET_NAME}!A1:Z50`,
    });

    const rawData = response.data.values || [];
    console.log(`Debug: Retrieved ${rawData.length} rows`);

    res.set('Content-Type', 'application/json');
    res.json({
      success: true,
      spreadsheetId: EMPLOYEE_SPREADSHEET_ID,
      sheetName: EMPLOYEE_SHEET_NAME,
      rawData: rawData.slice(0, 20),
      totalRows: rawData.length,
      firstRow: rawData[0] || null,
      headers: rawData.find(row => row && row[0] && row[0].toString().toLowerCase().includes('employee')) || null,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('❌ Error fetching debug Employee data:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      spreadsheetId: '1FYXr8Wz0ddN3mFi-0AQbI6J_noi2glPbJLh44CEMUnE',
      sheetName: 'EmployeeDashboard',
    });
  }
});
// Add these new endpoints to your existing server.js file

// Checklist completion status endpoint
app.get('/api/checklist-completion-status', async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0]; // Default to today
    console.log(`📊 Fetching checklist completion status for date: ${date}`);

    if (!sheets) {
      const initialized = await initializeGoogleSheets();
      if (!initialized) {
        throw new Error('Failed to initialize Google APIs');
      }
    }

    const CHECKLIST_SPREADSHEET_ID = '1FYXr8Wz0ddN3mFi-0AQbI6J_noi2glPbJLh44CEMUnE';

    // Fetch all required tabs
    console.log('Fetching ChecklistQuestions tab...');
    const questionsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: CHECKLIST_SPREADSHEET_ID,
      range: 'ChecklistQuestions!A:Z',
    });

    console.log('Fetching ChecklistSubmissions tab...');
    const submissionsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: CHECKLIST_SPREADSHEET_ID,
      range: 'ChecklistSubmissions!A:Z',
    });

    console.log('Fetching Outlet master data tab...');
    // Try common outlet tab names
    let outletResponse;
    const possibleOutletTabs = ['Outlets', 'Outlet', 'OutletMaster', 'Outlet Master', 'OutletData'];
    
    for (const tabName of possibleOutletTabs) {
      try {
        outletResponse = await sheets.spreadsheets.values.get({
          spreadsheetId: CHECKLIST_SPREADSHEET_ID,
          range: `${tabName}!A:Z`,
        });
        console.log(`✅ Found outlet data in tab: ${tabName}`);
        break;
      } catch (error) {
        console.log(`Tab "${tabName}" not found, trying next...`);
      }
    }

    if (!outletResponse) {
      console.warn('⚠️ Could not find outlet master data tab, using submissions data only');
    }

    const questionsData = questionsResponse.data.values || [];
    const submissionsData = submissionsResponse.data.values || [];
    const outletData = outletResponse ? outletResponse.data.values || [] : [];

    console.log(`Found ${questionsData.length} question rows, ${submissionsData.length} submission rows, ${outletData.length} outlet rows`);

    // Process the data
    const completionStatus = processChecklistCompletionData(
      questionsData, 
      submissionsData, 
      outletData, 
      date
    );

    console.log(`✅ Processed completion status for ${completionStatus.length} outlets`);

    res.set('Content-Type', 'application/json');
    res.json({
      success: true,
      data: completionStatus,
      metadata: {
        spreadsheetId: CHECKLIST_SPREADSHEET_ID,
        date: date,
        totalOutlets: completionStatus.length,
        completedOutlets: completionStatus.filter(o => o.overallStatus === 'Completed').length,
        partialOutlets: completionStatus.filter(o => o.overallStatus === 'Partial').length,
        pendingOutlets: completionStatus.filter(o => o.overallStatus === 'Pending').length,
      },
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('❌ Error fetching checklist completion status:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Function to process checklist completion data
function processChecklistCompletionData(questionsData, submissionsData, outletData, filterDate) {
  console.log(`Processing checklist completion data for date: ${filterDate}`);
  
  // WHITELIST: Only these outlet codes are allowed
  const ALLOWED_OUTLET_CODES = ['RR', 'KOR', 'JAY', 'SKN', 'RAJ', 'KLN', 'BLN', 'WF', 'HSR', 'ARK', 'IND', 'CK'];

  // Extract outlets from master data or submissions
  const allOutlets = extractOutletList(outletData, submissionsData);
  
  // Filter to only whitelisted outlets
  const outlets = allOutlets.filter(outlet => {
    if (!outlet.code || !outlet.code.trim()) return false;
    const outletCode = outlet.code.trim().toUpperCase();
    return ALLOWED_OUTLET_CODES.includes(outletCode);
  });
  
  console.log(`Found ${outlets.length} whitelisted outlets out of ${allOutlets.length} total`);
  console.log(`Whitelisted outlets: ${outlets.map(o => o.code).join(', ')}`);

  // Rest of the function remains the same...
  const timeSlots = extractTimeSlots(questionsData);
  console.log(`Time slots: ${timeSlots.join(', ')}`);

  const submissionsForDate = filterSubmissionsByDate(submissionsData, filterDate);
  console.log(`Found ${submissionsForDate.length} submissions for ${filterDate}`);

  // Build completion status for each outlet
  const completionStatus = outlets.map(outlet => {
    const outletSubmissions = submissionsForDate.filter(sub => {
      if (!sub.outlet) return false;
      const submissionOutlet = sub.outlet.toLowerCase().trim();
      const outletCode = (outlet.code || '').toLowerCase().trim();
      const outletName = (outlet.name || '').toLowerCase().trim();
      
      return submissionOutlet === outletCode || submissionOutlet === outletName;
    });

    const timeSlotStatus = timeSlots.map(timeSlot => {
      const slotSubmission = outletSubmissions.find(sub => 
        sub.timeSlot && sub.timeSlot.toLowerCase().includes(timeSlot.toLowerCase())
      );

      return {
        timeSlot: timeSlot,
        status: slotSubmission ? 'Completed' : 'Pending',
        submissionId: slotSubmission ? slotSubmission.submissionId : null,
        submittedBy: slotSubmission ? slotSubmission.submittedBy : null,
        timestamp: slotSubmission ? slotSubmission.timestamp : null
      };
    });

    const completedSlots = timeSlotStatus.filter(ts => ts.status === 'Completed').length;
    const totalSlots = timeSlotStatus.length;

    let overallStatus = 'Pending';
    if (completedSlots === totalSlots) {
      overallStatus = 'Completed';
    } else if (completedSlots > 0) {
      overallStatus = 'Partial';
    }

    return {
      outletCode: outlet.code,
      outletName: outlet.name,
      outletType: outlet.type,
      outletLocation: outlet.location,
      isCloudDays: outlet.isCloudDays,
      timeSlotStatus: timeSlotStatus,
      overallStatus: overallStatus,
      completedSlots: completedSlots,
      totalSlots: totalSlots,
      completionPercentage: totalSlots > 0 ? ((completedSlots / totalSlots) * 100).toFixed(1) : '0.0',
      lastSubmissionTime: outletSubmissions.length > 0 ? 
        Math.max(...outletSubmissions.map(s => new Date(s.timestamp || 0).getTime())) : null
    };
  });

  // Sort by whitelist order
  completionStatus.sort((a, b) => {
    const indexA = ALLOWED_OUTLET_CODES.indexOf(a.outletCode.toUpperCase());
    const indexB = ALLOWED_OUTLET_CODES.indexOf(b.outletCode.toUpperCase());
    return indexA - indexB;
  });

  return completionStatus;
}

// Helper function to extract outlet list
// Helper function to extract outlet list
// Helper function to extract outlet list
function extractOutletList(outletData, submissionsData) {
  const outlets = [];
  const outletMap = new Map();
  
  // WHITELIST: Only these outlet codes are allowed
  const ALLOWED_OUTLET_CODES = ['RR', 'KOR', 'JAY', 'SKN', 'RAJ', 'KLN', 'BLN', 'WF', 'HSR', 'ARK', 'IND', 'CK'];

  // First, try to get outlets from master data
  if (outletData && outletData.length > 1) {
    const headers = outletData[0];
    const codeIndex = headers.findIndex(h => h && h.toLowerCase().includes('code'));
    const nameIndex = headers.findIndex(h => h && h.toLowerCase().includes('name'));
    const typeIndex = headers.findIndex(h => h && h.toLowerCase().includes('type'));
    const locationIndex = headers.findIndex(h => h && h.toLowerCase().includes('location'));

    console.log(`Outlet data column mapping: code=${codeIndex}, name=${nameIndex}, type=${typeIndex}, location=${locationIndex}`);

    for (let i = 1; i < outletData.length; i++) {
      const row = outletData[i];
      if (!row) continue;

      const outletCode = getCellValue(row, codeIndex, '').trim().toUpperCase();
      const outletName = getCellValue(row, nameIndex, '').trim();
      
      // Only include if outlet code is in the whitelist
      if (!outletCode || !ALLOWED_OUTLET_CODES.includes(outletCode)) {
        if (outletCode) {
          console.log(`Excluding outlet code not in whitelist: ${outletCode}`);
        }
        continue;
      }

      const outlet = {
        code: outletCode,
        name: outletName,
        type: getCellValue(row, typeIndex, ''),
        location: getCellValue(row, locationIndex, ''),
        isCloudDays: false
      };

      outletMap.set(outletCode, outlet);
      console.log(`✅ Added whitelisted outlet: ${outletCode}`);
    }
  }

  // Process submissions data and match to whitelisted outlets only
  if (submissionsData && submissionsData.length > 1) {
    const headers = submissionsData[0];
    const outletIndex = headers.findIndex(h => h && h.toLowerCase().includes('outlet'));

    if (outletIndex !== -1) {
      for (let i = 1; i < submissionsData.length; i++) {
        const row = submissionsData[i];
        if (!row || !row[outletIndex]) continue;

        const submissionOutlet = getCellValue(row, outletIndex, '').trim().toUpperCase();
        if (!submissionOutlet) continue;

        // Only process if it's in the whitelist
        if (ALLOWED_OUTLET_CODES.includes(submissionOutlet)) {
          // Check if already exists
          if (!outletMap.has(submissionOutlet)) {
            const newOutlet = {
              code: submissionOutlet,
              name: '',
              type: '',
              location: '',
              isCloudDays: false
            };
            outletMap.set(submissionOutlet, newOutlet);
            console.log(`✅ Added whitelisted outlet from submissions: ${submissionOutlet}`);
          }
        } else {
          console.log(`Excluding submission outlet not in whitelist: ${submissionOutlet}`);
        }
      }
    }
  }

  const finalOutlets = Array.from(outletMap.values());
  console.log(`Final whitelisted outlets: ${finalOutlets.map(o => o.code).join(', ')}`);
  console.log(`Total whitelisted outlets: ${finalOutlets.length} out of ${ALLOWED_OUTLET_CODES.length} possible`);
  
  return finalOutlets;
}

// Helper function to extract time slots
function extractTimeSlots(questionsData) {
  const timeSlots = new Set();
  
  if (questionsData && questionsData.length > 1) {
    const headers = questionsData[0];
    const timeSlotIndex = headers.findIndex(h => h && h.toLowerCase().includes('time') && h.toLowerCase().includes('slot'));
    
    if (timeSlotIndex !== -1) {
      for (let i = 1; i < questionsData.length; i++) {
        const row = questionsData[i];
        if (row && row[timeSlotIndex]) {
          const timeSlot = getCellValue(row, timeSlotIndex, '').trim();
          if (timeSlot) {
            timeSlots.add(timeSlot);
          }
        }
      }
    }
  }

  // Use extracted time slots or default ones
  const slotsArray = Array.from(timeSlots);
  return slotsArray.length > 0 ? slotsArray : ['Morning', 'Mid Day', 'Closing'];
}

// Helper function to filter submissions by date
function filterSubmissionsByDate(submissionsData, filterDate) {
  const submissions = [];
  
  if (!submissionsData || submissionsData.length <= 1) return submissions;

  const headers = submissionsData[0];
  const submissionIdIndex = headers.findIndex(h => h && h.toLowerCase().includes('submission') && h.toLowerCase().includes('id'));
  const dateIndex = headers.findIndex(h => h && h.toLowerCase().includes('date'));
  const timeSlotIndex = headers.findIndex(h => h && h.toLowerCase().includes('time') && h.toLowerCase().includes('slot'));
  const outletIndex = headers.findIndex(h => h && h.toLowerCase().includes('outlet'));
  const submittedByIndex = headers.findIndex(h => h && h.toLowerCase().includes('submitted') && h.toLowerCase().includes('by'));
  const timestampIndex = headers.findIndex(h => h && h.toLowerCase().includes('timestamp'));

  console.log(`Submission data column mapping: submissionId=${submissionIdIndex}, date=${dateIndex}, timeSlot=${timeSlotIndex}, outlet=${outletIndex}`);

  for (let i = 1; i < submissionsData.length; i++) {
    const row = submissionsData[i];
    if (!row) continue;

    const submissionDate = formatDate(getCellValue(row, dateIndex, ''));
    
    // Filter by date
    if (submissionDate === filterDate) {
      submissions.push({
        submissionId: getCellValue(row, submissionIdIndex, ''),
        date: submissionDate,
        timeSlot: getCellValue(row, timeSlotIndex, ''),
        outlet: getCellValue(row, outletIndex, ''),
        submittedBy: getCellValue(row, submittedByIndex, ''),
        timestamp: getCellValue(row, timestampIndex, '')
      });
    }
  }

  return submissions;
}

// Checklist completion summary endpoint
app.get('/api/checklist-completion-summary', async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    console.log(`📈 Fetching checklist completion summary for date: ${date}`);

    // Reuse the completion status endpoint logic
    const completionResponse = await fetch(`http://localhost:${PORT}/api/checklist-completion-status?date=${date}`);
    const completionData = await completionResponse.json();

    if (!completionData.success) {
      throw new Error('Failed to fetch completion data');
    }

    const data = completionData.data;
    
    // Calculate summary statistics
    const summary = {
      totalOutlets: data.length,
      completedOutlets: data.filter(o => o.overallStatus === 'Completed').length,
      partialOutlets: data.filter(o => o.overallStatus === 'Partial').length,
      pendingOutlets: data.filter(o => o.overallStatus === 'Pending').length,
      overallCompletionRate: data.length > 0 ? 
        ((data.filter(o => o.overallStatus === 'Completed').length / data.length) * 100).toFixed(1) : '0.0',
      timeSlotBreakdown: {},
      outletTypeBreakdown: {},
      cloudDaysBreakdown: {
        cloudDaysOutlets: data.filter(o => o.isCloudDays).length,
        regularOutlets: data.filter(o => !o.isCloudDays).length
      }
    };

    // Time slot breakdown
    if (data.length > 0) {
      const allTimeSlots = [...new Set(data.flatMap(o => o.timeSlotStatus.map(ts => ts.timeSlot)))];
      allTimeSlots.forEach(timeSlot => {
        const slotData = data.map(o => o.timeSlotStatus.find(ts => ts.timeSlot === timeSlot)).filter(Boolean);
        summary.timeSlotBreakdown[timeSlot] = {
          total: slotData.length,
          completed: slotData.filter(ts => ts.status === 'Completed').length,
          pending: slotData.filter(ts => ts.status === 'Pending').length,
          completionRate: slotData.length > 0 ? 
            ((slotData.filter(ts => ts.status === 'Completed').length / slotData.length) * 100).toFixed(1) : '0.0'
        };
      });
    }

    // Outlet type breakdown
    const outletTypes = [...new Set(data.map(o => o.outletType).filter(Boolean))];
    outletTypes.forEach(type => {
      const typeOutlets = data.filter(o => o.outletType === type);
      summary.outletTypeBreakdown[type] = {
        total: typeOutlets.length,
        completed: typeOutlets.filter(o => o.overallStatus === 'Completed').length,
        partial: typeOutlets.filter(o => o.overallStatus === 'Partial').length,
        pending: typeOutlets.filter(o => o.overallStatus === 'Pending').length,
        completionRate: typeOutlets.length > 0 ? 
          ((typeOutlets.filter(o => o.overallStatus === 'Completed').length / typeOutlets.length) * 100).toFixed(1) : '0.0'
      };
    });

    res.set('Content-Type', 'application/json');
    res.json({
      success: true,
      summary,
      date,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('❌ Error fetching checklist completion summary:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Debug checklist completion endpoint
app.get('/api/debug-checklist-completion', async (req, res) => {
  try {
    if (!sheets) {
      await initializeGoogleSheets();
    }

    const CHECKLIST_SPREADSHEET_ID = '1FYXr8Wz0ddN3mFi-0AQbI6J_noi2glPbJLh44CEMUnE';

    console.log('🔍 Debug: Fetching all checklist completion tabs...');

    const responses = {};
    const tabs = ['ChecklistQuestions', 'ChecklistSubmissions', 'Outlets', 'Outlet', 'OutletMaster'];

    for (const tab of tabs) {
      try {
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId: CHECKLIST_SPREADSHEET_ID,
          range: `${tab}!A1:Z10`, // First 10 rows for debugging
        });
        responses[tab] = {
          found: true,
          data: response.data.values || [],
          headers: response.data.values && response.data.values[0] ? response.data.values[0] : []
        };
        console.log(`✅ Found tab: ${tab} with ${responses[tab].data.length} rows`);
      } catch (error) {
        responses[tab] = {
          found: false,
          error: error.message
        };
        console.log(`❌ Tab not found: ${tab}`);
      }
    }

    res.set('Content-Type', 'application/json');
    res.json({
      success: true,
      spreadsheetId: CHECKLIST_SPREADSHEET_ID,
      tabs: responses,
      recommendations: {
        questionsTab: responses.ChecklistQuestions.found ? 'Found' : 'Not found - check tab name',
        submissionsTab: responses.ChecklistSubmissions.found ? 'Found' : 'Not found - check tab name',
        outletTab: Object.keys(responses).find(tab => tab.includes('Outlet') && responses[tab].found) || 'Not found - provide correct tab name'
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('❌ Error in debug checklist completion:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});
// === TICKET MANAGEMENT ENDPOINTS ===

// Transform function for ticket data
function transformTicketData(rawTickets) {
  if (!rawTickets || rawTickets.length <= 1) return [];
  
  const headers = rawTickets[0];
  const dataRows = rawTickets.slice(1);
  
  return dataRows.map((row, index) => {
    const safeRow = Array.isArray(row) ? row : [];
    
    return {
      ticketId: getCellValue(safeRow, 0) || `TKT-${index + 1}`,
      date: formatDate(getCellValue(safeRow, 1)),
      outlet: getCellValue(safeRow, 2) || 'Unknown Outlet',
      submittedBy: getCellValue(safeRow, 3) || 'Unknown User',
      issueDescription: getCellValue(safeRow, 4) || '',
      imageLink: getCellValue(safeRow, 5) || '',
      imageHash: getCellValue(safeRow, 6) || '',
      status: getCellValue(safeRow, 7) || 'Open',
      assignedTo: getCellValue(safeRow, 8) || '',
      daysPending: calculateDaysPending(getCellValue(safeRow, 1))
    };
  }).filter(ticket => {
    const hasAnyData = ticket.outlet !== 'Unknown Outlet' || 
                       ticket.submittedBy !== 'Unknown User' || 
                       ticket.date || 
                       ticket.ticketId.startsWith('TKT-') === false;
    return hasAnyData;
  });
}

// Helper function to calculate days pending
function calculateDaysPending(dateString) {
  if (!dateString) return 0;
  
  try {
    const ticketDate = new Date(dateString);
    const today = new Date();
    const diffTime = Math.abs(today - ticketDate);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  } catch (error) {
    return 0;
  }
}

// Fetch tickets from Google Sheets Tickets tab
app.get('/api/ticket-data', async (req, res) => {
  try {
    console.log('🎫 Fetching ticket data...');

    if (!sheets) {
      const initialized = await initializeGoogleSheets();
      if (!initialized) {
        throw new Error('Failed to initialize Google APIs');
      }
    }

    const TICKET_SPREADSHEET_ID = '1FYXr8Wz0ddN3mFi-0AQbI6J_noi2glPbJLh44CEMUnE';
    const TICKET_TAB = 'Tickets';

    console.log(`Fetching ${TICKET_TAB} from ${TICKET_SPREADSHEET_ID}...`);
    const ticketsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: TICKET_SPREADSHEET_ID,
      range: `${TICKET_TAB}!A:Z`,
    });

    const ticketsData = ticketsResponse.data.values || [];
    console.log(`Found ${ticketsData.length} ticket rows`);

    const tickets = transformTicketData(ticketsData);
    console.log(`✅ Processed ${tickets.length} tickets`);

    res.set('Content-Type', 'application/json');
    res.json({
      success: true,
      tickets,
      metadata: {
        spreadsheetId: TICKET_SPREADSHEET_ID,
        ticketTab: TICKET_TAB,
        ticketCount: tickets.length,
        originalRows: ticketsData.length - 1,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('❌ Error fetching ticket data:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Update ticket assignment and status in Google Sheets
// Update ticket assignment and status in Google Sheets - FIXED VERSION
app.post('/api/assign-ticket', async (req, res) => {
  try {
    const { ticketId, assignedTo } = req.body;
    
    if (!ticketId || !assignedTo) {
      return res.status(400).json({
        success: false,
        error: 'Missing ticketId or assignedTo in request body'
      });
    }

    console.log(`🎫 Assigning ticket ${ticketId} to ${assignedTo}`);

    if (!sheets) {
      const initialized = await initializeGoogleSheets();
      if (!initialized) {
        throw new Error('Failed to initialize Google APIs');
      }
    }

    const TICKET_SPREADSHEET_ID = '1FYXr8Wz0ddN3mFi-0AQbI6J_noi2glPbJLh44CEMUnE';
    const TICKET_TAB = 'Tickets';

    // Get all ticket data to find the row
    const ticketsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: TICKET_SPREADSHEET_ID,
      range: `${TICKET_TAB}!A:I`, // Only get columns A through I
    });

    const ticketsData = ticketsResponse.data.values || [];
    console.log(`Found ${ticketsData.length} rows in Tickets tab`);
    
    // Find the row with matching ticket ID (column A)
    let targetRow = -1;
    for (let i = 1; i < ticketsData.length; i++) { // Start from row 1 (skip header)
      if (ticketsData[i] && ticketsData[i][0] === ticketId) {
        targetRow = i + 1; // Convert to 1-based indexing for Sheets API
        console.log(`Found ticket ${ticketId} at row ${targetRow}`);
        break;
      }
    }

    if (targetRow === -1) {
      console.log(`Ticket ${ticketId} not found in ${ticketsData.length} rows`);
      return res.status(404).json({
        success: false,
        error: `Ticket ${ticketId} not found`,
        availableTickets: ticketsData.slice(1).map(row => row[0]).filter(Boolean)
      });
    }

    // Update both Status (column H) and Assigned To (column I) in a single batch
    console.log(`Updating row ${targetRow}: Status to "In Progress", Assigned To to "${assignedTo}"`);
    
    const batchUpdateResponse = await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: TICKET_SPREADSHEET_ID,
      resource: {
        data: [
          {
            range: `${TICKET_TAB}!H${targetRow}`, // Status column (H)
            values: [['In Progress']]
          },
          {
            range: `${TICKET_TAB}!I${targetRow}`, // Assigned To column (I)
            values: [[assignedTo]]
          }
        ],
        valueInputOption: 'RAW'
      }
    });

    console.log(`✅ Successfully updated ticket ${ticketId}`);
    console.log(`Batch update response:`, batchUpdateResponse.data);

    res.json({
      success: true,
      ticketId,
      assignedTo,
      status: 'In Progress',
      updatedRow: targetRow,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error assigning ticket:', error.message);
    console.error('Full error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.data || 'No additional details',
      timestamp: new Date().toISOString()
    });
  }
});

// Debug tickets endpoint
app.get('/api/debug-tickets', async (req, res) => {
  try {
    if (!sheets) {
      await initializeGoogleSheets();
    }

    const TICKET_SPREADSHEET_ID = '1FYXr8Wz0ddN3mFi-0AQbI6J_noi2glPbJLh44CEMUnE';
    const TICKET_TAB = 'Tickets';

    console.log(`🔍 Debug: Checking ticket data from ${TICKET_SPREADSHEET_ID}`);
    
    const ticketsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: TICKET_SPREADSHEET_ID,
      range: `${TICKET_TAB}!A:Z`,
    });
    
    res.set('Content-Type', 'application/json');
    res.json({
      success: true,
      spreadsheetId: TICKET_SPREADSHEET_ID,
      tab: TICKET_TAB,
      rawData: ticketsResponse.data.values || [],
      rowCount: ticketsResponse.data.values ? ticketsResponse.data.values.length : 0,
      headers: ticketsResponse.data.values && ticketsResponse.data.values[0] ? ticketsResponse.data.values[0] : [],
      expectedColumns: [
        'Ticket ID (A)', 'Date (B)', 'Outlet (C)', 'Submitted By (D)', 
        'Issue Description (E)', 'Image Link (F)', 'Image Hash (G)', 
        'Status (H)', 'Assigned To (I)'
      ],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('❌ Debug tickets error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      spreadsheetId: '1FYXr8Wz0ddN3mFi-0AQbI6J_noi2glPbJLh44CEMUnE',
      tab: 'Tickets'
    });
  }
});

// Add this new endpoint to your existing server.js file

// Update ticket status and action taken
app.post('/api/update-ticket-status', async (req, res) => {
  try {
    const { ticketId, status, actionTaken } = req.body;
    
    if (!ticketId || !status) {
      return res.status(400).json({
        success: false,
        error: 'Missing ticketId or status in request body'
      });
    }

    console.log(`🎫 Updating ticket ${ticketId} status to ${status} with action: ${actionTaken || 'none'}`);

    if (!sheets) {
      const initialized = await initializeGoogleSheets();
      if (!initialized) {
        throw new Error('Failed to initialize Google APIs');
      }
    }

    const TICKET_SPREADSHEET_ID = '1FYXr8Wz0ddN3mFi-0AQbI6J_noi2glPbJLh44CEMUnE';
    const TICKET_TAB = 'Tickets';

    // Get all ticket data to find the row
    const ticketsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: TICKET_SPREADSHEET_ID,
      range: `${TICKET_TAB}!A:J`, // Extended to include column J for Action Taken
    });

    const ticketsData = ticketsResponse.data.values || [];
    console.log(`Found ${ticketsData.length} rows in Tickets tab`);
    
    // Find the row with matching ticket ID (column A)
    let targetRow = -1;
    for (let i = 1; i < ticketsData.length; i++) { // Start from row 1 (skip header)
      if (ticketsData[i] && ticketsData[i][0] === ticketId) {
        targetRow = i + 1; // Convert to 1-based indexing for Sheets API
        console.log(`Found ticket ${ticketId} at row ${targetRow}`);
        break;
      }
    }

    if (targetRow === -1) {
      console.log(`Ticket ${ticketId} not found in ${ticketsData.length} rows`);
      return res.status(404).json({
        success: false,
        error: `Ticket ${ticketId} not found`,
        availableTickets: ticketsData.slice(1).map(row => row[0]).filter(Boolean)
      });
    }

    // Prepare batch update data
    const updateData = [
      {
        range: `${TICKET_TAB}!H${targetRow}`, // Status column (H)
        values: [[status]]
      }
    ];

    // Add Action Taken update if provided
    if (actionTaken !== undefined) {
      updateData.push({
        range: `${TICKET_TAB}!J${targetRow}`, // Action Taken column (J)
        values: [[actionTaken]]
      });
    }

    console.log(`Updating row ${targetRow}: Status to "${status}"${actionTaken !== undefined ? `, Action Taken to "${actionTaken}"` : ''}`);
    
    const batchUpdateResponse = await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: TICKET_SPREADSHEET_ID,
      resource: {
        data: updateData,
        valueInputOption: 'RAW'
      }
    });

    console.log(`✅ Successfully updated ticket ${ticketId}`);
    console.log(`Batch update response:`, batchUpdateResponse.data);

    res.json({
      success: true,
      ticketId,
      status,
      actionTaken: actionTaken || '',
      updatedRow: targetRow,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error updating ticket status:', error.message);
    console.error('Full error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.data || 'No additional details',
      timestamp: new Date().toISOString()
    });
  }
});

// Updated transform function for ticket data (replace the existing one)
function transformTicketData(rawTickets) {
  if (!rawTickets || rawTickets.length <= 1) return [];
  
  const headers = rawTickets[0];
  const dataRows = rawTickets.slice(1);
  
  return dataRows.map((row, index) => {
    const safeRow = Array.isArray(row) ? row : [];
    
    return {
      ticketId: getCellValue(safeRow, 0) || `TKT-${index + 1}`,
      date: formatDate(getCellValue(safeRow, 1)),
      outlet: getCellValue(safeRow, 2) || 'Unknown Outlet',
      submittedBy: getCellValue(safeRow, 3) || 'Unknown User',
      issueDescription: getCellValue(safeRow, 4) || '',
      imageLink: getCellValue(safeRow, 5) || '',
      imageHash: getCellValue(safeRow, 6) || '',
      status: getCellValue(safeRow, 7) || 'Open',
      assignedTo: getCellValue(safeRow, 8) || '',
      actionTaken: getCellValue(safeRow, 9) || '', // New field for Action Taken (Column J)
      daysPending: calculateDaysPending(getCellValue(safeRow, 1))
    };
  }).filter(ticket => {
    const hasAnyData = ticket.outlet !== 'Unknown Outlet' || 
                       ticket.submittedBy !== 'Unknown User' || 
                       ticket.date || 
                       ticket.ticketId.startsWith('TKT-') === false;
    return hasAnyData;
  });
}

// Updated debug tickets endpoint to show new structure
app.get('/api/debug-tickets', async (req, res) => {
  try {
    if (!sheets) {
      await initializeGoogleSheets();
    }

    const TICKET_SPREADSHEET_ID = '1FYXr8Wz0ddN3mFi-0AQbI6J_noi2glPbJLh44CEMUnE';
    const TICKET_TAB = 'Tickets';

    console.log(`🔍 Debug: Checking ticket data from ${TICKET_SPREADSHEET_ID}`);
    
    const ticketsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: TICKET_SPREADSHEET_ID,
      range: `${TICKET_TAB}!A:J`, // Extended to include Action Taken column
    });
    
    res.set('Content-Type', 'application/json');
    res.json({
      success: true,
      spreadsheetId: TICKET_SPREADSHEET_ID,
      tab: TICKET_TAB,
      rawData: ticketsResponse.data.values || [],
      rowCount: ticketsResponse.data.values ? ticketsResponse.data.values.length : 0,
      headers: ticketsResponse.data.values && ticketsResponse.data.values[0] ? ticketsResponse.data.values[0] : [],
      expectedColumns: [
        'Ticket ID (A)', 'Date (B)', 'Outlet (C)', 'Submitted By (D)', 
        'Issue Description (E)', 'Image Link (F)', 'Image Hash (G)', 
        'Status (H)', 'Assigned To (I)', 'Action Taken (J)' // Added new column
      ],
      newFeatures: {
        statusUpdateEndpoint: '/api/update-ticket-status (POST)',
        supportedStatuses: ['Open', 'In Progress', 'Resolved', 'Closed'],
        actionTakenColumn: 'J',
        statusColumn: 'H'
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('❌ Debug tickets error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      spreadsheetId: '1FYXr8Wz0ddN3mFi-0AQbI6J_noi2glPbJLh44CEMUnE',
      tab: 'Tickets'
    });
  }
});

// Updated health check endpoint to include new ticket management features
app.get('/health', async (req, res) => {
  const sheetsConnected = !!sheets;
  const driveConnected = !!drive;
  
  res.set('Content-Type', 'application/json');
  res.json({ 
    status: sheetsConnected && driveConnected ? 'OK' : 'Not Connected',
    services: {
      googleSheets: sheetsConnected ? 'Connected' : 'Disconnected',
      googleDrive: driveConnected ? 'Connected' : 'Disconnected',
      geminiApi: GEMINI_API_KEY ? 'Configured' : 'Not Configured',
    },
    environment: {
      dashboardSpreadsheetId: DASHBOARD_SPREADSHEET_ID ? 'Set' : 'Missing',
      dashboardSheetName: DASHBOARD_SHEET_NAME ? 'Set' : 'Missing',
      checklistSpreadsheetId: CHECKLIST_SPREADSHEET_ID ? 'Set' : 'Missing',
      geminiApiKey: GEMINI_API_KEY ? 'Set' : 'Missing',
    },
    endpoints: {
      dashboard: '/api/dashboard-data?period=[28 Day|7 Day|1 Day]',
      checklist: '/api/checklist-data',
      checklistStats: '/api/checklist-stats',
      debugChecklist: '/api/debug-checklist',
      debugDashboard: '/api/debug-sheet',
      highRated: '/api/high-rated-data-gemini?period=[7 Days|28 Day]',
      debugHighRated: '/api/debug-high-rated',
      tickets: '/api/ticket-data',
      assignTicket: '/api/assign-ticket (POST)',
      updateTicketStatus: '/api/update-ticket-status (POST)', // New endpoint
      debugTickets: '/api/debug-tickets',
      swiggy: '/api/swiggy-dashboard-data?period=[7 Day|1 Day]',
      employee: '/api/employee-data?period=[7 Days|28 Days]',
      checklistCompletion: '/api/checklist-completion-status?date=YYYY-MM-DD',
      aiInsights: '/api/generate-insights (POST)',
      outletAnalysis: '/api/analyze-outlet (POST)'
    },
    ticketManagement: {
      features: [
        'Ticket assignment to team members',
        'Status updates (Open, In Progress, Resolved, Closed)',
        'Action taken tracking',
        'Image attachment support',
        'Days pending calculation',
        'Filtering and sorting',
        'Real-time updates'
      ],
      supportedStatuses: ['Open', 'In Progress', 'Resolved', 'Closed'],
      columnMapping: {
        'A': 'Ticket ID',
        'B': 'Date',
        'C': 'Outlet',
        'D': 'Submitted By',
        'E': 'Issue Description',
        'F': 'Image Link',
        'G': 'Image Hash',
        'H': 'Status',
        'I': 'Assigned To',
        'J': 'Action Taken'
      }
    },
    timestamp: new Date().toISOString(),
  });
});

// Image proxy endpoint with better error handling for ticket images
app.get('/api/image-proxy/:fileId', async (req, res) => {
  try {
    const fileId = req.params.fileId;
    console.log(`📷 Proxying image for fileId: ${fileId}`);
    
    // Add CORS headers
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    
    if (!drive) {
      const initialized = await initializeGoogleSheets();
      if (!initialized) {
        throw new Error('Failed to initialize Google Drive');
      }
    }
    
    const response = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'stream' }
    );
    
    // Set content type and cache headers
    const contentType = response.headers['content-type'] || 'image/jpeg';
    res.set({
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*'
    });
    
    response.data.pipe(res);
    
  } catch (error) {
    console.error(`❌ Image proxy error for file ${req.params.fileId}: ${error.message}`);
    
    // Set CORS headers even for errors
    res.header('Access-Control-Allow-Origin', '*');
    
    if (error.code === 404) {
      res.status(404).json({
        error: 'Image not found',
        fileId: req.params.fileId,
        message: 'The requested image file was not found or is not accessible.',
        suggestion: 'Check if the Google Drive file exists and is shared properly'
      });
    } else if (error.code === 403) {
      res.status(403).json({
        error: 'Access denied',
        fileId: req.params.fileId,
        message: 'Permission denied. Make sure the file is shared with the service account.',
        serviceAccount: authClient?.email || 'unknown'
      });
    } else {
      res.status(500).json({
        error: 'Internal server error',
        fileId: req.params.fileId,
        message: error.message,
        suggestion: 'Contact support if this issue persists'
      });
    }
  }
});

// Add OPTIONS handler for CORS preflight
app.options('/api/image-proxy/:fileId', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.sendStatus(200);
});

// Updated root endpoint to include ticket management info
app.get('/', (req, res) => {
  res.set('Content-Type', 'application/json');
  res.json({
    message: 'AOD Dashboard & Ticket Management API Server',
    version: '2.3.0',
    status: 'Running',
    features: [
      'Multi-period dashboard data (1/7/28 days)',
      'Enhanced ticket management with status updates',
      'Action taken tracking for tickets',
      'Image proxy with improved error handling',
      'Checklist management with completion tracking',
      'Employee performance dashboard',
      'Swiggy-specific analytics',
      'High-rated order tracking',
      'AI-powered insights with Gemini',
      'Comprehensive debugging endpoints'
    ],
    endpoints: {
      tickets: {
        data: '/api/ticket-data',
        assign: '/api/assign-ticket (POST)',
        updateStatus: '/api/update-ticket-status (POST)',
        debug: '/api/debug-tickets',
        description: 'Complete ticket management system with status tracking and action logging'
      },
      dashboard: {
        data: '/api/dashboard-data?period=[28 Day|7 Day|1 Day]',
        debug: '/api/debug-sheet',
        description: 'Restaurant performance analytics'
      },
      checklist: {
        data: '/api/checklist-data',
        stats: '/api/checklist-stats',
        completion: '/api/checklist-completion-status?date=YYYY-MM-DD',
        filter: '/api/checklist-filter (POST)',
        debug: '/api/debug-checklist',
        description: 'Checklist management and completion tracking'
      },
      utilities: {
        imageProxy: '/api/image-proxy/:fileId',
        health: '/health',
        description: 'Utility endpoints for system monitoring and file access'
      }
    },
    ticketUpdates: {
      newFeatures: [
        'Status management (Open, In Progress, Resolved, Closed)',
        'Action taken documentation',
        'Enhanced image handling',
        'Better error messages',
        'Improved UI/UX'
      ],
      columnStructure: {
        'A': 'Ticket ID',
        'B': 'Date', 
        'C': 'Outlet',
        'D': 'Submitted By',
        'E': 'Issue Description',
        'F': 'Image Link',
        'G': 'Image Hash',
        'H': 'Status',
        'I': 'Assigned To',
        'J': 'Action Taken'
      }
    },
    timestamp: new Date().toISOString(),
  });
});
// === AI API ENDPOINTS ===

// Generate comprehensive AI insights
app.post('/api/generate-insights', async (req, res) => {
  try {
    const { data, period, analysisType } = req.body;
    
    console.log(`Generating AI insights for ${period} data with ${data.outlets.length} outlets`);
    
    const insights = await generateInsightsWithGemini(data, period, analysisType);
    
    res.set('Content-Type', 'application/json');
    res.json({
      success: true,
      insights,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error generating insights:', error.message);
    res.set('Content-Type', 'application/json');
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Analyze specific outlet with AI
app.post('/api/analyze-outlet', async (req, res) => {
  try {
    const { outlet, period, allData } = req.body;
    
    console.log(`Analyzing outlet: ${outlet.name} for ${period}`);
    
    const analysis = await analyzeOutletWithGemini(outlet, period, allData);
    
    res.set('Content-Type', 'application/json');
    res.json({
      success: true,
      analysis,
      outlet: outlet.name,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error analyzing outlet:', error.message);
    res.set('Content-Type', 'application/json');
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Health check endpoint
app.get('/health', async (req, res) => {
  const sheetsConnected = !!sheets;
  const driveConnected = !!drive;
  
  res.set('Content-Type', 'application/json');
  res.json({ 
    status: sheetsConnected && driveConnected ? 'OK' : 'Not Connected',
    services: {
      googleSheets: sheetsConnected ? 'Connected' : 'Disconnected',
      googleDrive: driveConnected ? 'Connected' : 'Disconnected',
      geminiApi: GEMINI_API_KEY ? 'Configured' : 'Not Configured',
    },
    environment: {
      dashboardSpreadsheetId: DASHBOARD_SPREADSHEET_ID ? 'Set' : 'Missing',
      dashboardSheetName: DASHBOARD_SHEET_NAME ? 'Set' : 'Missing',
      checklistSpreadsheetId: CHECKLIST_SPREADSHEET_ID ? 'Set' : 'Missing',
      geminiApiKey: GEMINI_API_KEY ? 'Set' : 'Missing',
    },
    endpoints: {
      dashboard: '/api/dashboard-data?period=[28 Day|7 Day|1 Day]',
      checklist: '/api/checklist-data',
      checklistStats: '/api/checklist-stats',
      debugChecklist: '/api/debug-checklist',
      debugDashboard: '/api/debug-sheet',
      highRated: '/api/high-rated-data-gemini?period=[7 Days|28 Day]',
      debugHighRated: '/api/debug-high-rated',
      aiInsights: '/api/generate-insights (POST)',
      outletAnalysis: '/api/analyze-outlet (POST)'
    },
    timestamp: new Date().toISOString(),
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.set('Content-Type', 'application/json');
  res.json({
    message: 'AOD Dashboard & Checklist API Server',
    version: '2.2.0',
    status: 'Running',
    features: [
      'Multi-period dashboard data (1/7/28 days)',
      'Enhanced error handling for #DIV/0! values',
      'Fixed High Rated processing with Gemini 1.5 Flash',
      'Improved column mapping for Google Sheets',
      'Comprehensive debugging endpoints',
      'Image proxy with CORS support',
      'Checklist management system',
      'Fixed structure processing for High Rated data'
    ],
    endpoints: {
      health: '/health',
      dashboard: {
        data: '/api/dashboard-data?period=[28 Day|7 Day|1 Day]',
        debug: '/api/debug-sheet',
        description: 'Fetch restaurant performance data for different time periods'
      },
      checklist: {
        data: '/api/checklist-data',
        stats: '/api/checklist-stats',
        filter: '/api/checklist-filter (POST)',
        debug: '/api/debug-checklist',
        description: 'Manage checklist submissions and responses'
      },
      highRated: {
        data: '/api/high-rated-data-gemini?period=[7 Days|28 Day]',
        debug: '/api/debug-high-rated',
        description: 'Fetch high rated order performance data with fixed structure processing'
      },
      utilities: {
        imageProxy: '/api/image-proxy/:fileId',
        description: 'Proxy Google Drive images with CORS support'
      }
    },
    timestamp: new Date().toISOString(),
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err.stack);
  res.set('Content-Type', 'application/json');
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    details: err.message,
    timestamp: new Date().toISOString(),
  });
});

// 404 handler - Fixed to avoid path-to-regexp error
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    requestedPath: req.originalUrl,
    availableEndpoints: {
      dashboard: '/api/dashboard-data?period=[28 Day|7 Day|1 Day]',
      checklist: '/api/checklist-data',
      highRated: '/api/high-rated-data-gemini?period=[7 Days|28 Day]',
      health: '/health',
      root: '/',
    },
    timestamp: new Date().toISOString(),
  });
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Server terminated');
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 AOD Dashboard & Checklist API Server running on http://localhost:${PORT}`);
  console.log('');
  console.log('📊 Dashboard endpoints:');
  console.log(`   GET  /api/dashboard-data?period=[28 Day|7 Day|1 Day] - Fetch performance data`);
  console.log(`   GET  /api/debug-sheet                                - Debug raw sheet data`);
  console.log('');
  console.log('📋 Checklist endpoints:');
  console.log(`   GET  /api/checklist-data                             - Fetch all checklist data`);
  console.log(`   GET  /api/checklist-stats                            - Get statistics`);
  console.log(`   POST /api/checklist-filter                           - Filter data`);
  console.log(`   GET  /api/debug-checklist                            - Debug checklist data`);
  console.log('');
  console.log('⭐ High Rated endpoints (FIXED STRUCTURE):');
  console.log(`   GET  /api/high-rated-data-gemini?period=[7 Days|28 Day] - Fetch high rated data with fixed processing`);
  console.log(`   GET  /api/debug-high-rated                           - Debug high rated data structure`);
  console.log('');
  console.log('🔧 Utility endpoints:');
  console.log(`   GET  /health                                         - Health check`);
  console.log(`   GET  /                                               - API info`);
  console.log(`   GET  /api/image-proxy/:fileId                        - Image proxy`);
  console.log('');
  console.log('🔑 Environment:');
  console.log(`   Dashboard Sheet: ${DASHBOARD_SPREADSHEET_ID ? '✅ Configured' : '❌ Missing'}`);
  console.log(`   Checklist Sheet: ${CHECKLIST_SPREADSHEET_ID ? '✅ Configured' : '❌ Missing'}`);
  console.log(`   Gemini 1.5 Flash API: ${GEMINI_API_KEY ? '✅ Configured' : '❌ Missing'}`);
  console.log(`   Service Account: ${authClient ? '✅ Connected' : '❌ Not Connected'}`);
  console.log('');
  console.log('📋 High Rated Data Structure:');
  console.log('   7 Days: Header in Row 1, Data from Row 2-12, Outlet names in Column D');
  console.log('   28 Days: Header in Row 18, Data from Row 19+, Outlet names in Column D');
  console.log('');
  console.log('🎯 Ready to serve requests!');
});