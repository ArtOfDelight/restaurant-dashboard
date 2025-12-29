require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');
const Groq = require('groq-sdk');
const cron = require('node-cron');
const nodemailer = require('nodemailer');
const CRITICAL_STOCK_BOT_TOKEN = process.env.CRITICAL_STOCK_BOT_TOKEN;
const CRITICAL_STOCK_GROUP_ID = process.env.CRITICAL_STOCK_GROUP_ID;
const SEND_TO_GROUP = process.env.SEND_TO_GROUP === 'true';

// RISTAAPPS AUDIT CONFIGURATION
const RISTA_API_KEY = process.env.RISTA_API_KEY;
const RISTA_SECRET_KEY = process.env.RISTA_SECRET_KEY;

const BRANCH_CODES = {
  'Sahakarnagar': 'AOD-6',
  'Residency Road': 'AOD-01',
  'Whitefield': 'AOD-4',
  'Koramangala': 'AOD-02',
  'Kalyan Nagar': 'AOD-5',
  'Bellandur': 'AOD-3',
  'Indiranagar': 'AOD-CVR',
  'Arekere': 'AOD-ARK',
  'Jayanagar': 'AOD-JAY',
  'HSR Layout': 'CK - HSR',
  'Rajajinagar': 'AOD-RAJ',
  'Art Of Delight Central': 'HO AOD'
};

const ALLOWED_CATEGORIES = [
  'Celebration Box - Craft Ice Creams',
  'Ice Cream (2 kg Box)',
  'Ice Cream (2.5 kg RR Pan)',
  'Cookies and Brownies',
  'Cheesecake & Dessert Jars'
];

const ALLOWED_SKUS = [
  'O', '314', '1472', '1513', '1395', '1512', 
  '530', '1514', '1608', '1502'
];

const TICKET_TYPES = {
  REPAIR_MAINTENANCE: 'Repair and Maintenance',
  DIFFICULTY_IN_ORDER: 'Difficulty in Order', // NEW: Missing from original
  STOCK_ITEMS: 'Stock Items', 
  HOUSEKEEPING: 'Housekeeping',
  OTHERS: 'Others'
};

const AUTO_ASSIGNMENT_RULES = {
  [TICKET_TYPES.REPAIR_MAINTENANCE]: ['Nishat'],
  [TICKET_TYPES.DIFFICULTY_IN_ORDER]: [], // NEW: No specific assignment in bot
  [TICKET_TYPES.STOCK_ITEMS]: ['Nishat', 'Ajay'],
  [TICKET_TYPES.HOUSEKEEPING]: ['Kim'],
  [TICKET_TYPES.OTHERS]: ['Kim']
};

// Keywords for automatic type classification (optional)
const TYPE_CLASSIFICATION_KEYWORDS = {
  [TICKET_TYPES.REPAIR_MAINTENANCE]: [
    'repair', 'maintenance', 'fix', 'broken', 'not working', 'malfunction', 
    'equipment', 'machine', 'device', 'hardware', 'technical issue'
  ],
  [TICKET_TYPES.DIFFICULTY_IN_ORDER]: [
    'difficulty', 'problem with order', 'order issue', 'cannot order',
    'ordering problem', 'app issue', 'system problem'
  ],
  [TICKET_TYPES.STOCK_ITEMS]: [
    'stock', 'inventory', 'out of stock', 'shortage', 'supply', 'items missing',
    'product unavailable', 'restock', 'ordering', 'procurement'
  ],
  [TICKET_TYPES.HOUSEKEEPING]: [
    'housekeeping', 'cleaning', 'hygiene', 'sanitation', 'cleanliness',
    'washroom', 'bathroom', 'dining area', 'kitchen clean', 'waste'
  ],
  [TICKET_TYPES.OTHERS]: []
};

const app = express();
const PORT = process.env.PORT || 5000;

let criticalStockBot = null;

// Middleware
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000' }));
app.use(express.json());

// Google Sheets setup
let sheets;
let drive;
let authClient;

// Environment variable validation
const CHECKLIST_SPREADSHEET_ID = process.env.CHECKLIST_SPREADSHEET_ID || '1FYXr8Wz0ddN3mFi-0AQbI6J_noi2glPbJLh44CEMUnE';
const SUBMISSIONS_TAB = process.env.CHECKLIST_SUBMISSIONS_TAB || 'ChecklistSubmissions';
const RESPONSES_TAB = process.env.CHECKLIST_RESPONSES_TAB || 'ChecklistResponses';
const DASHBOARD_SPREADSHEET_ID = process.env.SPREADSHEET_ID || '1XmKondedSs_c6PZflanfB8OFUsGxVoqi5pUPvscT8cs';
const DASHBOARD_SHEET_NAME = process.env.SHEET_NAME || 'Zomato Dashboard';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ROSTER_SPREADSHEET_ID = '1FYXr8Wz0ddN3mFi-0AQbI6J_noi2glPbJLh44CEMUnE';
const ROSTER_TAB = 'Roster';

// Gemini API Key Management - Multiple keys for failover
const GEMINI_API_KEYS = [
  process.env.GEMINI_API_KEY,
  process.env.GEMINI_API_KEY1,
  process.env.GEMINI_API_KEY2,
  process.env.GEMINI_API_KEY3,
  process.env.GEMINI_API_KEY4
].filter(key => key && key.trim()); // Remove undefined/empty keys

let currentKeyIndex = 0;

// Groq API Configuration (FREE alternative to Gemini) - Multiple keys for failover
const GROQ_API_KEYS = [
  process.env.GROQ_API_KEY,
  process.env.GROQ_API_KEY1,
  process.env.GROQ_API_KEY2,
  process.env.GROQ_API_KEY3
].filter(key => key && key.trim()); // Remove undefined/empty keys

let currentGroqKeyIndex = 0;
const AI_PROVIDER = process.env.AI_PROVIDER || 'gemini'; // Options: 'gemini' or 'groq'

// Initialize Groq clients array
let groqClients = [];
if (GROQ_API_KEYS.length > 0) {
  groqClients = GROQ_API_KEYS.map(key => new Groq({ apiKey: key }));
  console.log(`✅ Loaded ${GROQ_API_KEYS.length} Groq API key(s) for failover (Provider: ${AI_PROVIDER})`);
} else if (AI_PROVIDER === 'groq') {
  console.error('⚠️  AI_PROVIDER is set to "groq" but no GROQ_API_KEY is configured');
}

// Legacy support - keep groqClient pointing to first client
let groqClient = groqClients.length > 0 ? groqClients[0] : null;

// Telegram Bot setup with conflict resolution
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ENABLE_TELEGRAM_BOT = process.env.ENABLE_TELEGRAM_BOT !== 'false'; // Default to true unless explicitly disabled
const BROADCAST_SPREADSHEET_ID = process.env.CHECKLIST_SPREADSHEET_ID || '1FYXr8Wz0ddN3mFi-0AQbI6J_noi2glPbJLh44CEMUnE';
const BROADCAST_TAB = 'Broadcasts';
// ADD these new lines (don't replace existing ones):
const CO_BOT_TOKEN = process.env.CO_BOT_TOKEN;
let ticketBot = null; // Separate bot instance for ticket management
// Add this line
const USER_MAPPING_TAB = 'UserTelegramMapping';

// Outlet Operating Hours Mapping
// Note: Any outlet with 24 hrs/day is treated as 15 hrs/day for stock calculations
const OUTLET_OPERATING_HOURS = {
  'AOD-6': { name: 'Sahakarnagar', type: 'Dine-in', hoursPerDay: 14 },
  'AOD-01': { name: 'Residency Road', type: 'Dine-in', hoursPerDay: 14 },
  'AOD-4': { name: 'Whitefield', type: 'Cloud Kitchen', hoursPerDay: 15 }, // Converted from 24
  'AOD-02': { name: 'Koramangala', type: 'Dine-in', hoursPerDay: 14 },
  'AOD-5': { name: 'Kalyan Nagar', type: 'Cloud Kitchen', hoursPerDay: 15 }, // Converted from 24
  'AOD-3': { name: 'Bellandur', type: 'Cloud Kitchen', hoursPerDay: 15 }, // Converted from 24
  'AOD-IND': { name: 'Indiranagar', type: 'Cloud Kitchen', hoursPerDay: 15 }, // Converted from 24
  'AOD-ARK': { name: 'Arekere', type: 'Cloud Kitchen', hoursPerDay: 15 }, // Converted from 24
  'AOD-JAY': { name: 'Jayanagar', type: 'Dine-in', hoursPerDay: 14 },
  'HSR': { name: 'HSR Layout', type: 'Cloud Kitchen', hoursPerDay: 15 }, // Converted from 24
  'AOD-7': { name: 'Electronic City', type: 'Dine-in', hoursPerDay: 14 },
  'RAJ': { name: 'Rajajinagar', type: 'Cloud Kitchen', hoursPerDay: 15 } // Converted from 24
};

// Helper function to get operating hours for an outlet
function getOutletOperatingHours(outletCode) {
  // Try exact match first
  if (OUTLET_OPERATING_HOURS[outletCode]) {
    return OUTLET_OPERATING_HOURS[outletCode].hoursPerDay;
  }

  // Try case-insensitive match
  const upperOutlet = outletCode.toUpperCase();
  const match = Object.keys(OUTLET_OPERATING_HOURS).find(key =>
    key.toUpperCase() === upperOutlet ||
    OUTLET_OPERATING_HOURS[key].name.toUpperCase() === upperOutlet
  );

  if (match) {
    return OUTLET_OPERATING_HOURS[match].hoursPerDay;
  }

  // Default to 15 hours if unknown
  console.warn(`⚠️  Unknown outlet "${outletCode}", defaulting to 15 hours/day`);
  return 15;
}

let bot = null;
let isShuttingDown = false;

if (!DASHBOARD_SPREADSHEET_ID || !DASHBOARD_SHEET_NAME) {
  console.error('Missing environment variables: SPREADSHEET_ID and SHEET_NAME are required for dashboard endpoints');
}
if (GEMINI_API_KEYS.length === 0) {
  console.error('Missing environment variable: At least one GEMINI_API_KEY is required for Gemini API integration');
} else {
  console.log(`✅ Loaded ${GEMINI_API_KEYS.length} Gemini API key(s) for failover`);
}

// Initialize Google Sheets and Broadcast tab
async function initializeGoogleServices() {
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
    console.log('Google Auth successful');

    sheets = google.sheets({ version: 'v4', auth: authClient });
    drive = google.drive({ version: 'v3', auth: authClient });
    console.log('Google Sheets and Drive connected');
    console.log(`Service account email: ${serviceAccount.client_email}`);

    await initializeBroadcastTab();
    
    return true;
  } catch (error) {
    console.error('Error initializing Google APIs:', error.message);
    return false;
  }
}



// Initialize Broadcasts tab
async function initializeBroadcastTab() {
  try {
    if (!sheets) {
      console.error('Google Sheets not initialized');
      throw new Error('Google Sheets service not available');
    }

    if (!BROADCAST_SPREADSHEET_ID) {
      console.error('BROADCAST_SPREADSHEET_ID not defined');
      throw new Error('Broadcast spreadsheet ID not configured');
    }

    if (!BROADCAST_TAB) {
      console.error('BROADCAST_TAB not defined');
      throw new Error('Broadcast tab name not configured');
    }

    console.log(`Checking if ${BROADCAST_TAB} tab exists in spreadsheet ${BROADCAST_SPREADSHEET_ID}`);

    const response = await sheets.spreadsheets.get({
      spreadsheetId: BROADCAST_SPREADSHEET_ID,
      ranges: [],
      includeGridData: false,
    });

    const sheetExists = response.data.sheets.some(sheet => 
      sheet.properties.title === BROADCAST_TAB
    );

    if (!sheetExists) {
      console.log(`Creating ${BROADCAST_TAB} tab in spreadsheet ${BROADCAST_SPREADSHEET_ID}`);
      
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: BROADCAST_SPREADSHEET_ID,
        resource: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: BROADCAST_TAB,
                },
              },
            },
          ],
        },
      });

      console.log(`Created ${BROADCAST_TAB} tab successfully`);

      // Add headers with a small delay to ensure tab is fully created
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      await sheets.spreadsheets.values.update({
        spreadsheetId: BROADCAST_SPREADSHEET_ID,
        range: `${BROADCAST_TAB}!A1:G1`,
        valueInputOption: 'RAW',
        resource: {
          values: [[
            'Broadcast ID', 
            'Message', 
            'Timestamp', 
            'Recipient User', 
            'Recipient Chat ID', 
            'Status', 
            'Acknowledged At'
          ]],
        },
      });

      console.log(`Added headers to ${BROADCAST_TAB} tab`);
    } else {
      console.log(`${BROADCAST_TAB} tab already exists`);
    }

    return true;

  } catch (error) {
    console.error('Error initializing Broadcasts tab:', error.message);
    
    // More specific error handling
    if (error.message.includes('not found')) {
      console.error('Spreadsheet not found. Please check BROADCAST_SPREADSHEET_ID');
    } else if (error.message.includes('permission')) {
      console.error('Permission denied. Please check service account permissions');
    } else if (error.message.includes('quota')) {
      console.error('API quota exceeded. Please try again later');
    }
    
    throw error;
  }
}

const TIME_SLOT_MAPPINGS = {
  'Morning': {
    slotStart: '06:00',
    slotEnd: '15:00',
    description: 'Morning checklist period: 6 AM - 3 PM'
  },
  'Mid Day': {
    slotStart: '15:00',
    slotEnd: '18:00',
    description: 'Mid Day checklist period: 3 PM - 6 PM'
  },
  'Closing': {
    slotStart: '18:00',
    slotEnd: '06:00',  // Next day morning
    description: 'Closing checklist period: 6 PM - 6 AM (overnight)'
  }
};

/**
 * Helper function to check if a shift overlaps with a time slot
 */
function isEmployeeWorkingDuringTimeSlot(shiftStart, shiftEnd, timeSlot) {
  if (!shiftStart || !shiftEnd) return false;
  
  const start = shiftStart.substring(0, 5);
  const end = shiftEnd.substring(0, 5);
  
  // MORNING SLOT (06:00 - 15:00)
  if (timeSlot === 'Morning') {
    return start < '15:00' && end > '06:00';
  }
  
  // MID DAY SLOT (15:00 - 18:00)
  if (timeSlot === 'Mid Day') {
    return (start < '18:00' && end > '15:00') || 
           (start < '18:00' && end >= '00:00' && end <= '06:00');
  }
  
  // CLOSING SLOT (18:00 - 06:00 next day)
  if (timeSlot === 'Closing') {
    return (start < '23:59' && end > '18:00') || 
           (end >= '00:00' && end <= '06:00');
  }
  
  return false;
}

/**
 * Calculate time distance between shift and time slot
 * Returns number of hours between them (lower is closer)
 */
function calculateTimeDistance(shiftStart, shiftEnd, timeSlot) {
  const start = shiftStart.substring(0, 5);
  const end = shiftEnd.substring(0, 5);
  
  const slotStart = TIME_SLOT_MAPPINGS[timeSlot].slotStart;
  const slotEnd = TIME_SLOT_MAPPINGS[timeSlot].slotEnd;
  
  // Convert time to minutes for calculation
  const toMinutes = (time) => {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  };
  
  const shiftStartMin = toMinutes(start);
  const shiftEndMin = toMinutes(end);
  const slotStartMin = toMinutes(slotStart);
  
  // Calculate distance from shift start to slot start
  let distance = Math.abs(shiftStartMin - slotStartMin);
  
  // If shift ends during slot, distance is 0
  if (isEmployeeWorkingDuringTimeSlot(shiftStart, shiftEnd, timeSlot)) {
    return 0;
  }
  
  return distance;
}

/**
 * Get employees scheduled for a specific outlet and time slot on a given date
 * WITH FALLBACK TO NEAREST EMPLOYEE IF SLOT IS EMPTY
 */
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes
const rosterCache = {
  employees: { data: null, timestamp: null },
  roster: { data: null, timestamp: null }
};

function isCacheValid(cacheEntry) {
  if (!cacheEntry.data || !cacheEntry.timestamp) return false;
  return (Date.now() - cacheEntry.timestamp) < CACHE_DURATION;
}

async function getScheduledEmployees(outlet, timeSlot, date) {
  try {
    if (!sheets) {
      const initialized = await initializeGoogleServices();
      if (!initialized) {
        console.error('❌ Failed to initialize Google APIs for roster fetch');
        return [];
      }
    }

    // ================================
    // FETCH EMPLOYEE REGISTER (WITH CACHE)
    // ================================
    const EMPLOYEE_REGISTER_SHEET_ID = '1FYXr8Wz0ddN3mFi-0AQbI6J_noi2glPbJLh44CEMUnE';
    const EMPLOYEE_REGISTER_SHEET_NAME = 'EmployeeRegister';

    let empMap;

    if (isCacheValid(rosterCache.employees)) {
      empMap = rosterCache.employees.data;
    } else {
      const empResponse = await sheets.spreadsheets.values.get({
        spreadsheetId: EMPLOYEE_REGISTER_SHEET_ID,
        range: `${EMPLOYEE_REGISTER_SHEET_NAME}!A:C`,
      });

      const empData = empResponse.data.values || [];
      empMap = new Map();

      for (let i = 1; i < empData.length; i++) {
        const [empId, fullName, shortName] = empData[i];
        if (empId && shortName) {
          empMap.set(empId.trim().toUpperCase(), shortName.trim());
        }
      }

      rosterCache.employees = {
        data: empMap,
        timestamp: Date.now()
      };
    }

    // ================================
    // FETCH ROSTER DATA (WITH CACHE)
    // ================================
    let rosterData;

    if (isCacheValid(rosterCache.roster)) {
      rosterData = rosterCache.roster.data;
    } else {
      const rosterResponse = await sheets.spreadsheets.values.get({
        spreadsheetId: ROSTER_SPREADSHEET_ID,
        range: `${ROSTER_TAB}!A:Z`,
      });

      rosterData = rosterResponse.data.values || [];

      rosterCache.roster = {
        data: rosterData,
        timestamp: Date.now()
      };
    }

    if (rosterData.length <= 1) {
      return [];
    }

    // ================================
    // PROCESS ROSTER DATA
    // ================================
    const headers = rosterData[0].map(h => h.toString().trim());

    const employeeIdIndex = headers.findIndex(h => h.toLowerCase().includes('employee id'));
    const dateColIndex = headers.findIndex(h => h.toLowerCase() === 'date');
    const outletColIndex = headers.findIndex(h => h.toLowerCase() === 'outlet');
    const shiftColIndex = headers.findIndex(h => h.toLowerCase() === 'shift');
    const startTimeIndex = headers.findIndex(h => h.toLowerCase() === 'start time');
    const endTimeIndex = headers.findIndex(h => h.toLowerCase() === 'end time');

    if (dateColIndex === -1 || outletColIndex === -1 || startTimeIndex === -1 || endTimeIndex === -1) {
      console.error('❌ Could not find required columns in roster');
      return [];
    }

    // ================================
    // FILTER MATCHES WITH OVERLAP DETECTION
    // ================================
    const scheduledEmployees = [];
    const allOutletEmployees = []; // Track ALL employees at this outlet for fallback
    const targetDate = formatDate(date);

    for (let i = 1; i < rosterData.length; i++) {
      const row = rosterData[i];
      if (!row || row.length === 0) continue;

      const rosterDate = formatDate(getCellValue(row, dateColIndex));
      const rosterOutlet = getCellValue(row, outletColIndex)?.toUpperCase();
      const startTime = getCellValue(row, startTimeIndex);
      const endTime = getCellValue(row, endTimeIndex);
      const employeeId = employeeIdIndex !== -1 ? getCellValue(row, employeeIdIndex)?.trim() : '';
      const shift = shiftColIndex !== -1 ? getCellValue(row, shiftColIndex) : '';

      const dateMatch = rosterDate === targetDate;
      const outletMatch = rosterOutlet === outlet.toUpperCase();
      
      // Track all employees at this outlet on this date
      if (dateMatch && outletMatch) {
        const shortName = empMap.get(employeeId?.toUpperCase()) || employeeId || 'Unknown';
        
        allOutletEmployees.push({
          employeeId: employeeId,
          name: shortName,
          outlet: rosterOutlet,
          shift: shift,
          startTime: startTime,
          endTime: endTime,
          date: rosterDate,
          distance: calculateTimeDistance(startTime, endTime, timeSlot)
        });
      }

      // Check if employee is working during this time slot
      const isWorking = isEmployeeWorkingDuringTimeSlot(startTime, endTime, timeSlot);

      if (dateMatch && outletMatch && isWorking) {
        const shortName = empMap.get(employeeId?.toUpperCase()) || employeeId || 'Unknown';

        scheduledEmployees.push({
          employeeId: employeeId,
          name: shortName,
          outlet: rosterOutlet,
          timeSlot: timeSlot,
          shift: shift,
          startTime: startTime,
          endTime: endTime,
          date: rosterDate,
          isFallback: false
        });
      }
    }

    // ================================
    // FALLBACK: If no employees found, use nearest employee
    // ================================
    if (scheduledEmployees.length === 0 && allOutletEmployees.length > 0) {
      console.log(`⚠️  No employees working during ${timeSlot} at ${outlet}`);
      console.log(`🔄 Using nearest employee as fallback...`);
      
      // Sort by time distance (closest first)
      allOutletEmployees.sort((a, b) => a.distance - b.distance);
      
      const nearestEmployee = allOutletEmployees[0];
      
      scheduledEmployees.push({
        employeeId: nearestEmployee.employeeId,
        name: nearestEmployee.name,
        outlet: nearestEmployee.outlet,
        timeSlot: timeSlot,
        shift: nearestEmployee.shift,
        startTime: nearestEmployee.startTime,
        endTime: nearestEmployee.endTime,
        date: nearestEmployee.date,
        isFallback: true,
        fallbackReason: `Nearest employee (works ${nearestEmployee.startTime}-${nearestEmployee.endTime})`
      });
      
      console.log(`   ✅ Added ${nearestEmployee.name} as fallback`);
    }

    // ================================
    // SUMMARY LOG
    // ================================
    console.log(`\n🔍 Roster Query: ${outlet} / ${timeSlot} / ${date}`);
    console.log(`✅ Found ${scheduledEmployees.length} employee(s)`);
    
    if (scheduledEmployees.some(e => e.isFallback)) {
      console.log(`ℹ️  Includes fallback employee (not working during exact time slot)`);
    }
    console.log('');

    return scheduledEmployees;
  } catch (error) {
    console.error('❌ Error fetching scheduled employees:', error.message);
    return [];
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
function formatDate(dateInput) {
  if (!dateInput) return '';
  
  if (typeof dateInput === 'string' && dateInput.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return dateInput;
  }
  
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '';
  
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

function getCellValue(row, index) {
  if (index === -1 || !row || !row[index]) return '';
  return row[index].toString().trim();
}


// Add these functions after initializeBroadcastTab()

// Initialize User Mapping tab
async function initializeUserMappingTab() {
  try {
    if (!sheets) {
      console.error('Google Sheets not initialized');
      throw new Error('Google Sheets service not available');
    }

    const response = await sheets.spreadsheets.get({
      spreadsheetId: CHECKLIST_SPREADSHEET_ID,
      ranges: [],
      includeGridData: false,
    });

    const sheetExists = response.data.sheets.some(sheet => 
      sheet.properties.title === USER_MAPPING_TAB
    );

    if (!sheetExists) {
      console.log(`Creating ${USER_MAPPING_TAB} tab`);
      
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: CHECKLIST_SPREADSHEET_ID,
        resource: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: USER_MAPPING_TAB,
                },
              },
            },
          ],
        },
      });

      await new Promise(resolve => setTimeout(resolve, 1000));
      
      await sheets.spreadsheets.values.update({
        spreadsheetId: CHECKLIST_SPREADSHEET_ID,
        range: `${USER_MAPPING_TAB}!A1:C1`,
        valueInputOption: 'RAW',
        resource: {
          values: [['Employee Name', 'Telegram Chat ID', 'Telegram Username']],
        },
      });

      console.log(`Created ${USER_MAPPING_TAB} tab with headers`);
    }

    return true;
  } catch (error) {
    console.error('Error initializing User Mapping tab:', error.message);
    throw error;
  }
}

// Get user's Telegram Chat ID from mapping
async function getUserChatId(employeeName) {
  try {
    await initializeUserMappingTab();
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: CHECKLIST_SPREADSHEET_ID,
      range: `${USER_MAPPING_TAB}!A:C`
    });

    const rows = response.data.values || [];
    
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row[0] && row[0].toLowerCase().trim() === employeeName.toLowerCase().trim()) {
        return row[1]; // Return Chat ID
      }
    }
    
    console.warn(`No Telegram Chat ID found for employee: ${employeeName}`);
    return null;
  } catch (error) {
    console.error('Error getting user chat ID:', error.message);
    return null;
  }
}

// Handle ticket approval from Telegram
async function handleTicketApproval(ticketId, action, chatId) {
  try {
    console.log(`Processing ticket ${action} for ticket ${ticketId} from chat ${chatId}`);
    
    const TICKET_SPREADSHEET_ID = '1FYXr8Wz0ddN3mFi-0AQbI6J_noi2glPbJLh44CEMUnE';
    const TICKET_TAB = 'Tickets';

    // Get ticket details
    const ticketsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: TICKET_SPREADSHEET_ID,
      range: `${TICKET_TAB}!A:K`,
    });

    const ticketsData = ticketsResponse.data.values || [];
    let targetRow = -1;
    let ticketDetails = null;

    for (let i = 1; i < ticketsData.length; i++) {
      if (ticketsData[i] && ticketsData[i][0] === ticketId) {
        targetRow = i + 1;
        ticketDetails = {
          ticketId: ticketsData[i][0],
          outlet: ticketsData[i][2],
          submittedBy: ticketsData[i][3],
          assignedTo: ticketsData[i][8],
          actionTaken: ticketsData[i][9]
        };
        break;
      }
    }

    if (targetRow === -1) {
      throw new Error(`Ticket ${ticketId} not found`);
    }

    let newStatus, responseMessage;
    
    if (action === 'approve') {
      newStatus = 'Closed';
      responseMessage = `✅ Ticket ${ticketId} has been approved and closed. Thank you!`;
      
      // Notify assignee that ticket was approved
      const assigneeChatId = await getUserChatId(ticketDetails.assignedTo);
      if (assigneeChatId && ticketBot) {
        const assigneeMessage = `🎉 TICKET APPROVED & CLOSED

📋 Ticket ID: ${ticketId}
🏪 Outlet: ${ticketDetails.outlet}
✅ Status: Approved by ${ticketDetails.submittedBy}

Your resolution has been approved. Great work!`;

        try {
          await ticketBot.sendMessage(assigneeChatId, assigneeMessage);
          console.log(`Approval notification sent to ${ticketDetails.assignedTo}`);
        } catch (notifyError) {
          console.error(`Failed to notify assignee about approval: ${notifyError.message}`);
        }
      }
    } else if (action === 'reject') {
      newStatus = 'Open';
      responseMessage = `❌ Ticket ${ticketId} has been rejected and reopened. Please check the dashboard for details.`;
      
      // Notify assignee that ticket was rejected
      const assigneeChatId = await getUserChatId(ticketDetails.assignedTo);
      if (assigneeChatId && ticketBot) {
        const assigneeMessage = `🔄 TICKET REJECTED - NEEDS REWORK

📋 Ticket ID: ${ticketId}
🏪 Outlet: ${ticketDetails.outlet}
❌ Status: Rejected by ${ticketDetails.submittedBy}

Please review and provide a better resolution. The ticket has been reopened and needs your attention.`;

        try {
          await ticketBot.sendMessage(assigneeChatId, assigneeMessage);
          console.log(`Rejection notification sent to ${ticketDetails.assignedTo}`);
        } catch (notifyError) {
          console.error(`Failed to notify assignee about rejection: ${notifyError.message}`);
        }
      }
    } else {
      throw new Error(`Invalid action: ${action}. Expected 'approve' or 'reject'.`);
    }

    // Update ticket status
    await sheets.spreadsheets.values.update({
      spreadsheetId: TICKET_SPREADSHEET_ID,
      range: `${TICKET_TAB}!H${targetRow}`,
      valueInputOption: 'RAW',
      resource: {
        values: [[newStatus]]
      }
    });

    console.log(`Ticket ${ticketId} ${action === 'approve' ? 'approved and closed' : 'rejected and reopened'} by user ${chatId}`);
    return responseMessage;

  } catch (error) {
    console.error('Error handling ticket approval:', error.message);
    console.error('Full error:', error);
    return `Error processing ${action} for ticket ${ticketId}. Please try again or contact support.`;
  }
}

// Telegram Bot initialization with proper conflict resolution
async function initializeTelegramBot() {
  if (!TELEGRAM_BOT_TOKEN) {
    console.log('Telegram Bot Token not provided - broadcast functionality disabled');
    return null;
  }

  if (!ENABLE_TELEGRAM_BOT) {
    console.log('Telegram Bot disabled by environment variable');
    return null;
  }

  try {
    console.log('Initializing Telegram Bot...');
    
    // First, try to clear any existing webhook to avoid conflicts
    try {
      const tempBot = new TelegramBot(TELEGRAM_BOT_TOKEN);
      await tempBot.deleteWebHook();
      console.log('Cleared any existing webhooks');
    } catch (webhookError) {
      // Ignore webhook errors - they're expected if no webhook exists
    }

    // Wait a bit before starting polling
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Initialize bot with polling
    const newBot = new TelegramBot(TELEGRAM_BOT_TOKEN, {
      polling: {
        interval: 2000, // Check every 2 seconds
        autoStart: false, // Don't start automatically
        params: {
          timeout: 20, // 20 second timeout for long polling
        }
      }
    });

    // Set up error handlers before starting polling
    newBot.on('polling_error', (error) => {
      console.log('Telegram polling error:', error.message);
      
      // Handle 409 conflicts specifically
      if (error.message.includes('409') && error.message.includes('Conflict')) {
        console.log('Bot conflict detected - attempting recovery in 10 seconds...');
        setTimeout(async () => {
          if (!isShuttingDown) {
            await restartBotPolling(newBot);
          }
        }, 10000);
      }
    });

    newBot.on('webhook_error', (error) => {
      console.log('Telegram webhook error:', error.message);
    });

    // Start polling with retry logic
    await startPollingWithRetry(newBot);
    
    // Set up callback query handler
    setupCallbackQueryHandler(newBot);
    
    console.log('Telegram Bot initialized successfully');
    return newBot;

  } catch (error) {
    console.error('Failed to initialize Telegram Bot:', error.message);
    return null;
  }
}

// ADD this new function after initializeTelegramBot():
async function initializeTicketBot() {
  if (!CO_BOT_TOKEN) {
    console.log('Ticket Bot Token not provided - ticket notifications disabled');
    return null;
  }

  if (!ENABLE_TELEGRAM_BOT) {
    console.log('Telegram bots disabled by environment variable');
    return null;
  }

  try {
    console.log('Initializing Ticket Bot...');
    
    // Clear any existing webhook for this bot
    try {
      const tempBot = new TelegramBot(CO_BOT_TOKEN);
      await tempBot.deleteWebHook();
      console.log('Cleared any existing webhooks for ticket bot');
    } catch (webhookError) {
      // Ignore webhook errors
    }

    await new Promise(resolve => setTimeout(resolve, 2000));

    const newTicketBot = new TelegramBot(CO_BOT_TOKEN, {
      polling: {
        interval: 2000,
        autoStart: false,
        params: {
          timeout: 20,
        }
      }
    });

    // Set up error handlers
    newTicketBot.on('polling_error', (error) => {
      console.log('Ticket bot polling error:', error.message);
    });

    newTicketBot.on('webhook_error', (error) => {
      console.log('Ticket bot webhook error:', error.message);
    });

    await startPollingWithRetry(newTicketBot);
    
    console.log('Ticket Bot initialized successfully');
    return newTicketBot;

  } catch (error) {
    console.error('Failed to initialize Ticket Bot:', error.message);
    return null;
  }
}

async function initializeCriticalStockBot() {
  if (!CRITICAL_STOCK_BOT_TOKEN) {
    console.log('Critical Stock Bot Token not provided - critical alerts disabled');
    return null;
  }

  if (!ENABLE_TELEGRAM_BOT) {
    console.log('Telegram bots disabled by environment variable');
    return null;
  }

  try {
    console.log('Initializing Critical Stock Bot...');
    
    // Clear any existing webhook for this bot - IMPORTANT
    try {
      const tempBot = new TelegramBot(CRITICAL_STOCK_BOT_TOKEN);
      await tempBot.deleteWebHook();
      console.log('Cleared any existing webhooks for critical stock bot');
      
      // Close the temporary bot
      tempBot.close && tempBot.close();
    } catch (webhookError) {
      console.log('Webhook cleanup completed (no webhook existed)');
    }

    // Wait longer before creating the real bot to avoid conflicts
    await new Promise(resolve => setTimeout(resolve, 3000));

    const newCriticalBot = new TelegramBot(CRITICAL_STOCK_BOT_TOKEN, {
      polling: {
        interval: 3000, // Slower polling to reduce conflicts
        autoStart: false,
        params: {
          timeout: 20,
        }
      }
    });

    // Set up error handlers BEFORE starting polling
    newCriticalBot.on('polling_error', (error) => {
      console.log('Critical stock bot polling error:', error.message);
      
      // Handle 409 conflicts specifically
      if (error.message.includes('409') && error.message.includes('Conflict')) {
        console.log('Critical stock bot conflict detected - attempting recovery in 15 seconds...');
        setTimeout(async () => {
          if (!isShuttingDown) {
            await restartCriticalBotPolling(newCriticalBot);
          }
        }, 15000); // Longer wait for critical bot
      }
    });

    newCriticalBot.on('webhook_error', (error) => {
      console.log('Critical stock bot webhook error:', error.message);
    });

    // Start polling with retry logic
    await startPollingWithRetry(newCriticalBot, 5); // More retries
    
    console.log('Critical Stock Bot initialized successfully');
    return newCriticalBot;

  } catch (error) {
    console.error('Failed to initialize Critical Stock Bot:', error.message);
    return null;
  }
}
// Replace the sendCriticalStockAlerts function with this improved version:

async function sendCriticalStockAlerts() {
  if (!criticalStockBot) {
    console.log('Critical Stock Bot not available');
    return;
  }

  try {
    console.log('🔍 Checking for critical stock items...');

    if (!sheets) {
      const initialized = await initializeGoogleServices();
      if (!initialized) {
        throw new Error('Failed to initialize Google APIs');
      }
    }

    const STOCK_SPREADSHEET_ID = '12kfAZX7gV0UszUHhTI9i9iy8OObJ0Uc_8fJC18O1ILg';

    // Step 1: Get critical items from MasterSheet
    const masterResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: STOCK_SPREADSHEET_ID,
      range: `MasterSheet!A:C`,
    });

    const masterData = masterResponse.data.values || [];
    const criticalItems = [];

    for (let i = 1; i < masterData.length; i++) {
      const row = masterData[i];
      if (row && row[0] && row[1] && row[2]) {
        const skuCode = row[0].toString().trim();
        const longName = row[1].toString().trim();
        const critical = row[2].toString().trim().toLowerCase();
        
        if (critical === 'yes') {
          criticalItems.push({ skuCode, longName });
        }
      }
    }

    console.log(`Found ${criticalItems.length} critical items in MasterSheet`);

    if (criticalItems.length === 0) {
      console.log('No critical items to alert about');
      return;
    }

    // Step 2: Get recent tracker data (last 24 hours)
    const TRACKER_TAB = 'Copy of Tracker';
    const trackerResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: STOCK_SPREADSHEET_ID,
      range: `${TRACKER_TAB}!A:D`,
    });

    const trackerData = trackerResponse.data.values || [];
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Step 3: Find critical items that are recently out of stock
    const alertsToSend = [];

    for (const criticalItem of criticalItems) {
      const affectedOutlets = new Set();

      for (let i = 1; i < trackerData.length; i++) {
        const row = trackerData[i];
        if (row && row[1] && row[2] && row[3]) {
          const time = row[1].toString().trim();
          const outlet = row[2].toString().trim();
          const items = row[3].toString().trim();

          try {
            const entryDate = parseTrackerDateSimple(time);
            if (entryDate >= yesterday) {
              if (containsExactItem(items, criticalItem.longName)) {
                affectedOutlets.add(outlet);
              }
            }
          } catch (dateError) {
            // Skip entries with bad dates
          }
        }
      }

      if (affectedOutlets.size > 0) {
        alertsToSend.push({
          item: criticalItem,
          outlets: Array.from(affectedOutlets)
        });
      }
    }

    console.log(`Preparing ${alertsToSend.length} critical stock alerts`);

    // Step 4: Send alerts with rate limiting
    if (alertsToSend.length > 0) {
      await sendAlertsWithRateLimit(alertsToSend);
    }

  } catch (error) {
    console.error('Error checking critical stock:', error.message);
  }
}

// NEW: Rate-limited alert sending
async function sendAlertsWithRateLimit(alerts) {
  try {
    // Create alert message
    let alertMessage = '🚨 CRITICAL STOCK ALERT 🚨\n\n';
    alertMessage += 'The following CRITICAL items are out of stock:\n\n';

    alerts.forEach((alert, index) => {
      alertMessage += `${index + 1}. 📦 ${alert.item.longName}\n`;
      alertMessage += `   SKU: ${alert.item.skuCode}\n`;
      alertMessage += `   🏪 Outlets: ${alert.outlets.join(', ')}\n\n`;
    });

    alertMessage += '⚠️ Please take immediate action to restock these critical items.\n';
    alertMessage += `🕒 Alert sent at: ${new Date().toLocaleString()}`;

    // OPTION 1: Send to group (ONE MESSAGE ONLY)
    if (SEND_TO_GROUP && CRITICAL_STOCK_GROUP_ID) {
      console.log('Sending critical stock alert to group...');
      try {
        await criticalStockBot.sendMessage(CRITICAL_STOCK_GROUP_ID, alertMessage);
        console.log('✅ Critical stock alert sent to group successfully');
        return; // EXIT EARLY - don't send to individual users
      } catch (groupError) {
        console.error('Failed to send to group:', groupError.message);
        // Don't fall back to individual users to avoid rate limits
        return;
      }
    }

    // OPTION 2: Send to individual users (ONLY if group sending failed)
    console.log('Sending critical stock alerts to individual users...');
    
    await initializeUserMappingTab();
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: CHECKLIST_SPREADSHEET_ID,
      range: `${USER_MAPPING_TAB}!A:C`
    });

    const rows = response.data.values || [];
    const users = [];

    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] && rows[i][1]) {
        users.push({
          name: rows[i][0],
          chatId: rows[i][1]
        });
      }
    }

    if (users.length === 0) {
      console.log('No individual users to send critical stock alerts to');
      return;
    }

    // IMPORTANT: Add delay between messages to avoid rate limits
    for (const user of users) {
      try {
        await criticalStockBot.sendMessage(user.chatId, alertMessage);
        console.log(`✅ Alert sent to ${user.name}`);
        
        // CRITICAL: Wait 1 second between messages to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (sendError) {
        // Handle rate limit errors gracefully
        if (sendError.message.includes('429')) {
          console.error(`⚠️ Rate limit hit, stopping alerts to avoid bot shutdown`);
          break; // Stop sending to avoid triggering rate limits
        }
        console.error(`Failed to send alert to ${user.name}: ${sendError.message}`);
      }
    }

    console.log('Critical stock alerts sending complete');

  } catch (error) {
    console.error('Error sending critical stock alerts:', error.message);
  }
}

// ADD THIS FUNCTION AFTER sendCriticalStockAlerts()
async function sendAlertsToAllUsers(alerts) {
  try {
    // Create alert message
    let alertMessage = '🚨 CRITICAL STOCK ALERT 🚨\n\n';
    alertMessage += 'The following CRITICAL items are out of stock:\n\n';

    alerts.forEach((alert, index) => {
      alertMessage += `${index + 1}. 📦 ${alert.item.longName}\n`;
      alertMessage += `   SKU: ${alert.item.skuCode}\n`;
      alertMessage += `   🏪 Outlets: ${alert.outlets.join(', ')}\n\n`;
    });

    alertMessage += '⚠️ Please take immediate action to restock these critical items.\n';
    alertMessage += `🕒 Alert sent at: ${new Date().toLocaleString()}`;

    // OPTION 1: Send to group if configured
    if (SEND_TO_GROUP && CRITICAL_STOCK_GROUP_ID) {
      console.log('Sending critical stock alert to group...');
      try {
        await criticalStockBot.sendMessage(CRITICAL_STOCK_GROUP_ID, alertMessage, {
          parse_mode: 'HTML'
        });
        console.log('Critical stock alert sent to group successfully');
        return;
      } catch (groupError) {
        console.error('Failed to send to group:', groupError.message);
        console.log('Falling back to individual users...');
      }
    }

    // OPTION 2: Send to individual users (fallback or if group is disabled)
    console.log('Sending critical stock alerts to individual users...');
    
    // Get all user mappings
    await initializeUserMappingTab();
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: CHECKLIST_SPREADSHEET_ID,
      range: `${USER_MAPPING_TAB}!A:C`
    });

    const rows = response.data.values || [];
    const users = [];

    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] && rows[i][1]) {
        users.push({
          name: rows[i][0],
          chatId: rows[i][1]
        });
      }
    }

    if (users.length === 0) {
      console.log('No individual users to send critical stock alerts to');
      return;
    }

    // Send to all individual users
    for (const user of users) {
      try {
        await criticalStockBot.sendMessage(user.chatId, alertMessage, {
          parse_mode: 'HTML'
        });
        console.log(`Critical stock alert sent to ${user.name}`);
        
        // Small delay between messages
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (sendError) {
        console.error(`Failed to send alert to ${user.name}: ${sendError.message}`);
      }
    }

    console.log('Critical stock alerts sent to individual users');

  } catch (error) {
    console.error('Error sending critical stock alerts:', error.message);
  }
}

// UPDATE THE EXISTING initializeServicesWithTickets() FUNCTION 
// FIND THIS FUNCTION (around line 330) AND ADD THE CRITICAL BOT INITIALIZATION:
async function initializeServicesWithTickets() {
  console.log('Initializing services with ticket workflow...');
  
  const googleInitialized = await initializeGoogleServices();
  if (!googleInitialized) {
    console.error('Failed to initialize Google Services');
  }
  
  // Initialize original bot
  bot = await initializeTelegramBot();
  
  // Initialize separate ticket bot
  ticketBot = await initializeTicketBot();
  
  // ADD THIS LINE - Initialize critical stock bot
  criticalStockBot = await initializeCriticalStockBot();
  
  // SET UP CALLBACK HANDLERS ON ALL BOTS
  if (bot) {
    setupCallbackQueryHandler(bot);
    console.log('Callback handler set up on main bot');
  }
  
  if (ticketBot) {
    setupCallbackQueryHandler(ticketBot);
    console.log('Callback handler set up on ticket bot');
  }
  
  // ADD THIS BLOCK
  if (criticalStockBot) {
    console.log('Critical Stock Bot ready for alerts');
  }
  
  // Initialize user mapping tab
  try {
    await initializeUserMappingTab();
    console.log('User mapping tab initialized');
  } catch (error) {
    console.error('Failed to initialize user mapping tab:', error.message);
  }
  
  console.log('Service initialization complete with ticket workflow and critical stock alerts');
}

// UPDATE THE EXISTING gracefulShutdown() FUNCTION 
// FIND THIS FUNCTION (around line 400) AND ADD CRITICAL BOT SHUTDOWN:
// Replace the gracefulShutdown function with this improved version:

async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  
  console.log(`\n${signal} received, shutting down gracefully...`);
  
  try {
    // Clear any scheduled intervals FIRST
    if (global.criticalStockInterval) {
      clearInterval(global.criticalStockInterval);
      console.log('Critical stock schedule cleared');
    }
    
    // Stop bots with error handling for rate limits
    if (bot) {
      console.log('Stopping original Telegram bot...');
      try {
        await Promise.race([
          bot.stopPolling(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
        ]);
        console.log('Original Telegram bot stopped');
      } catch (error) {
        console.log(`Original bot stop warning: ${error.message} (continuing shutdown)`);
      }
    }
    
    if (ticketBot) {
      console.log('Stopping ticket Telegram bot...');
      try {
        await Promise.race([
          ticketBot.stopPolling(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
        ]);
        console.log('Ticket Telegram bot stopped');
      } catch (error) {
        console.log(`Ticket bot stop warning: ${error.message} (continuing shutdown)`);
      }
    }
    
    if (criticalStockBot) {
      console.log('Stopping critical stock Telegram bot...');
      try {
        await Promise.race([
          criticalStockBot.stopPolling(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
        ]);
        console.log('Critical stock Telegram bot stopped');
      } catch (error) {
        console.log(`Critical bot stop warning: ${error.message} (continuing shutdown)`);
      }
    }
    
    console.log('Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error.message);
    process.exit(1);
  }
}
// ADD THIS API ENDPOINT TO MANUALLY TRIGGER CRITICAL STOCK CHECK
app.post('/api/check-critical-stock', async (req, res) => {
  try {
    console.log('Manual critical stock check requested');
    await sendCriticalStockAlerts();
    
    res.json({
      success: true,
      message: 'Critical stock check completed',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in manual critical stock check:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ADD THIS API ENDPOINT TO SET UP AUTOMATIC SCHEDULING (OPTIONAL)
// UPDATED ENDPOINTS - Replace your existing critical stock endpoints with these:

// Manual trigger for critical stock check
app.post('/api/check-critical-stock', async (req, res) => {
  try {
    console.log('Manual critical stock check requested');
    
    if (!criticalStockBot) {
      return res.status(503).json({
        success: false,
        error: 'Critical Stock Bot is not available. Please check bot configuration.'
      });
    }
    
    await sendCriticalStockAlerts();
    
    res.json({
      success: true,
      message: 'Critical stock check completed and alerts sent if needed',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in manual critical stock check:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Set up automatic scheduling for critical stock alerts (NOW SUPPORTS 30 MINUTES)
app.post('/api/schedule-critical-alerts', async (req, res) => {
  try {
    const { intervalMinutes = 30 } = req.body; // Default check every 30 minutes
    
    if (!criticalStockBot) {
      return res.status(503).json({
        success: false,
        error: 'Critical Stock Bot is not available. Please check bot configuration.'
      });
    }
    
    // Validate interval (minimum 10 minutes, maximum 24 hours)
    if (intervalMinutes < 10 || intervalMinutes > 1440) {
      return res.status(400).json({
        success: false,
        error: 'Interval must be between 10 minutes and 1440 minutes (24 hours)'
      });
    }
    
    // Clear existing interval if any
    if (global.criticalStockInterval) {
      clearInterval(global.criticalStockInterval);
      console.log('Cleared existing critical stock schedule');
    }
    
    // Set up new interval
    global.criticalStockInterval = setInterval(async () => {
      console.log(`Scheduled critical stock check - every ${intervalMinutes} minutes`);
      try {
        await sendCriticalStockAlerts();
      } catch (error) {
        console.error('Error in scheduled critical stock check:', error.message);
      }
    }, intervalMinutes * 60 * 1000); // Convert minutes to milliseconds
    
    console.log(`Critical stock alerts scheduled every ${intervalMinutes} minutes`);
    
    res.json({
      success: true,
      message: `Critical stock alerts scheduled every ${intervalMinutes} minutes`,
      intervalMinutes: intervalMinutes,
      nextCheckTime: new Date(Date.now() + (intervalMinutes * 60 * 1000)).toISOString(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error scheduling critical alerts:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get current critical stock schedule status
app.get('/api/critical-stock-status', (req, res) => {
  try {
    const hasSchedule = !!global.criticalStockInterval;
    
    res.json({
      success: true,
      botStatus: criticalStockBot ? 'Connected' : 'Not Connected',
      scheduledAlerts: hasSchedule ? 'Active' : 'Not Scheduled',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Stop scheduled critical stock alerts
app.post('/api/stop-critical-alerts', (req, res) => {
  try {
    if (global.criticalStockInterval) {
      clearInterval(global.criticalStockInterval);
      global.criticalStockInterval = null;
      console.log('Critical stock alerts schedule stopped');
      
      res.json({
        success: true,
        message: 'Critical stock alerts schedule stopped',
        timestamp: new Date().toISOString()
      });
    } else {
      res.json({
        success: true,
        message: 'No active schedule to stop',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

async function startPollingWithRetry(botInstance, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await botInstance.stopPolling();
      await new Promise(resolve => setTimeout(resolve, 1000));
      await botInstance.startPolling();
      console.log('Bot polling started successfully');
      return;
    } catch (error) {
      console.error(`Polling attempt ${i + 1} failed:`, error.message);
      if (i === maxRetries - 1) {
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 3000 * (i + 1))); // Increasing delay
    }
  }
}

async function restartBotPolling(botInstance) {
  try {
    console.log('Attempting to restart bot polling...');
    await botInstance.stopPolling();
    await new Promise(resolve => setTimeout(resolve, 3000));
    await startPollingWithRetry(botInstance);
    console.log('Bot polling restarted successfully');
  } catch (error) {
    console.error('Failed to restart bot polling:', error.message);
  }
}



// REPLACE the existing setupCallbackQueryHandler function with this:
function setupCallbackQueryHandler(botInstance) {
  botInstance.on('callback_query', async (query) => {
    try {
      const { data, from, message } = query;
      
      if (!data) return;
      
      let responseText = '';
      
      if (data.startsWith('ack_ticket_')) {
        // Handle ticket acknowledgment
        const parts = data.split('_');
        const ticketId = parts[2];
        
        responseText = `✅ Ticket ${ticketId} acknowledged. Please resolve and update the status in the dashboard.`;
        
        // Remove the button
        try {
          await botInstance.editMessageReplyMarkup(null, {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id
          });
        } catch (editError) {
          console.warn('Could not remove acknowledge button:', editError.message);
        }
        
      } else if (data.startsWith('approve_ticket_') || data.startsWith('reject_ticket_')) {
        // Handle ticket approval/rejection
        const parts = data.split('_');
        const action = parts[0]; // 'approve' or 'reject'
        const ticketId = parts[2];
        const chatId = parts[3];
        
        responseText = await handleTicketApproval(ticketId, action, chatId);
        
        // Remove the approval buttons
        try {
          await botInstance.editMessageReplyMarkup(null, {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id
          });
        } catch (editError) {
          console.warn('Could not remove approval buttons:', editError.message);
        }
        
      } else if (data.startsWith('ack_')) {
        // Handle broadcast acknowledgment (existing functionality)
        const parts = data.split('_');
        if (parts.length < 3) {
          console.error('Invalid callback data format:', data);
          return;
        }
        
        const broadcastId = parts[1];
        const chatId = parts[2];
        
        console.log(`Acknowledgment received from ${from.first_name || from.username || 'Unknown'} for broadcast ${broadcastId}`);
        
        // Ensure Google Sheets is initialized
        if (!sheets) {
          const initialized = await initializeGoogleServices();
          if (!initialized) {
            throw new Error('Failed to initialize Google APIs');
          }
        }
        
        // Update Google Sheets
        try {
          const response = await sheets.spreadsheets.values.get({
            spreadsheetId: BROADCAST_SPREADSHEET_ID,
            range: `${BROADCAST_TAB}!A:G`
          });
          
          const rows = response.data.values || [];
          
          // Find the row to update
          let rowFound = false;
          for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (row[0] === broadcastId && row[4] === chatId) {
              // Update status and acknowledged time
              await sheets.spreadsheets.values.update({
                spreadsheetId: BROADCAST_SPREADSHEET_ID,
                range: `${BROADCAST_TAB}!F${i + 1}:G${i + 1}`,
                valueInputOption: 'RAW',
                resource: {
                  values: [['Acknowledged', new Date().toISOString()]]
                }
              });
              rowFound = true;
              break;
            }
          }
          
          if (!rowFound) {
            console.warn(`Row not found for broadcast ${broadcastId} and chat ${chatId}`);
          }
        } catch (sheetError) {
          console.error('Error updating sheets:', sheetError.message);
        }
        
        // Edit the message to remove the button
        try {
          await botInstance.editMessageReplyMarkup(null, {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id
          });
        } catch (editError) {
          console.warn('Could not remove button:', editError.message);
        }
        
        responseText = 'Thank you! Message acknowledged.';
      }
      
      // Send confirmation to user
      await botInstance.answerCallbackQuery(query.id, {
        text: responseText,
        show_alert: false
      });
      
      console.log(`Action processed for ${from.first_name || from.username || 'Unknown'}`);
      
    } catch (error) {
      console.error('Error handling callback query:', error.message);
      
      try {
        await botInstance.answerCallbackQuery(query.id, {
          text: 'Error processing request',
          show_alert: false
        });
      } catch (answerError) {
        console.error('Failed to answer callback query:', answerError.message);
      }
    }
  });
}

// Graceful shutdown function
// UPDATE the gracefulShutdown function:
async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  
  console.log(`\n${signal} received, shutting down gracefully...`);
  
  try {
    if (bot) {
      console.log('Stopping original Telegram bot...');
      await bot.stopPolling();
      console.log('Original Telegram bot stopped');
    }
    
    if (ticketBot) {
      console.log('Stopping ticket Telegram bot...');
      await ticketBot.stopPolling();
      console.log('Ticket Telegram bot stopped');
    }
    
    if (criticalStockBot) {
      console.log('Stopping critical stock Telegram bot...');
      await criticalStockBot.stopPolling();
      console.log('Critical stock Telegram bot stopped');
    }
    
    // Clear any scheduled intervals
    if (global.criticalStockInterval) {
      clearInterval(global.criticalStockInterval);
      console.log('Critical stock schedule cleared');
    }
    
    console.log('Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error.message);
    process.exit(1);
  }
}
// Process signal handlers - ONLY shutdown on explicit termination signals
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Log errors but DON'T shutdown - let the server keep running
process.on('uncaughtException', (error) => {
  console.error('⚠️ Uncaught Exception (server continues running):', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️ Unhandled Rejection (server continues running):', reason);
});

// Initialize services on startup
// REPLACE the existing initializeServices function with this:
async function initializeServicesWithTickets() {
  console.log('Initializing services with ticket workflow...');
  
  const googleInitialized = await initializeGoogleServices();
  if (!googleInitialized) {
    console.error('Failed to initialize Google Services');
  }
  
  // Initialize original bot
  bot = await initializeTelegramBot();
  
  // Initialize separate ticket bot
  ticketBot = await initializeTicketBot();
  
  // Initialize critical stock bot
  criticalStockBot = await initializeCriticalStockBot();
  
  // SET UP CALLBACK HANDLERS ON BOTS
  if (bot) {
    setupCallbackQueryHandler(bot);
    console.log('Callback handler set up on main bot');
  }
  
  if (ticketBot) {
    setupCallbackQueryHandler(ticketBot);
    console.log('Callback handler set up on ticket bot');
  }
  
  if (criticalStockBot) {
    console.log('Critical Stock Bot ready for alerts');
  }
  
  // Initialize user mapping tab
  try {
    await initializeUserMappingTab();
    console.log('User mapping tab initialized');
  } catch (error) {
    console.error('Failed to initialize user mapping tab:', error.message);
  }
  
  console.log('Service initialization complete with ticket workflow and critical stock alerts');
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
// Process sheet data function for dashboard - FIXED COLUMN MAPPING WITH 28 DAY SUPPORT
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
  } else if (requestedPeriod === '28 Day') {
    // 28 Day: Headers at row 44 (index 43), data from row 45-55 (index 44-54)
    if (rawData[43]) {
      console.log('Found 28 Day headers at row 44');
      startRow = 44; // Row 45 (index 44)
      console.log(`Found 28 Day headers at row 44, data starts at row 45, column offset ${columnOffset}`);
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
  } else if (requestedPeriod === '28 Day') {
    endRow = 54; // Row 55 (index 54) - last data row for 28 Day
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
      console.log(`\nCOLUMN MAPPING DEBUG for "${outletLocation}":`);
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
  
  console.log(`Processed ${data.outlets.length} outlets for ${requestedPeriod}`);
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
    console.log(`Generating AI insights for ${period} data with ${data.outlets.length} outlets`);
    
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
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`,
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
    findings: /(?:key findings|insights)[:\s]*((?:[-•*]\s*.*(?:\n|$))*)/i,
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
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`,
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

// Helper function to check if closing should count for previous day
function isEarlyMorningClosing(timestamp) {
  if (!timestamp) return false;
  
  try {
    const date = new Date(timestamp);
    const hours = date.getHours();
    // If done between 00:00 and 03:00, it's previous day's closing
    return hours >= 0 && hours < 3;
  } catch (error) {
    return false;
  }
}

// Helper function to get the effective date for a submission
function getEffectiveSubmissionDate(submissionDate, timeSlot, timestamp) {
  // For Closing slot done in early morning hours, use previous day
  if (timeSlot === 'Closing' && isEarlyMorningClosing(timestamp)) {
    const date = new Date(submissionDate);
    date.setDate(date.getDate() - 1);
    return date.toISOString().split('T')[0];
  }
  return submissionDate;
}

// Helper function to validate Google Drive image accessibility
async function validateImageLink(imageLink) {
  if (!imageLink || !imageLink.trim()) {
    console.warn('Empty or invalid image link');
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
      console.warn(`Invalid Google Drive link format: ${imageLink}`);
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
        console.warn(`File is not an image: ${fileId}, MIME: ${mimeType}`);
        return { accessible: false, error: `Not an image file (MIME: ${mimeType})`, fileId, url: proxyUrl };
      }

      console.log(`Valid image file: ${fileId}`);
      return {
        accessible: true,
        fileId,
        url: proxyUrl,
      };
    } catch (error) {
      console.error(`Error validating image ${imageLink}: ${error.message}`);
      let errorMessage = error.message;
      if (error.message.includes('File not found')) {
        errorMessage = `File not found: ${fileId}. Ensure the file is shared with the service account (${authClient.email || 'unknown'})`;
        console.warn(`${errorMessage}. Attempting proxy URL: ${proxyUrl}`);
      } else if (error.code === 403) {
        errorMessage = `Permission denied for file ${fileId}. Share the file with the service account (${authClient.email || 'unknown'})`;
        console.warn(`${errorMessage}. Attempting proxy URL: ${proxyUrl}`);
      }
      return {
        accessible: false,
        fileId,
        url: proxyUrl,
        error: errorMessage
      };
    }
  } catch (error) {
    console.error(`Unexpected error validating image ${imageLink}: ${error.message}`);
    return { accessible: false, error: `Unexpected error: ${error.message}`, fileId: null, url: null };
  }
}

// Image proxy endpoint to bypass CORS - FIXED VERSION
app.get('/api/image-proxy/:fileId', async (req, res) => {
  try {
    const fileId = req.params.fileId;
    console.log(`Proxying image for fileId: ${fileId}`);
    
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
    console.error(`Image proxy error for file ${req.params.fileId}: ${error.message}`);
    
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
    console.log('Fetching checklist data via Apps Script...');

    const { startDate, endDate } = req.query;
    
    let dateParams = {};
    if (startDate && endDate) {
      dateParams = { startDate, endDate };
      console.log(`Custom date range: ${startDate} to ${endDate}`);
    } else {
      const now = new Date();
      const lastWeekEnd = now.toISOString().split('T')[0];
      const lastWeekStart = new Date(now);
      lastWeekStart.setDate(lastWeekStart.getDate() - 7);
      dateParams = { 
        startDate: lastWeekStart.toISOString().split('T')[0], 
        endDate: lastWeekEnd 
      };
      console.log(`Default range: ${dateParams.startDate} to ${dateParams.endDate}`);
    }

    // ⚠️⚠️⚠️ PASTE YOUR APPS SCRIPT WEB APP URL HERE ⚠️⚠️⚠️
    const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxCAIzlT_9jXyQjWdoOmMSy_IwgsmNooiK7jLgdA7o7Ea4SKT8eA0tZhotD2Vm2Df8S/exec';
    
    console.log('Calling Apps Script...');
    const response = await axios.get(APPS_SCRIPT_URL, {
      params: dateParams,
      timeout: 30000
    });

    const data = response.data;
    
    if (!data.success) {
      throw new Error(data.error || 'Apps Script error');
    }

    console.log(`✓ Received ${data.metadata.submissionCount} submissions, ${data.metadata.responseCount} responses (SERVER-SIDE FILTERED)`);

    // Transform submissions
    const submissions = [];
    if (data.submissions.length > 1) {
      for (let i = 1; i < data.submissions.length; i++) {
        const row = data.submissions[i];
        submissions.push({
          submissionId: row[0] || `AUTO-${i}`,
          date: formatDate(row[1]),
          timeSlot: row[2] || '',
          outlet: row[3] || '',
          submittedBy: row[4] || '',
          timestamp: row[5] || '',
          rowNumber: i + 1,
        });
      }
    }

    // Transform responses
    const tempResponses = [];
    if (data.responses.length > 1) {
      for (let i = 1; i < data.responses.length; i++) {
        const row = data.responses[i];
        tempResponses.push({
          submissionId: row[0] || `AUTO-${i}`,
          question: row[1] || '',
          answer: row[2] || '',
          imageLink: row[3] || '',
          imageCode: row[4] || '',
          rowNumber: i + 1,
        });
      }
    }

    // Validate images
    console.log(`Validating ${tempResponses.length} images...`);
    const validationPromises = tempResponses.map(r =>
      r.imageLink
        ? validateImageLink(r.imageLink)
        : Promise.resolve({ accessible: false, error: 'No image link', fileId: null, url: null })
    );

    const validations = await Promise.all(validationPromises);

    const responses = tempResponses.map((r, idx) => {
      const v = validations[idx];
      return {
        submissionId: r.submissionId,
        question: r.question,
        answer: r.answer,
        image: v.url || r.imageLink || '',
        imageCode: r.imageCode,
        imageAccessible: v.accessible || false,
        imageError: v.error || null,
        fileId: v.fileId || null,
        rowNumber: r.rowNumber,
      };
    });

    res.json({
      success: true,
      submissions,
      responses,
      metadata: {
        ...data.metadata,
        source: 'apps-script-standalone'
      },
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Error fetching via Apps Script:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Checklist statistics endpoint
app.get('/api/checklist-stats', async (req, res) => {
  try {
    console.log('Calculating checklist statistics...');
    
    if (!sheets || !drive) {
      const initialized = await initializeGoogleServices();
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

    console.log('Statistics calculated:', stats);

    res.set('Content-Type', 'application/json');
    res.json({
      success: true,
      stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error calculating checklist stats:', error.message);
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
    console.log('Filtering checklist data with:', filters);

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
      const initialized = await initializeGoogleServices();
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
            console.warn(`Duplicate submissionId detected: ${submissionId} at row ${i + 1}, keeping first occurrence`);
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
      console.warn(`Found ${unmatchedSubmissionIds.length} submissionIds in responses with no matching submissions:`, unmatchedSubmissionIds);
    }

    console.log(`Filtered to ${submissions.length} submissions and ${filteredResponses.length} responses`);

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
    console.error('Error filtering checklist data:', error.message, error.stack);
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.data || 'No additional details',
      timestamp: new Date().toISOString(),
    });
  }
});

// Add these endpoints to your server.js file after the existing checklist endpoints

// Checklist completion status endpoint
// Checklist completion status endpoint
app.get('/api/checklist-completion-status', async (req, res) => {
  try {
    const selectedDate = req.query.date || new Date().toISOString().split('T')[0];
    console.log(`Checklist completion status requested for date: ${selectedDate}`);

    if (!sheets) {
      const initialized = await initializeGoogleServices();
      if (!initialized) {
        throw new Error('Failed to initialize Google APIs');
      }
    }

    const submissionsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: CHECKLIST_SPREADSHEET_ID,
      range: `${SUBMISSIONS_TAB}!A:Z`,
    });

    const submissionsData = submissionsResponse.data.values || [];
    const TIME_SLOT_ORDER = ['Morning', 'Mid Day', 'Closing'];
    const ALLOWED_OUTLET_CODES = ['RR', 'KOR', 'JAY', 'SKN', 'RAJ', 'KLN', 'BLN', 'WF', 'HSR', 'ARK', 'IND', 'CK'];
    const CLOUD_KITCHEN_CODES = ['RAJ', 'KLN', 'BLN', 'WF', 'HSR', 'ARK', 'IND'];

    const submissionsByOutletAndSlot = new Map();

    if (submissionsData.length > 1) {
      for (let i = 1; i < submissionsData.length; i++) {
        const row = submissionsData[i];
        if (!row || row.length === 0) continue;

        const submissionDate = formatDate(getCellValue(row, 1));
        const timeSlot = getCellValue(row, 2);
        const outlet = getCellValue(row, 3);
        const submittedBy = getCellValue(row, 4);
        const timestamp = getCellValue(row, 5);

        const effectiveDate = getEffectiveSubmissionDate(submissionDate, timeSlot, timestamp);
        const includeSubmission = (effectiveDate === selectedDate);

        if (includeSubmission && outlet && timeSlot) {
          const key = `${outlet}|${timeSlot}`;
          if (!submissionsByOutletAndSlot.has(key)) {
            submissionsByOutletAndSlot.set(key, {
              outlet,
              timeSlot,
              submittedBy,
              timestamp,
              count: 1
            });
          } else {
            const existing = submissionsByOutletAndSlot.get(key);
            if (new Date(timestamp) > new Date(existing.timestamp)) {
              submissionsByOutletAndSlot.set(key, {
                outlet,
                timeSlot,
                submittedBy,
                timestamp,
                count: existing.count + 1
              });
            }
          }
        }
      }
    }

    const completionData = [];

    // Fetch roster data for all outlets in parallel
    const rosterPromises = [];
    
    ALLOWED_OUTLET_CODES.forEach(outletCode => {
      const isCloudKitchen = CLOUD_KITCHEN_CODES.includes(outletCode);
      const timeSlots = isCloudKitchen ? ['Morning', 'Closing'] : TIME_SLOT_ORDER;
      
      timeSlots.forEach(timeSlot => {
        rosterPromises.push(
          getScheduledEmployees(outletCode, timeSlot, selectedDate)
            .then(employees => ({ outletCode, timeSlot, employees }))
        );
      });
    });

    const rosterResults = await Promise.all(rosterPromises);
    
    const rosterMap = new Map();
    rosterResults.forEach(result => {
      const key = `${result.outletCode}|${result.timeSlot}`;
      rosterMap.set(key, result.employees);
    });

    ALLOWED_OUTLET_CODES.forEach(outletCode => {
      const isCloudKitchen = CLOUD_KITCHEN_CODES.includes(outletCode);
      const timeSlots = isCloudKitchen ? ['Morning', 'Closing'] : TIME_SLOT_ORDER;

      const timeSlotStatus = timeSlots.map(timeSlot => {
        const key = `${outletCode}|${timeSlot}`;
        const submission = submissionsByOutletAndSlot.get(key);
        const scheduledEmployees = rosterMap.get(key) || [];

        return {
          timeSlot,
          status: submission ? 'Completed' : 'Pending',
          submittedBy: submission ? submission.submittedBy : '',
          timestamp: submission ? submission.timestamp : '',
          scheduledEmployees: scheduledEmployees.map(emp => ({
            id: emp.employeeId,
            name: emp.name,
            shift: emp.shift,
            startTime: emp.startTime,
            endTime: emp.endTime
          })),
          employeeCount: scheduledEmployees.length
        };
      });

      const completedSlots = timeSlotStatus.filter(slot => slot.status === 'Completed').length;
      const totalSlots = timeSlotStatus.length;
      const completionPercentage = Math.round((completedSlots / totalSlots) * 100);

      let overallStatus = 'Pending';
      if (completedSlots === totalSlots) {
        overallStatus = 'Completed';
      } else if (completedSlots > 0) {
        overallStatus = 'Partial';
      }

      const lastSubmissionTime = timeSlotStatus
        .filter(slot => slot.timestamp)
        .map(slot => slot.timestamp)
        .sort()
        .pop() || '';

      const allScheduledEmployees = [];
      timeSlotStatus.forEach(slot => {
        slot.scheduledEmployees.forEach(emp => {
          if (!allScheduledEmployees.find(e => e.id === emp.id)) {
            allScheduledEmployees.push(emp);
          }
        });
      });

      completionData.push({
        outletCode: outletCode,
        outletName: `${outletCode} Outlet`,
        outletType: isCloudKitchen ? 'Cloud Kitchen' : 'Restaurant',
        overallStatus,
        completionPercentage,
        timeSlotStatus,
        lastSubmissionTime,
        isCloudDays: isCloudKitchen,
        allScheduledEmployees,
        totalScheduledEmployees: allScheduledEmployees.length
      });
    });

    res.set('Content-Type', 'application/json');
    res.json({
      success: true,
      data: completionData,
      metadata: {
        date: selectedDate,
        totalOutlets: completionData.length,
        completedOutlets: completionData.filter(o => o.overallStatus === 'Completed').length,
        partialOutlets: completionData.filter(o => o.overallStatus === 'Partial').length,
        pendingOutlets: completionData.filter(o => o.overallStatus === 'Pending').length,
        totalScheduledEmployees: completionData.reduce((sum, o) => sum + o.totalScheduledEmployees, 0)
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching checklist completion status:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Checklist completion summary endpoint
// Checklist completion summary endpoint
app.get('/api/checklist-completion-summary', async (req, res) => {
  try {
    const selectedDate = req.query.date || new Date().toISOString().split('T')[0];
    console.log(`Checklist completion summary requested for date: ${selectedDate}`);

    if (!sheets) {
      const initialized = await initializeGoogleServices();
      if (!initialized) {
        throw new Error('Failed to initialize Google APIs');
      }
    }

    console.log(`Fetching ${SUBMISSIONS_TAB} for summary analysis...`);
    const submissionsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: CHECKLIST_SPREADSHEET_ID,
      range: `${SUBMISSIONS_TAB}!A:Z`,
    });

    const submissionsData = submissionsResponse.data.values || [];
    console.log(`Found ${submissionsData.length} submission rows for summary`);

    const TIME_SLOT_ORDER = ['Morning', 'Mid Day', 'Closing'];
    const ALLOWED_OUTLET_CODES = ['RR', 'KOR', 'JAY', 'SKN', 'RAJ', 'KLN', 'BLN', 'WF', 'HSR', 'ARK', 'IND', 'CK'];
    const CLOUD_KITCHEN_CODES = ['RAJ', 'KLN', 'BLN', 'WF', 'HSR', 'ARK', 'IND'];

    const submissionsByOutletAndSlot = new Map();

    if (submissionsData.length > 1) {
      for (let i = 1; i < submissionsData.length; i++) {
        const row = submissionsData[i];
        if (!row || row.length === 0) continue;

        const submissionDate = formatDate(getCellValue(row, 1));
        const timeSlot = getCellValue(row, 2);
        const outlet = getCellValue(row, 3);

        const effectiveDate = getEffectiveSubmissionDate(submissionDate, timeSlot, getCellValue(row, 5));
        const includeSubmission = (effectiveDate === selectedDate);

        if (includeSubmission && outlet && timeSlot && ALLOWED_OUTLET_CODES.includes(outlet.toUpperCase())) {
          const key = `${outlet}|${timeSlot}`;
          submissionsByOutletAndSlot.set(key, true);
        }
      }
    }

    const totalOutlets = ALLOWED_OUTLET_CODES.length;
    let completedOutlets = 0;
    let partialOutlets = 0;
    let pendingOutlets = 0;

    const timeSlotCompletions = {};
    TIME_SLOT_ORDER.forEach(slot => {
      timeSlotCompletions[slot] = 0;
    });

    let totalScheduledEmployees = 0;
    const employeePromises = [];

    ALLOWED_OUTLET_CODES.forEach(outletCode => {
      const isCloudKitchen = CLOUD_KITCHEN_CODES.includes(outletCode);
      const timeSlots = isCloudKitchen ? ['Morning', 'Closing'] : TIME_SLOT_ORDER;
      
      const completedSlots = timeSlots.filter(timeSlot => {
        const key = `${outletCode}|${timeSlot}`;
        return submissionsByOutletAndSlot.has(key);
      });

      completedSlots.forEach(slot => {
        timeSlotCompletions[slot]++;
      });

      if (completedSlots.length === timeSlots.length) {
        completedOutlets++;
      } else if (completedSlots.length > 0) {
        partialOutlets++;
      } else {
        pendingOutlets++;
      }

      timeSlots.forEach(timeSlot => {
        employeePromises.push(
          getScheduledEmployees(outletCode, timeSlot, selectedDate)
        );
      });
    });

    const allEmployeeLists = await Promise.all(employeePromises);
    const uniqueEmployees = new Set();
    allEmployeeLists.forEach(empList => {
      empList.forEach(emp => uniqueEmployees.add(emp.employeeId));
    });
    totalScheduledEmployees = uniqueEmployees.size;

    const overallCompletionRate = totalOutlets > 0 ? 
      ((completedOutlets / totalOutlets) * 100).toFixed(1) : '0.0';

    const summary = {
      totalOutlets,
      completedOutlets,
      partialOutlets,
      pendingOutlets,
      overallCompletionRate: parseFloat(overallCompletionRate),
      timeSlotCompletions,
      totalScheduledEmployees,
      date: selectedDate
    };

    console.log(`Generated summary for ${totalOutlets} outlets:`, summary);

    res.set('Content-Type', 'application/json');
    res.json({
      success: true,
      summary,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching checklist completion summary:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

app.get('/api/scheduled-employees', async (req, res) => {
  try {
    const { outlet, timeSlot, date } = req.query;
    
    if (!outlet || !timeSlot) {
      return res.status(400).json({
        success: false,
        error: 'Outlet and timeSlot are required parameters',
        timestamp: new Date().toISOString(),
      });
    }

    const selectedDate = date || new Date().toISOString().split('T')[0];
    const employees = await getScheduledEmployees(outlet, timeSlot, selectedDate);

    res.set('Content-Type', 'application/json');
    res.json({
      success: true,
      data: {
        outlet,
        timeSlot,
        date: selectedDate,
        employees,
        count: employees.length
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching scheduled employees:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Debug checklist endpoint
app.get('/api/debug-checklist', async (req, res) => {
  try {
    if (!sheets) {
      await initializeGoogleServices();
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
    console.error('Debug checklist error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      spreadsheetId: CHECKLIST_SPREADSHEET_ID,
    });
  }
});

// === CHECKLIST REPORT GENERATION ENDPOINTS ===

// Generate comprehensive checklist report
app.get('/api/checklist-generate-report', async (req, res) => {
  try {
    const selectedDate = req.query.date || new Date().toISOString().split('T')[0];
    console.log(`Generating checklist report for date: ${selectedDate}`);

    if (!sheets) {
      const initialized = await initializeGoogleServices();
      if (!initialized) {
        throw new Error('Failed to initialize Google APIs');
      }
    }

    // Fetch submissions data
    const submissionsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: CHECKLIST_SPREADSHEET_ID,
      range: `${SUBMISSIONS_TAB}!A:Z`,
    });

    const submissionsData = submissionsResponse.data.values || [];
    const TIME_SLOT_ORDER = ['Morning', 'Mid Day', 'Closing'];
    const ALLOWED_OUTLET_CODES = ['RR', 'KOR', 'JAY', 'SKN', 'RAJ', 'KLN', 'BLN', 'WF', 'HSR', 'ARK', 'IND', 'CK'];
    const CLOUD_KITCHEN_CODES = ['RAJ', 'KLN', 'BLN', 'WF', 'HSR', 'ARK', 'IND'];

    // Map for submissions by outlet and slot
    const submissionsByOutletAndSlot = new Map();

    if (submissionsData.length > 1) {
      for (let i = 1; i < submissionsData.length; i++) {
        const row = submissionsData[i];
        if (!row || row.length === 0) continue;

        const submissionDate = formatDate(getCellValue(row, 1));
        const timeSlot = getCellValue(row, 2);
        const outlet = getCellValue(row, 3);
        const submittedBy = getCellValue(row, 4);
        const timestamp = getCellValue(row, 5);

        const effectiveDate = getEffectiveSubmissionDate(submissionDate, timeSlot, timestamp);
        const includeSubmission = (effectiveDate === selectedDate);

        if (includeSubmission && outlet && timeSlot) {
          const key = `${outlet}|${timeSlot}`;
          if (!submissionsByOutletAndSlot.has(key)) {
            submissionsByOutletAndSlot.set(key, {
              outlet,
              timeSlot,
              submittedBy,
              timestamp,
              count: 1
            });
          } else {
            const existing = submissionsByOutletAndSlot.get(key);
            if (new Date(timestamp) > new Date(existing.timestamp)) {
              submissionsByOutletAndSlot.set(key, {
                outlet,
                timeSlot,
                submittedBy,
                timestamp,
                count: existing.count + 1
              });
            }
          }
        }
      }
    }

    // Build report data
    const completed = [];
    const partial = [];
    const pending = [];
    const employeeSubmissions = new Map(); // Track submissions per employee

    ALLOWED_OUTLET_CODES.forEach(outletCode => {
      const isCloudKitchen = CLOUD_KITCHEN_CODES.includes(outletCode);
      const timeSlots = isCloudKitchen ? ['Morning', 'Closing'] : TIME_SLOT_ORDER;

      const timeSlotStatus = timeSlots.map(timeSlot => {
        const key = `${outletCode}|${timeSlot}`;
        const submission = submissionsByOutletAndSlot.get(key);

        if (submission) {
          // Track employee submissions
          const employee = submission.submittedBy;
          if (!employeeSubmissions.has(employee)) {
            employeeSubmissions.set(employee, {
              name: employee,
              submissions: [],
              totalSubmissions: 0
            });
          }
          const empData = employeeSubmissions.get(employee);
          empData.submissions.push({
            outlet: outletCode,
            timeSlot: timeSlot,
            timestamp: submission.timestamp
          });
          empData.totalSubmissions++;
        }

        return {
          timeSlot,
          status: submission ? 'Completed' : 'Pending',
          submittedBy: submission ? submission.submittedBy : '',
          timestamp: submission ? submission.timestamp : '',
          formattedTime: submission ? formatTimestamp(submission.timestamp) : ''
        };
      });

      const completedSlots = timeSlotStatus.filter(slot => slot.status === 'Completed').length;
      const totalSlots = timeSlotStatus.length;
      const completionPercentage = Math.round((completedSlots / totalSlots) * 100);

      let overallStatus = 'Pending';
      if (completedSlots === totalSlots) {
        overallStatus = 'Completed';
      } else if (completedSlots > 0) {
        overallStatus = 'Partial';
      }

      const outletData = {
        outletCode: outletCode,
        outletName: getOutletFullName(outletCode),
        outletType: isCloudKitchen ? 'Cloud Kitchen' : 'Restaurant',
        overallStatus,
        completionPercentage,
        completedSlots,
        totalSlots,
        timeSlotStatus,
        missingSlots: timeSlotStatus.filter(slot => slot.status === 'Pending').map(slot => slot.timeSlot)
      };

      // Categorize outlets
      if (overallStatus === 'Completed') {
        completed.push(outletData);
      } else if (overallStatus === 'Partial') {
        partial.push(outletData);
      } else {
        pending.push(outletData);
      }
    });

    // Convert employee map to array and sort
    const employeeReport = Array.from(employeeSubmissions.values())
      .sort((a, b) => b.totalSubmissions - a.totalSubmissions);

    // Find employees who haven't submitted anything
    const allEmployees = new Set();
    submissionsData.slice(1).forEach(row => {
      if (row && row[4]) {
        allEmployees.add(getCellValue(row, 4));
      }
    });

    const employeesNotSubmitted = Array.from(allEmployees)
      .filter(emp => !employeeSubmissions.has(emp));

    // Calculate summary
    const summary = {
      reportDate: selectedDate,
      reportGeneratedAt: new Date().toISOString(),
      totalOutlets: ALLOWED_OUTLET_CODES.length,
      completedOutlets: completed.length,
      partialOutlets: partial.length,
      pendingOutlets: pending.length,
      overallCompletionRate: ((completed.length / ALLOWED_OUTLET_CODES.length) * 100).toFixed(1),
      totalEmployeesSubmitted: employeeSubmissions.size,
      totalEmployeesNotSubmitted: employeesNotSubmitted.length,
      totalSubmissions: Array.from(employeeSubmissions.values()).reduce((sum, emp) => sum + emp.totalSubmissions, 0)
    };

    console.log(`Report generated: ${completed.length} completed, ${partial.length} partial, ${pending.length} pending`);

    res.json({
      success: true,
      report: {
        summary,
        completed,
        partial,
        pending,
        employeeReport,
        employeesNotSubmitted
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error generating checklist report:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Generate missing submissions report (date range)
app.get('/api/checklist-missing-submissions-report', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'Both startDate and endDate are required',
        timestamp: new Date().toISOString()
      });
    }

    console.log(`Generating missing submissions report from ${startDate} to ${endDate}`);

    if (!sheets) {
      const initialized = await initializeGoogleServices();
      if (!initialized) {
        throw new Error('Failed to initialize Google APIs');
      }
    }

    // Fetch all submissions data
    const submissionsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: CHECKLIST_SPREADSHEET_ID,
      range: `${SUBMISSIONS_TAB}!A:Z`,
    });

    const submissionsData = submissionsResponse.data.values || [];
    const ALLOWED_OUTLET_CODES = ['RR', 'KOR', 'JAY', 'SKN', 'RAJ', 'KLN', 'BLN', 'WF', 'HSR', 'ARK', 'IND', 'CK'];
    const CLOUD_KITCHEN_CODES = ['RAJ', 'KLN', 'BLN', 'WF', 'HSR', 'ARK', 'IND'];

    // Generate list of dates in range
    const dates = [];
    const currentDate = new Date(startDate);
    const lastDate = new Date(endDate);

    while (currentDate <= lastDate) {
      dates.push(currentDate.toISOString().split('T')[0]);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    console.log(`Processing ${dates.length} days for ${ALLOWED_OUTLET_CODES.length} outlets`);

    // Build a map of submissions by date, outlet, and time slot
    const submissionsMap = new Map();

    if (submissionsData.length > 1) {
      for (let i = 1; i < submissionsData.length; i++) {
        const row = submissionsData[i];
        if (!row || row.length === 0) continue;

        const submissionDate = formatDate(getCellValue(row, 1));
        const timeSlot = getCellValue(row, 2);
        const outlet = getCellValue(row, 3);
        const submittedBy = getCellValue(row, 4);
        const timestamp = getCellValue(row, 5);

        const effectiveDate = getEffectiveSubmissionDate(submissionDate, timeSlot, timestamp);

        if (dates.includes(effectiveDate) && outlet && timeSlot) {
          const key = `${effectiveDate}|${outlet}|${timeSlot}`;
          if (!submissionsMap.has(key)) {
            submissionsMap.set(key, []);
          }
          submissionsMap.get(key).push(submittedBy);
        }
      }
    }

    // Generate daily reports
    const dailyReports = [];
    let totalMissing = 0;

    for (const date of dates) {
      const dayReport = {
        date: date,
        outlets: [],
        totalMissing: 0
      };

      // Process each outlet
      for (const outletCode of ALLOWED_OUTLET_CODES) {
        // Skip Central Kitchen (CK) as checklist is not active yet
        if (outletCode === 'CK') continue;

        const isCloudKitchen = CLOUD_KITCHEN_CODES.includes(outletCode);
        const timeSlots = isCloudKitchen ? ['Morning', 'Closing'] : ['Morning', 'Mid Day', 'Closing'];

        const outletReport = {
          outletCode: outletCode,
          outletName: getOutletFullName(outletCode),
          timeSlots: []
        };

        // Process each time slot
        for (const timeSlot of timeSlots) {
          const key = `${date}|${outletCode}|${timeSlot}`;
          const submittedStaff = submissionsMap.get(key) || [];

          // Get scheduled employees for this outlet, time slot, and date
          const scheduledEmployees = await getScheduledEmployees(outletCode, timeSlot, date);
          const scheduledNames = scheduledEmployees.map(emp => emp.name);

          // Helper function to check if a name matches any submitted name
          // Handles both short names (Jonathan) and full names (JONATHAN SEIMINTHANG HAOKIP)
          const hasSubmitted = (scheduledName) => {
            const lowerScheduled = scheduledName.toLowerCase().trim();
            return submittedStaff.some(submittedName => {
              const lowerSubmitted = submittedName.toLowerCase().trim();
              // Match if scheduled name is contained in submitted name or vice versa
              return lowerSubmitted.includes(lowerScheduled) || lowerScheduled.includes(lowerSubmitted);
            });
          };

          // Find who didn't submit (using fuzzy name matching)
          const missingStaff = scheduledNames.filter(name => !hasSubmitted(name));

          if (missingStaff.length > 0) {
            dayReport.totalMissing += missingStaff.length;
            totalMissing += missingStaff.length;
          }

          outletReport.timeSlots.push({
            timeSlot: timeSlot,
            scheduledStaff: scheduledNames,
            submittedStaff: submittedStaff,
            missingStaff: missingStaff
          });
        }

        dayReport.outlets.push(outletReport);
      }

      dailyReports.push(dayReport);
    }

    const summary = {
      startDate: startDate,
      endDate: endDate,
      totalDays: dates.length,
      totalOutlets: ALLOWED_OUTLET_CODES.length,
      totalMissing: totalMissing,
      reportGeneratedAt: new Date().toISOString()
    };

    console.log(`Missing submissions report generated: ${totalMissing} total missing across ${dates.length} days`);

    res.json({
      success: true,
      report: {
        summary: summary,
        dailyReports: dailyReports
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error generating missing submissions report:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Generate downloadable CSV report
// === WEEKLY REPORT GENERATION ENDPOINTS ===

// Generate weekly checklist report (last 7 days)
app.get('/api/checklist-weekly-report', async (req, res) => {
  try {
    console.log('Generating weekly checklist report for last 7 days');

    if (!sheets) {
      const initialized = await initializeGoogleServices();
      if (!initialized) {
        throw new Error('Failed to initialize Google APIs');
      }
    }

    // Calculate date range for last 7 days
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 6); // Last 7 days including today

    const dateRange = [];
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      dateRange.push(new Date(d).toISOString().split('T')[0]);
    }

    console.log(`Fetching data for dates: ${dateRange.join(', ')}`);

    // Fetch submissions data
    const submissionsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: CHECKLIST_SPREADSHEET_ID,
      range: `${SUBMISSIONS_TAB}!A:Z`,
    });

    const submissionsData = submissionsResponse.data.values || [];
    const TIME_SLOT_ORDER = ['Morning', 'Mid Day', 'Closing'];
    const ALLOWED_OUTLET_CODES = ['RR', 'KOR', 'JAY', 'SKN', 'RAJ', 'KLN', 'BLN', 'WF', 'HSR', 'ARK', 'IND', 'CK'];
    const CLOUD_KITCHEN_CODES = ['RAJ', 'KLN', 'BLN', 'WF', 'HSR', 'ARK', 'IND'];

    // Aggregate data by outlet and date
    const weeklyData = {};
    const employeeData = new Map();

    // Initialize weekly data structure
    ALLOWED_OUTLET_CODES.forEach(outletCode => {
      weeklyData[outletCode] = {
        outletCode,
        outletName: getOutletFullName(outletCode),
        outletType: CLOUD_KITCHEN_CODES.includes(outletCode) ? 'Cloud Kitchen' : 'Restaurant',
        dailyCompletion: {},
        totalSlots: 0,
        completedSlots: 0,
        weeklyCompletionRate: 0,
        bestDay: null,
        worstDay: null,
        consistencyScore: 0
      };

      // Initialize each day
      dateRange.forEach(date => {
        const isCloudKitchen = CLOUD_KITCHEN_CODES.includes(outletCode);
        const expectedSlots = isCloudKitchen ? 2 : 3; // Cloud kitchens don't have Mid Day
        
        weeklyData[outletCode].dailyCompletion[date] = {
          date,
          completed: 0,
          expected: expectedSlots,
          slots: {},
          completionRate: 0
        };
      });
    });

    // Process submissions
    if (submissionsData.length > 1) {
      for (let i = 1; i < submissionsData.length; i++) {
        const row = submissionsData[i];
        if (!row || row.length === 0) continue;

        const submissionDate = formatDate(getCellValue(row, 1));
        const timeSlot = getCellValue(row, 2);
        const outlet = getCellValue(row, 3);
        const submittedBy = getCellValue(row, 4);
        const timestamp = getCellValue(row, 5);

        // Check if date is in our range
        if (!dateRange.includes(submissionDate)) continue;
        if (!ALLOWED_OUTLET_CODES.includes(outlet)) continue;

        const effectiveDate = getEffectiveSubmissionDate(submissionDate, timeSlot, timestamp);
        
        if (dateRange.includes(effectiveDate) && weeklyData[outlet]) {
          const dayData = weeklyData[outlet].dailyCompletion[effectiveDate];
          if (dayData && !dayData.slots[timeSlot]) {
            dayData.slots[timeSlot] = {
              completed: true,
              submittedBy,
              timestamp
            };
            dayData.completed++;
          }

          // Track employee submissions
          if (!employeeData.has(submittedBy)) {
            employeeData.set(submittedBy, {
              name: submittedBy,
              totalSubmissions: 0,
              outletsCovered: new Set(),
              dailySubmissions: {}
            });
          }
          const empData = employeeData.get(submittedBy);
          empData.totalSubmissions++;
          empData.outletsCovered.add(outlet);
          if (!empData.dailySubmissions[effectiveDate]) {
            empData.dailySubmissions[effectiveDate] = 0;
          }
          empData.dailySubmissions[effectiveDate]++;
        }
      }
    }

    // Calculate statistics for each outlet
    Object.keys(weeklyData).forEach(outletCode => {
      const outlet = weeklyData[outletCode];
      const dailyRates = [];

      Object.keys(outlet.dailyCompletion).forEach(date => {
        const day = outlet.dailyCompletion[date];
        day.completionRate = day.expected > 0 ? (day.completed / day.expected * 100) : 0;
        dailyRates.push(day.completionRate);

        outlet.totalSlots += day.expected;
        outlet.completedSlots += day.completed;
      });

      outlet.weeklyCompletionRate = outlet.totalSlots > 0 
        ? ((outlet.completedSlots / outlet.totalSlots) * 100).toFixed(1)
        : '0.0';

      // Find best and worst days
      const sortedDays = Object.entries(outlet.dailyCompletion)
        .sort((a, b) => b[1].completionRate - a[1].completionRate);
      
      if (sortedDays.length > 0) {
        outlet.bestDay = {
          date: sortedDays[0][0],
          rate: sortedDays[0][1].completionRate.toFixed(1)
        };
        outlet.worstDay = {
          date: sortedDays[sortedDays.length - 1][0],
          rate: sortedDays[sortedDays.length - 1][1].completionRate.toFixed(1)
        };
      }

      // Calculate consistency score (100 - standard deviation)
      if (dailyRates.length > 0) {
        const mean = dailyRates.reduce((a, b) => a + b, 0) / dailyRates.length;
        const variance = dailyRates.reduce((sum, rate) => sum + Math.pow(rate - mean, 2), 0) / dailyRates.length;
        const stdDev = Math.sqrt(variance);
        outlet.consistencyScore = Math.max(0, (100 - stdDev)).toFixed(1);
      }
    });

    // Convert employee map to array
    const employeeReport = Array.from(employeeData.values()).map(emp => ({
      name: emp.name,
      totalSubmissions: emp.totalSubmissions,
      outletsCovered: Array.from(emp.outletsCovered),
      dailySubmissions: emp.dailySubmissions,
      avgDailySubmissions: (emp.totalSubmissions / dateRange.length).toFixed(1)
    })).sort((a, b) => b.totalSubmissions - a.totalSubmissions);

    // Calculate overall summary
    const allOutlets = Object.values(weeklyData);
    const summary = {
      reportPeriod: {
        startDate: dateRange[0],
        endDate: dateRange[dateRange.length - 1],
        totalDays: dateRange.length
      },
      totalOutlets: allOutlets.length,
      avgWeeklyCompletion: allOutlets.length > 0
        ? (allOutlets.reduce((sum, o) => sum + parseFloat(o.weeklyCompletionRate), 0) / allOutlets.length).toFixed(1)
        : '0.0',
      topPerformers: allOutlets
        .sort((a, b) => parseFloat(b.weeklyCompletionRate) - parseFloat(a.weeklyCompletionRate))
        .slice(0, 3)
        .map(o => ({ 
          outletCode: o.outletCode, 
          outletName: o.outletName,
          rate: o.weeklyCompletionRate 
        })),
      bottomPerformers: allOutlets
        .sort((a, b) => parseFloat(a.weeklyCompletionRate) - parseFloat(b.weeklyCompletionRate))
        .slice(0, 3)
        .map(o => ({ 
          outletCode: o.outletCode, 
          outletName: o.outletName,
          rate: o.weeklyCompletionRate 
        })),
      totalEmployees: employeeReport.length,
      totalSubmissions: employeeReport.reduce((sum, e) => sum + e.totalSubmissions, 0),
      mostActiveEmployee: employeeReport[0] || null,
      dailyAverages: dateRange.map(date => {
        const dayTotal = allOutlets.reduce((sum, o) => {
          const dayData = o.dailyCompletion[date];
          return sum + (dayData.expected > 0 ? (dayData.completed / dayData.expected * 100) : 0);
        }, 0);
        return {
          date,
          avgCompletion: allOutlets.length > 0 ? (dayTotal / allOutlets.length).toFixed(1) : '0.0',
          dayName: new Date(date).toLocaleDateString('en-US', { weekday: 'short' })
        };
      })
    };

    console.log(`Weekly report generated successfully for ${allOutlets.length} outlets`);

    res.json({
      success: true,
      report: {
        summary,
        outletDetails: allOutlets,
        employeeReport,
        dateRange
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error generating weekly report:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Download weekly report as CSV
app.get('/api/checklist-download-weekly-report', async (req, res) => {
  try {
    const format = req.query.format || 'csv';
    console.log(`Generating downloadable weekly ${format} report`);

    // Fetch the weekly report data
    const reportEndpoint = `${req.protocol}://${req.get('host')}/api/checklist-weekly-report`;
    const reportResponse = await axios.get(reportEndpoint);
    
    if (!reportResponse.data.success) {
      throw new Error('Failed to generate weekly report data');
    }

    const reportData = reportResponse.data.report;
    const summary = reportData.summary;

    if (format === 'csv') {
      let csvContent = '';
      
      // Header
      csvContent += `Weekly Checklist Completion Report\n`;
      csvContent += `Period: ${summary.reportPeriod.startDate} to ${summary.reportPeriod.endDate} (${summary.reportPeriod.totalDays} days)\n`;
      csvContent += `Generated: ${new Date().toLocaleString()}\n`;
      csvContent += `\n`;
      
      // Summary
      csvContent += `SUMMARY\n`;
      csvContent += `Total Outlets,${summary.totalOutlets}\n`;
      csvContent += `Average Weekly Completion,${summary.avgWeeklyCompletion}%\n`;
      csvContent += `Total Employees,${summary.totalEmployees}\n`;
      csvContent += `Total Submissions,${summary.totalSubmissions}\n`;
      csvContent += `\n`;

      // Top Performers
      csvContent += `TOP PERFORMERS\n`;
      csvContent += `Rank,Outlet Code,Outlet Name,Weekly Completion Rate\n`;
      summary.topPerformers.forEach((outlet, idx) => {
        csvContent += `${idx + 1},${outlet.outletCode},${outlet.outletName},${outlet.rate}%\n`;
      });
      csvContent += `\n`;

      // Bottom Performers
      csvContent += `NEEDS IMPROVEMENT\n`;
      csvContent += `Outlet Code,Outlet Name,Weekly Completion Rate\n`;
      summary.bottomPerformers.forEach(outlet => {
        csvContent += `${outlet.outletCode},${outlet.outletName},${outlet.rate}%\n`;
      });
      csvContent += `\n`;

      // Daily Averages
      csvContent += `DAILY AVERAGES\n`;
      csvContent += `Date,Day,Average Completion\n`;
      summary.dailyAverages.forEach(day => {
        csvContent += `${day.date},${day.dayName},${day.avgCompletion}%\n`;
      });
      csvContent += `\n`;

      // Outlet Details
      csvContent += `OUTLET WEEKLY DETAILS\n`;
      csvContent += `Outlet Code,Outlet Name,Type,Weekly Completion,Completed Slots,Total Slots,Consistency Score,Best Day,Worst Day\n`;
      reportData.outletDetails.forEach(outlet => {
        csvContent += `${outlet.outletCode},${outlet.outletName},${outlet.outletType},${outlet.weeklyCompletionRate}%,${outlet.completedSlots},${outlet.totalSlots},${outlet.consistencyScore},${outlet.bestDay?.date || 'N/A'} (${outlet.bestDay?.rate || 0}%),${outlet.worstDay?.date || 'N/A'} (${outlet.worstDay?.rate || 0}%)\n`;
      });
      csvContent += `\n`;

      // Daily breakdown for each outlet
      csvContent += `DAILY BREAKDOWN BY OUTLET\n`;
      csvContent += `Outlet Code,Date,Completed Slots,Expected Slots,Completion Rate,Morning,Mid Day,Closing\n`;
      reportData.outletDetails.forEach(outlet => {
        Object.keys(outlet.dailyCompletion).forEach(date => {
          const day = outlet.dailyCompletion[date];
          const morning = day.slots['Morning'] ? '✓' : '✗';
          const midDay = day.slots['Mid Day'] ? '✓' : '✗';
          const closing = day.slots['Closing'] ? '✓' : '✗';
          csvContent += `${outlet.outletCode},${date},${day.completed},${day.expected},${day.completionRate.toFixed(1)}%,${morning},${midDay},${closing}\n`;
        });
      });
      csvContent += `\n`;

      // Employee Report
      csvContent += `EMPLOYEE PERFORMANCE\n`;
      csvContent += `Employee Name,Total Submissions,Outlets Covered,Avg Daily Submissions\n`;
      reportData.employeeReport.forEach(emp => {
        csvContent += `${emp.name},${emp.totalSubmissions},"${emp.outletsCovered.join(', ')}",${emp.avgDailySubmissions}\n`;
      });

      // Set headers for CSV download
      const filename = `checklist-weekly-report-${summary.reportPeriod.startDate}-to-${summary.reportPeriod.endDate}.csv`;
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
      res.send(csvContent);
      
    } else if (format === 'json') {
      const filename = `checklist-weekly-report-${summary.reportPeriod.startDate}-to-${summary.reportPeriod.endDate}.json`;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
      res.json(reportData);
    } else {
      throw new Error('Invalid format. Use csv or json');
    }

  } catch (error) {
    console.error('Error generating downloadable weekly report:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Helper function to format timestamp
function formatTimestamp(timestamp) {
  if (!timestamp) return '';
  try {
    const date = new Date(timestamp);
    return date.toLocaleString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  } catch (error) {
    return timestamp;
  }
}

// Helper function to get full outlet names
function getOutletFullName(code) {
  const outletNames = {
    'RR': 'Residency Road',
    'KOR': 'Koramangala',
    'JAY': 'Jayanagar',
    'SKN': 'Sahakarnagar',
    'RAJ': 'Rajajinagar',
    'KLN': 'Kalyan Nagar',
    'BLN': 'Bellandur',
    'WF': 'Whitefield',
    'HSR': 'HSR Layout',
    'ARK': 'Arekere',
    'IND': 'Indiranagar',
    'CK': 'Central Kitchen'
  };
  return outletNames[code] || code;
}

// Dashboard data endpoint - UPDATED
app.get('/api/dashboard-data', async (req, res) => {
  try {
    const period = req.query.period || '28 Day';
    console.log(`Dashboard data requested for period: ${period}`);
    
    if (!['28 Day', '7 Day', '1 Day'].includes(period)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid period. Must be one of: 7 Day, 1 Day',
      });
    }

    if (!sheets) {
      const initialized = await initializeGoogleServices();
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
    
    console.log(`Successfully processed dashboard data for ${period}:`, {
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
    console.error('Error fetching dashboard data:', error.message);
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
      await initializeGoogleServices();
    }

    console.log(`Debug: Fetching raw sheet data from ${DASHBOARD_SPREADSHEET_ID}`);
    
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
    console.error('Error fetching debug dashboard data:', error.message);
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
    console.log(`High Rated data requested for period: ${period}`);

    if (!['7 Days', '28 Day'].includes(period)) {
      res.set('Content-Type', 'application/json');
      return res.status(400).json({
        success: false,
        error: 'Invalid period. Must be one of: 7 Days, 28 Day',
      });
    }

    if (!sheets) {
      const initialized = await initializeGoogleServices();
      if (!initialized) {
        res.set('Content-Type', 'application/json');
        return res.status(500).json({
          success: false,
          error: 'Failed to initialize Google Sheets',
        });
      }
    }

    const HIGH_RATED_SPREADSHEET_ID = '1FYXr8Wz0ddN3mFi-0AQbI6J_noi2glPbJLh44CEMUnE';
    const HIGH_RATED_SHEET_NAME = 'High Rated Dashboard'; // CHANGED FROM 'High Rated Dashboard Live'

    console.log(`Fetching High Rated data for ${period} from: ${HIGH_RATED_SPREADSHEET_ID}`);

    const sheetResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: HIGH_RATED_SPREADSHEET_ID,
      range: `${HIGH_RATED_SHEET_NAME}!A1:Z50`,
    });

    console.log(`Retrieved ${sheetResponse.data.values ? sheetResponse.data.values.length : 0} rows from Google Sheets`);

    // Use Gemini to parse the messy data
    const rawDataText = sheetResponse.data.values
      .map(row => row.join('\t'))
      .join('\n');

    console.log('Sending data to Gemini for parsing...');
    
    const geminiPrompt = `You are a data parser that extracts structured information from outlet performance data. 

The data contains multiple columns, but you only need to extract these 4 fields for each outlet:

1. **Total Orders** - The total number of orders for the outlet
2. **High Rated Orders** - The number of high rated orders
3. **Total Low Rated** - The number of low rated orders  
4. **Error Rate** - The error rate percentage

IMPORTANT PARSING RULES:
- Each row represents one outlet's data
- The data may appear as continuous text without clear delimiters
- Outlet Name comes after Outlet Code (3-letter code like IND, KOR, RR, BLN, etc.)
- Numbers may have percentage signs (%) or decimal points
- Skip the TOTAL row if present (it aggregates all outlets)
- The data follows this pattern: Start Date, End Date, Outlet Code, Outlet Name, followed by the metrics

OUTPUT FORMAT:
Return ONLY a valid JSON array with this exact structure (no markdown, no code blocks, no explanations):

[
  {
    "outlet_name": "Indiranagar",
    "total_orders": 358,
    "high_rated_orders": 32,
    "low_rated_orders": 22,
    "error_rate": "1.12%"
  }
]

Here is the raw data to parse:

${rawDataText}

Remember: Return ONLY the JSON array, nothing else.`;

    const geminiResponse = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [{
          parts: [{ text: geminiPrompt }]
        }]
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      }
    );

    const geminiText = geminiResponse.data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
    console.log('Gemini response:', geminiText);

    // Clean the response (remove markdown code blocks if present)
    let cleanedText = geminiText.trim();
    if (cleanedText.startsWith('```json')) {
      cleanedText = cleanedText.replace(/```json\n?/g, '').replace(/```\n?$/g, '');
    } else if (cleanedText.startsWith('```')) {
      cleanedText = cleanedText.replace(/```\n?/g, '').replace(/```\n?$/g, '');
    }

    const processedData = JSON.parse(cleanedText);

    console.log(`Successfully processed High Rated data for ${period}:`, {
      outlets: processedData.length,
      sample: processedData[0] || {},
    });

    res.set('Content-Type', 'application/json');
    res.json({
      success: true,
      data: processedData,
      metadata: {
        spreadsheetId: HIGH_RATED_SPREADSHEET_ID,
        sheetName: HIGH_RATED_SHEET_NAME,
        period: period,
        rowCount: sheetResponse.data.values ? sheetResponse.data.values.length : 0,
        parsedBy: 'Gemini AI'
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching High Rated data:', error.message);
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
      console.log(`\nHIGH RATED FIXED COLUMN MAPPING DEBUG for "${outletName}":`);
      console.log(`  Row: ${i + 1}`);
      console.log(`  Total Orders (Column E): "${row[4]}" -> ${outletData.total_orders}`);
      console.log(`  Error Rate (Column I): "${row[8]}" -> ${outletData.error_rate}`);
      console.log(`  High Rated % (Column K): "${row[10]}" -> ${outletData.high_rated_percent}`);
      console.log(`  Incentives (Column O): "${row[14]}" -> ${outletData.incentives}\n`);
    }
  }
  
  console.log(`Processed ${processedData.length} High Rated outlets for ${requestedPeriod}`);
  
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
      await initializeGoogleServices();
    }

    const HIGH_RATED_SPREADSHEET_ID = '1FYXr8Wz0ddN3mFi-0AQbI6J_noi2glPbJLh44CEMUnE';
    const HIGH_RATED_SHEET_NAME = 'High Rated Dashboard';

    console.log(`Debug: Fetching raw High Rated data from ${HIGH_RATED_SPREADSHEET_ID}`);

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
    console.error('Error fetching debug High Rated data:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      spreadsheetId: '1FYXr8Wz0ddN3mFi-0AQbI6J_noi2glPbJLh44CEMUnE',
      sheetName: 'High Rated Dashboard',
    });
  }
});

// === SWIGGY DASHBOARD SPECIFIC FUNCTIONS ===

// Fixed Swiggy-specific data processing function
// Fixed Swiggy-specific data processing function WITH 28 DAY SUPPORT
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
  } else if (requestedPeriod === '28 Day') {
    // 28 Day: Headers at C41 (row 41), data from C42-C52 (rows 42-52)
    if (rawData.length > 41) {
      console.log('Processing 28 Day data: headers at C41, data from C42-C52');
      startRow = 41; // Row 42 (index 41) - data starts here
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
  } else if (requestedPeriod === '28 Day') {
    endRow = Math.min(51, rawData.length - 1); // C42-C52 range (rows 42-52)
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
      console.log(`\nSWIGGY COLUMN MAPPING DEBUG (FIXED) for "${location}":`);
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
  
  console.log(`Processed ${data.outlets.length} Swiggy outlets for ${requestedPeriod}`);
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
    console.log(`Generating Swiggy AI insights for ${period} data with ${data.outlets.length} outlets`);
    
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
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`,
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

// === ENHANCED PRODUCT ANALYSIS - NO RISTA API VERSION ===
// Uses ProductDetails sheet aggregation + 100% fuzzy matching

// Configuration
const DATE_FILTER_DAYS = 28; // Set to null to use all dates, or specify number of days (e.g., 28, 90)

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1, str2) {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix = Array(len2 + 1).fill(null).map(() => Array(len1 + 1).fill(0));

  for (let i = 0; i <= len1; i++) matrix[0][i] = i;
  for (let j = 0; j <= len2; j++) matrix[j][0] = j;

  for (let j = 1; j <= len2; j++) {
    for (let i = 1; i <= len1; i++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,     // deletion
        matrix[j - 1][i] + 1,     // insertion
        matrix[j - 1][i - 1] + cost // substitution
      );
    }
  }

  return matrix[len2][len1];
}

/**
 * Calculate fuzzy matching ratio (0-100) similar to rapidfuzz.fuzz.ratio
 */
function fuzzyRatio(str1, str2) {
  if (!str1 || !str2) return 0;
  if (str1 === str2) return 100;

  const distance = levenshteinDistance(str1, str2);
  const maxLen = Math.max(str1.length, str2.length);
  
  if (maxLen === 0) return 100;
  
  const similarity = (1 - distance / maxLen) * 100;
  return Math.round(similarity);
}

/**
 * Normalize product name for matching
 * Removes: leading X, quantities, parentheses, brackets, sizes, prices, punctuation
 */
function normalizeProductName(name) {
  if (!name) return '';

  return name
    .trim()
    .replace(/^\s*[xX][\s\-.]*/g, '')           // Strip leading X
    .replace(/^\d+[\sx]?\s*/i, '')              // Strip leading numbers
    .replace(/\(.*?\)/g, '')                    // Remove parentheses content
    .replace(/\[.*?\]/g, '')                    // Remove brackets content
    .replace(/qty\s*:?\s*\d+/gi, '')
    .replace(/quantity\s*:?\s*\d+/gi, '')
    .replace(/size\s*:?\s*(small|medium|large|s|m|l)/gi, '')
    .replace(/\d+\s*(ml|gm|gms|g|kg|mg|l|ltr|litre|piece|pcs|pack)/gi, '') // Remove units
    .replace(/₹\s*\d+/g, '')                    // Remove prices
    .replace(/[^\w\s]/g, '')                    // Remove punctuation
    .replace(/\s+/g, ' ')                       // Collapse spaces
    .toLowerCase()
    .trim();
}

/**
 * Calculate fuzzy match score using Levenshtein-based ratio (0-100)
 * Returns 100 for perfect matches only
 */
function calculateFuzzyScore(str1, str2) {
  const normalized1 = normalizeProductName(str1);
  const normalized2 = normalizeProductName(str2);
  
  if (!normalized1 || !normalized2) return 0;
  if (normalized1 === normalized2) return 100;
  
  // Use our custom fuzzyRatio function (equivalent to rapidfuzz.fuzz.ratio)
  return fuzzyRatio(normalized1, normalized2);
}

/**
 * Parse date and check if within filter range
 */
function isDateWithinRange(dateStr, daysBack) {
  if (!daysBack) return true; // No filter, accept all dates
  
  const date = parseFlexibleDate(dateStr);
  if (!date) return false;
  
  const today = new Date();
  const cutoffDate = new Date();
  cutoffDate.setDate(today.getDate() - daysBack);
  
  return date >= cutoffDate && date <= today;
}

/**
 * Helper function to parse dates flexibly
 */
function parseFlexibleDate(dateStr) {
  if (!dateStr || dateStr.trim() === '') return null;
  
  const trimmed = dateStr.trim();
  
  // Try standard Date parse first
  let date = new Date(trimmed);
  if (!isNaN(date.getTime())) return date;
  
  // Try DD/MM/YYYY or DD-MM-YYYY
  const ddmmyyyyMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (ddmmyyyyMatch) {
    const [, day, month, year] = ddmmyyyyMatch;
    date = new Date(year, month - 1, day);
    if (!isNaN(date.getTime())) return date;
  }
  
  // Try YYYY-MM-DD
  const yyyymmddMatch = trimmed.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (yyyymmddMatch) {
    const [, year, month, day] = yyyymmddMatch;
    date = new Date(year, month - 1, day);
    if (!isNaN(date.getTime())) return date;
  }
  
  // Try Excel serial number
  const serialNumber = parseFloat(trimmed);
  if (serialNumber > 0) {
    const baseDate = new Date(1899, 11, 30);
    date = new Date(baseDate.getTime() + serialNumber * 24 * 60 * 60 * 1000);
    if (!isNaN(date.getTime())) return date;
  }
  
  return null;
}

/**
 * Advanced date parsing for natural language queries
 * Supports: "December 10", "Dec 10", "10 Dec 2024", "10th December", etc.
 */
function parseNaturalDate(dateStr) {
  if (!dateStr) return null;

  const str = dateStr.toLowerCase().trim();
  const currentYear = new Date().getFullYear();

  // Month names mapping
  const months = {
    jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
    apr: 3, april: 3, may: 4, jun: 5, june: 5,
    jul: 6, july: 6, aug: 7, august: 7, sep: 8, september: 8,
    oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11
  };

  // Pattern: "December 10", "Dec 10", "10 December", "10 Dec"
  const monthDayPattern = /(\d{1,2})(?:st|nd|rd|th)?\s+(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|september|oct|october|nov|november|dec|december)|((jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|september|oct|october|nov|november|dec|december)\s+(\d{1,2})(?:st|nd|rd|th)?)/i;

  const match = str.match(monthDayPattern);
  if (match) {
    let day, monthName;
    if (match[1]) {
      // Pattern: "10 December"
      day = parseInt(match[1]);
      monthName = match[2].toLowerCase();
    } else {
      // Pattern: "December 10"
      monthName = match[4].toLowerCase();
      day = parseInt(match[5]);
    }

    const month = months[monthName];
    if (month !== undefined && day >= 1 && day <= 31) {
      return new Date(currentYear, month, day);
    }
  }

  // Try the flexible date parser as fallback
  return parseFlexibleDate(dateStr);
}

/**
 * Outlet name mapping - handles all variations
 * Maps user queries and sheet data to canonical names
 */
const OUTLET_MAPPINGS = [
  {
    names: ['bellandur'],
    normalized: 'CK Bellandur',
    sheetNames: ['CK Bellandur']
  },
  {
    names: ['indiranagar', 'indira nagar'],
    normalized: 'CK Indiranagar',
    sheetNames: ['CK Indiranagar']
  },
  {
    names: ['kalyan nagar', 'kalyannagar', 'kalyan'],
    normalized: 'CK Kalyan Nagar',
    sheetNames: ['CK Kalyan Nagar']
  },
  {
    names: ['sahakarnagar', 'sahakara nagar', 'sahkar nagar'],
    normalized: 'CK Sahakarnagar',
    sheetNames: ['CK Sahakarnagar']
  },
  {
    names: ['koramangala', 'koramangla'],
    normalized: 'Koramangala',
    sheetNames: ['Koramangala']
  },
  {
    names: ['residency road', 'residency', 'rr'],
    normalized: 'Residency Road',
    sheetNames: ['Residency Road']
  },
  {
    names: ['hsr layout', 'hsr', 'hsrlayout'],
    normalized: 'CK HSR Layout',
    sheetNames: ['CK HSR Layout']
  },
  {
    names: ['whitefield', 'white field', 'whitefiled'],
    normalized: 'CK Whitefiled',
    sheetNames: ['CK Whitefiled']
  },
  {
    names: ['jayanagar', 'jaya nagar'],
    normalized: 'Jayanagar',
    sheetNames: ['Jayanagar']
  },
  {
    names: ['rajajinagar', 'raja ji nagar', 'rajaji nagar'],
    normalized: 'Rajajinagar',
    sheetNames: ['Rajajinagar']
  },
  {
    names: ['arekere'],
    normalized: 'CK Arekere',
    sheetNames: ['CK Arekere']
  },
  {
    names: ['ferrohub', 'budigere', 'ferrohub budigere'],
    normalized: 'Ferrohub Budigere',
    sheetNames: ['Ferrohub Budigere']
  }
];

/**
 * Check if two branch names match (handles all variations)
 */
function branchesMatch(branch1, branch2) {
  if (!branch1 || !branch2) return false;

  const b1Lower = branch1.toLowerCase().trim();
  const b2Lower = branch2.toLowerCase().trim();

  // Exact match
  if (b1Lower === b2Lower) return true;

  // Find outlet mapping for both branches
  const outlet1 = OUTLET_MAPPINGS.find(o =>
    o.names.includes(b1Lower) ||
    o.sheetNames.some(s => s.toLowerCase() === b1Lower)
  );

  const outlet2 = OUTLET_MAPPINGS.find(o =>
    o.names.includes(b2Lower) ||
    o.sheetNames.some(s => s.toLowerCase() === b2Lower)
  );

  // If both map to the same normalized outlet, they match
  if (outlet1 && outlet2 && outlet1.normalized === outlet2.normalized) {
    return true;
  }

  return false;
}

/**
 * Parse branch and channel filters from natural language
 * Examples: "CK Arekere", "Bellandur", "swiggy", "zomato", "dine in"
 * Returns: { branch, channel }
 */
function parseFilters(message) {
  const lowerMessage = message.toLowerCase();
  let branch = null;
  let channel = null;

  // Parse channel filters (match exact sheet format)
  if (lowerMessage.includes('swiggy')) {
    channel = 'Swiggy';
  } else if (lowerMessage.includes('zomato')) {
    channel = 'Zomato';
  } else if (lowerMessage.includes('dine in') || lowerMessage.includes('dine-in') || lowerMessage.includes('dinein')) {
    channel = 'Dine-in';
  } else if (lowerMessage.includes('ownly')) {
    channel = 'Ownly';
  } else if (lowerMessage.includes('magicpin') || lowerMessage.includes('magic pin')) {
    channel = 'Magicpin';
  }

  // Check for outlet mentions in the message
  for (const outlet of OUTLET_MAPPINGS) {
    for (const name of outlet.names) {
      if (lowerMessage.includes(name)) {
        branch = outlet.normalized;
        break;
      }
    }
    if (branch) break;
  }

  console.log(`Parsed filters - Branch: ${branch || 'None'}, Channel: ${channel || 'None'}`);
  return { branch, channel };
}

/**
 * Parse date query from natural language
 * Returns: { type, startDate, endDate, compareTo }
 */
function parseDateQuery(message) {
  const lowerMessage = message.toLowerCase();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Check for comparison queries first
  const comparisonPatterns = [
    /last\s+(\d+)\s+days?\s+(?:vs|versus|compar(?:ed|ing)\s+(?:to|the)|and)\s+(?:previous|the)\s+(\d+)\s+days?/i,
    /last\s+(\d+)\s+days?\s+(?:vs|versus|compar(?:ed|ing)\s+(?:to|the)|and)\s+(\d+)\s+days?\s+before/i,
    /this\s+week\s+(?:vs|versus|compar(?:ed|ing)\s+(?:to|the)|and)\s+last\s+week/i,
    /this\s+month\s+(?:vs|versus|compar(?:ed|ing)\s+(?:to|the)|and)\s+last\s+month/i,
  ];

  // Check for "last 7 days vs previous 7 days" pattern
  const lastVsPrevious = lowerMessage.match(/last\s+(\d+)\s+days?\s+(?:vs|versus|compar(?:ed|ing)\s+(?:to|the)|and)\s+(?:previous|the)\s+(\d+)\s+days?/i);
  if (lastVsPrevious) {
    const days1 = parseInt(lastVsPrevious[1]);
    const days2 = parseInt(lastVsPrevious[2] || lastVsPrevious[1]);

    return {
      type: 'comparison',
      period1: {
        startDate: new Date(today.getTime() - days1 * 24 * 60 * 60 * 1000),
        endDate: new Date(today),
        days: days1,
        label: `Last ${days1} days`
      },
      period2: {
        startDate: new Date(today.getTime() - (days1 + days2) * 24 * 60 * 60 * 1000),
        endDate: new Date(today.getTime() - days1 * 24 * 60 * 60 * 1000),
        days: days2,
        label: `Previous ${days2} days`
      }
    };
  }

  // Check for "last X days and Y days before that" pattern
  const lastAndBefore = lowerMessage.match(/last\s+(\d+)\s+days?\s+(?:and|vs|versus|compar(?:ed|ing)\s+(?:to|the))\s+(\d+)\s+days?\s+before\s+(?:that|it)/i);
  if (lastAndBefore) {
    const days1 = parseInt(lastAndBefore[1]);
    const days2 = parseInt(lastAndBefore[2]);
    return {
      type: 'comparison',
      period1: {
        startDate: new Date(today.getTime() - days1 * 24 * 60 * 60 * 1000),
        endDate: new Date(today),
        days: days1,
        label: `Last ${days1} days`
      },
      period2: {
        startDate: new Date(today.getTime() - (days1 + days2) * 24 * 60 * 60 * 1000),
        endDate: new Date(today.getTime() - days1 * 24 * 60 * 60 * 1000),
        days: days2,
        label: `${days2} days before that`
      }
    };
  }

  // Check for "7 days before that" pattern (when "last X days" is mentioned earlier in conversation)
  const beforeThat = lowerMessage.match(/(\d+)\s+days?\s+before\s+(?:that|it)/i);
  if (beforeThat) {
    const days = parseInt(beforeThat[1]);
    return {
      type: 'comparison',
      period1: {
        startDate: new Date(today.getTime() - days * 24 * 60 * 60 * 1000),
        endDate: new Date(today),
        days: days,
        label: `Last ${days} days`
      },
      period2: {
        startDate: new Date(today.getTime() - days * 2 * 24 * 60 * 60 * 1000),
        endDate: new Date(today.getTime() - days * 24 * 60 * 60 * 1000),
        days: days,
        label: `Previous ${days} days`
      }
    };
  }

  // Check for "last week vs the week before that/last" pattern
  if (/last\s+week\s+(?:vs|versus|compar(?:ed|ing)\s+(?:to|the)|and)\s+(?:the\s+)?week\s+before\s+(?:that|last)/i.test(lowerMessage)) {
    return {
      type: 'comparison',
      period1: {
        startDate: new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000),
        endDate: new Date(today),
        days: 7,
        label: 'Last week'
      },
      period2: {
        startDate: new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000),
        endDate: new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000),
        days: 7,
        label: 'Week before last'
      }
    };
  }

  // Check for this week vs last week
  if (/this\s+week\s+(?:vs|versus|compar(?:ed|ing)\s+(?:to|the)|and)\s+last\s+week/i.test(lowerMessage)) {
    const dayOfWeek = today.getDay();
    const thisWeekStart = new Date(today.getTime() - dayOfWeek * 24 * 60 * 60 * 1000);
    const lastWeekStart = new Date(thisWeekStart.getTime() - 7 * 24 * 60 * 60 * 1000);

    return {
      type: 'comparison',
      period1: {
        startDate: thisWeekStart,
        endDate: new Date(today),
        label: 'This week'
      },
      period2: {
        startDate: lastWeekStart,
        endDate: new Date(thisWeekStart),
        label: 'Last week'
      }
    };
  }

  // Check for specific date mentions with various patterns
  // Pattern 1: With prepositions - "on December 10", "for Dec 10", "about Dec 10"
  let dateMatch = lowerMessage.match(/(?:on|for|about)\s+([a-z]+\s+\d{1,2}(?:st|nd|rd|th)?|\d{1,2}(?:st|nd|rd|th)?\s+[a-z]+)/i);

  // Pattern 2: Without prepositions - just the date itself "10th dec", "December 10"
  if (!dateMatch) {
    dateMatch = lowerMessage.match(/\b(\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|september|oct|october|nov|november|dec|december)|(?:jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|september|oct|october|nov|november|dec|december)\s+\d{1,2}(?:st|nd|rd|th)?)\b/i);
  }

  if (dateMatch) {
    const dateStr = dateMatch[1];
    const specificDate = parseNaturalDate(dateStr);
    if (specificDate) {
      const nextDay = new Date(specificDate);
      nextDay.setDate(nextDay.getDate() + 1);
      return {
        type: 'specific',
        startDate: specificDate,
        endDate: nextDay,
        label: specificDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      };
    }
  }

  // Check for simple relative dates (existing functionality)
  if (lowerMessage.includes('today') || lowerMessage.includes('last 24 hours')) {
    return {
      type: 'relative',
      days: 1,
      startDate: new Date(today.getTime() - 24 * 60 * 60 * 1000),
      endDate: new Date(today),
      label: 'Today'
    };
  }

  if (lowerMessage.includes('yesterday')) {
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const dayBefore = new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000);
    return {
      type: 'specific',
      startDate: dayBefore,
      endDate: yesterday,
      label: 'Yesterday'
    };
  }

  const relativeDays = [
    { pattern: /last\s+(\d+)\s+days?/i, extractor: (m) => parseInt(m[1]) },
    { pattern: /last\s+week|last\s+7\s+days/i, extractor: () => 7 },
    { pattern: /last\s+2\s+weeks|last\s+14\s+days/i, extractor: () => 14 },
    { pattern: /last\s+month|last\s+30\s+days/i, extractor: () => 30 },
  ];

  for (const { pattern, extractor } of relativeDays) {
    const match = lowerMessage.match(pattern);
    if (match) {
      const days = extractor(match);
      return {
        type: 'relative',
        days: days,
        startDate: new Date(today.getTime() - days * 24 * 60 * 60 * 1000),
        endDate: new Date(today),
        label: `Last ${days} days`
      };
    }
  }

  // No specific date filter
  return null;
}

/**
 * Check if a date falls within a date range
 */
function isDateInRange(dateStr, startDate, endDate) {
  const date = parseFlexibleDate(dateStr);
  if (!date) return false;

  // Set times to compare dates only
  const checkDate = new Date(date);
  checkDate.setHours(0, 0, 0, 0);

  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);

  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);

  return checkDate >= start && checkDate < end;
}

/**
 * Parse currency value - removes ₹ symbol, commas, and other non-numeric characters
 * @param {string|number} value - The value to parse
 * @returns {number} - Parsed number or 0
 */
function parseCurrencyValue(value) {
  if (!value) return 0;
  // Convert to string and remove ₹, commas, and extra spaces
  const cleanValue = value.toString().replace(/[₹,\s]/g, '');
  const parsed = parseFloat(cleanValue);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Process ProductDetails sheet - Aggregate orders by item name with date filter
 * @param {Array} rawData - The raw sheet data
 * @param {Number|Object} filterOrRange - Either daysFilter (number) or dateRange {startDate, endDate}
 */
function processProductDetailsSheet(rawData, filterOrRange = DATE_FILTER_DAYS, additionalFilters = {}) {
  if (!rawData || rawData.length < 2) return [];

  const headers = rawData[0];
  const dateIndex = headers.findIndex(h => h && h.toLowerCase().includes('date'));
  const itemNameIndex = headers.findIndex(h => h && h.toLowerCase().includes('item name'));
  const orderCountIndex = headers.findIndex(h => h && h.toLowerCase().includes('order count'));
  const branchIndex = headers.findIndex(h => h && h.toLowerCase().includes('branch'));
  const channelIndex = headers.findIndex(h => h && h.toLowerCase().includes('channel'));
  const revenueIndex = headers.findIndex(h => h && h.toLowerCase() === 'revenue');

  console.log(`ProductDetails columns - Date: ${dateIndex}, Item Name: ${itemNameIndex}, Order Count: ${orderCountIndex}, Branch: ${branchIndex}, Channel: ${channelIndex}, Revenue: ${revenueIndex}`);

  if (revenueIndex === -1) {
    console.warn('WARNING: Revenue column not found in ProductDetails sheet');
  }

  if (dateIndex === -1 || itemNameIndex === -1 || orderCountIndex === -1) {
    console.error('ERROR: Required columns not found in ProductDetails sheet');
    return [];
  }

  // Determine filter type
  const isRangeFilter = filterOrRange && typeof filterOrRange === 'object' && filterOrRange.startDate;
  const daysFilter = !isRangeFilter ? filterOrRange : null;
  const dateRange = isRangeFilter ? filterOrRange : null;

  // Extract additional filters
  const { branch, channel } = additionalFilters;

  // Use a Map to aggregate order counts by item name
  const itemsMap = new Map();
  let totalRowsProcessed = 0;
  let rowsFiltered = 0;

  for (let i = 1; i < rawData.length; i++) {
    const row = rawData[i];
    const dateStr = row[dateIndex]?.toString().trim();
    const itemName = row[itemNameIndex]?.toString().trim();
    const orderCount = parseInt(row[orderCountIndex]) || 0;
    const branchName = branchIndex !== -1 ? row[branchIndex]?.toString().trim() : '';
    const channelName = channelIndex !== -1 ? row[channelIndex]?.toString().trim() : '';
    const revenue = revenueIndex !== -1 ? parseCurrencyValue(row[revenueIndex]) : 0;

    if (!itemName) continue;

    // Apply date filter if specified
    let includeRow = true;
    if (dateRange) {
      includeRow = isDateInRange(dateStr, dateRange.startDate, dateRange.endDate);
    } else if (daysFilter) {
      includeRow = isDateWithinRange(dateStr, daysFilter);
    }

    if (!includeRow) {
      rowsFiltered++;
      continue;
    }

    // Apply branch filter if specified (use smart matching for CK/outlet variations)
    if (branch && !branchesMatch(branchName, branch)) {
      rowsFiltered++;
      continue;
    }

    // Apply channel filter if specified
    if (channel && channelName.toLowerCase() !== channel.toLowerCase()) {
      rowsFiltered++;
      continue;
    }

    totalRowsProcessed++;
    const normalizedName = normalizeProductName(itemName);

    // Aggregate counts and revenue for the same item across different dates
    if (itemsMap.has(normalizedName)) {
      const existing = itemsMap.get(normalizedName);
      existing.totalOrders += orderCount;
      existing.totalRevenue += revenue;
    } else {
      itemsMap.set(normalizedName, {
        itemName,
        totalOrders: orderCount,
        totalRevenue: revenue,
        normalizedName
      });
    }
  }

  // Convert Map to array
  const items = Array.from(itemsMap.values());
  
  console.log(`\nProductDetails Processing:`);
  console.log(`  Total rows: ${rawData.length - 1}`);
  console.log(`  Rows filtered: ${rowsFiltered}`);
  console.log(`  Rows processed: ${totalRowsProcessed}`);
  console.log(`  Unique items: ${items.length}`);
  if (dateRange) {
    console.log(`  Date range: ${dateRange.startDate.toLocaleDateString()} to ${dateRange.endDate.toLocaleDateString()}`);
  } else {
    console.log(`  Date filter: ${daysFilter ? `Last ${daysFilter} days` : 'All dates'}`);
  }
  if (branch) {
    console.log(`  Branch filter: ${branch}`);
  }
  if (channel) {
    console.log(`  Channel filter: ${channel}`);
  }

  return items;
}

/**
 * Process Zomato orders and categorize ratings into high/low rated
 * High rated: 4 stars and above
 * Low rated: below 3 stars
 * DEDUPLICATES based on Order ID to avoid counting same order multiple times
 */
function processZomatoOrdersDataWithRatings(rawData, filterOrRange = null) {
  if (!rawData || rawData.length <= 1) return [];

  const headers = rawData[0];
  const dataRows = rawData.slice(1);

  console.log('\nZomato Orders Headers:', headers);

  const itemsIndex = headers.findIndex(h => h && h.toLowerCase().includes('items in order'));
  const ratingIndex = headers.findIndex(h => h && h.toLowerCase().includes('rating'));
  const orderIdIndex = headers.findIndex(h => h && (h.toLowerCase().includes('order id') || h.toLowerCase().includes('order no')));
  const dateIndex = headers.findIndex(h => h && (h.toLowerCase().includes('date') || h.toLowerCase().includes('placed at') || h.toLowerCase().includes('timestamp')));

  console.log(`Zomato Orders - Items column: ${itemsIndex}, Rating column: ${ratingIndex}, Order ID column: ${orderIdIndex}, Date column: ${dateIndex}`);

  // Determine filter type
  const isRangeFilter = filterOrRange && typeof filterOrRange === 'object' && filterOrRange.startDate;
  const daysFilter = !isRangeFilter ? filterOrRange : null;
  const dateRange = isRangeFilter ? filterOrRange : null;

  if (itemsIndex === -1) {
    console.error('ERROR: Items in order column not found in Zomato sheet');
    return [];
  }

  const itemCounts = new Map();
  const itemRatings = new Map();
  const itemHighRated = new Map();
  const itemLowRated = new Map();
  const processedOrderIds = new Set(); // Track processed Order IDs

  let totalOrders = 0;
  let ordersWithRatings = 0;
  let duplicateOrders = 0;
  let rowsFilteredByDate = 0;

  dataRows.forEach(row => {
    const itemsCell = getCellValue(row, itemsIndex);
    const rating = parseFloat(getCellValue(row, ratingIndex)) || 0;
    const orderId = orderIdIndex !== -1 ? getCellValue(row, orderIdIndex) : null;
    const dateStr = dateIndex !== -1 ? getCellValue(row, dateIndex) : null;

    // Apply date filter if specified
    let includeRow = true;
    if (dateStr) {
      if (dateRange) {
        includeRow = isDateInRange(dateStr, dateRange.startDate, dateRange.endDate);
      } else if (daysFilter) {
        includeRow = isDateWithinRange(dateStr, daysFilter);
      }
    }

    if (!includeRow) {
      rowsFilteredByDate++;
      return;
    }

    // Skip if this Order ID has already been processed
    if (orderId && processedOrderIds.has(orderId)) {
      duplicateOrders++;
      return;
    }

    // Mark this Order ID as processed
    if (orderId) {
      processedOrderIds.add(orderId);
    }

    totalOrders++;

    if (!itemsCell || !itemsCell.trim()) {
      return;
    }

    if (rating > 0) ordersWithRatings++;

    const items = parseItemsFromCell(itemsCell);

    items.forEach(item => {
      if (item && item.trim()) {
        const cleanItem = item.trim();
        const normalizedItem = normalizeProductName(cleanItem);

        itemCounts.set(normalizedItem, (itemCounts.get(normalizedItem) || 0) + 1);

        if (!itemRatings.has(normalizedItem)) {
          itemRatings.set(normalizedItem, []);
        }
        if (rating > 0) {
          itemRatings.get(normalizedItem).push(rating);

          // Categorize as high or low rated
          if (rating >= 4.0) {
            itemHighRated.set(normalizedItem, (itemHighRated.get(normalizedItem) || 0) + 1);
          } else if (rating < 3.0) {
            itemLowRated.set(normalizedItem, (itemLowRated.get(normalizedItem) || 0) + 1);
          }
        }
      }
    });
  });
  
  const result = [];
  itemCounts.forEach((count, normalizedItem) => {
    const ratings = itemRatings.get(normalizedItem) || [];
    const avgRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
    const highRated = itemHighRated.get(normalizedItem) || 0;
    const lowRated = itemLowRated.get(normalizedItem) || 0;
    
    result.push({
      normalizedName: normalizedItem,
      orders: count,
      rating: avgRating,
      highRated: highRated,
      lowRated: lowRated
    });
  });
  
  console.log(`\nZomato Processing:`);
  console.log(`  Total orders processed: ${totalOrders}`);
  console.log(`  Duplicate orders skipped: ${duplicateOrders}`);
  console.log(`  Rows filtered by date: ${rowsFilteredByDate}`);
  console.log(`  Orders with ratings: ${ordersWithRatings}`);
  console.log(`  Unique items: ${result.length}`);
  if (dateRange) {
    console.log(`  Date range: ${dateRange.startDate.toLocaleDateString()} to ${dateRange.endDate.toLocaleDateString()}`);
  } else {
    console.log(`  Date filter: ${daysFilter ? `Last ${daysFilter} days` : 'All dates'}`);
  }

  return result;
}

/**
 * Process Swiggy reviews and categorize ratings into high/low rated
 * High rated: 4 stars and above
 * Low rated: below 3 stars
 */
function processSwiggyReviewDataWithRatings(rawData, filterOrRange = null) {
  if (!rawData || rawData.length <= 1) return [];

  const headers = rawData[0];
  const dataRows = rawData.slice(1);

  console.log('\nSwiggy Review Headers:', headers);

  const itemOrderedIndex = headers.findIndex(h => h && h.toLowerCase().includes('item ordered'));
  const ratingIndex = headers.findIndex(h => h && h.toLowerCase().includes('rating'));
  const dateIndex = headers.findIndex(h => h && (h.toLowerCase().includes('date') || h.toLowerCase().includes('timestamp')));

  console.log(`Swiggy Review - Item column: ${itemOrderedIndex}, Rating column: ${ratingIndex}, Date column: ${dateIndex}`);

  // Determine filter type
  const isRangeFilter = filterOrRange && typeof filterOrRange === 'object' && filterOrRange.startDate;
  const daysFilter = !isRangeFilter ? filterOrRange : null;
  const dateRange = isRangeFilter ? filterOrRange : null;
  
  if (itemOrderedIndex === -1) {
    console.error('ERROR: Item Ordered column not found in Swiggy sheet');
    return [];
  }
  
  const itemCounts = new Map();
  const itemRatings = new Map();
  const itemHighRated = new Map();
  const itemLowRated = new Map();
  let rowsFilteredByDate = 0;

  dataRows.forEach(row => {
    const itemCell = getCellValue(row, itemOrderedIndex);
    const rating = parseFloat(getCellValue(row, ratingIndex)) || 0;
    const dateStr = dateIndex !== -1 ? getCellValue(row, dateIndex) : null;

    // Apply date filter if specified
    let includeRow = true;
    if (dateStr) {
      if (dateRange) {
        includeRow = isDateInRange(dateStr, dateRange.startDate, dateRange.endDate);
      } else if (daysFilter) {
        includeRow = isDateWithinRange(dateStr, daysFilter);
      }
    }

    if (!includeRow) {
      rowsFilteredByDate++;
      return;
    }

    if (itemCell && itemCell.trim()) {
      const items = parseItemsFromCell(itemCell);
      
      items.forEach(item => {
        if (item && item.trim()) {
          const cleanItem = item.trim();
          const normalizedItem = normalizeProductName(cleanItem);
          
          itemCounts.set(normalizedItem, (itemCounts.get(normalizedItem) || 0) + 1);
          
          if (!itemRatings.has(normalizedItem)) {
            itemRatings.set(normalizedItem, []);
          }
          if (rating > 0) {
            itemRatings.get(normalizedItem).push(rating);
            
            // Categorize as high or low rated
            if (rating >= 4.0) {
              itemHighRated.set(normalizedItem, (itemHighRated.get(normalizedItem) || 0) + 1);
            } else if (rating < 3.0) {
              itemLowRated.set(normalizedItem, (itemLowRated.get(normalizedItem) || 0) + 1);
            }
          }
        }
      });
    }
  });
  
  const result = [];
  itemCounts.forEach((count, normalizedItem) => {
    const ratings = itemRatings.get(normalizedItem) || [];
    const avgRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
    const highRated = itemHighRated.get(normalizedItem) || 0;
    const lowRated = itemLowRated.get(normalizedItem) || 0;
    
    result.push({
      normalizedName: normalizedItem,
      orders: count,
      rating: avgRating,
      highRated: highRated,
      lowRated: lowRated
    });
  });
  
  console.log(`\nSwiggy Processing:`);
  console.log(`  Rows filtered by date: ${rowsFilteredByDate}`);
  console.log(`  Unique items: ${result.length}`);
  if (dateRange) {
    console.log(`  Date range: ${dateRange.startDate.toLocaleDateString()} to ${dateRange.endDate.toLocaleDateString()}`);
  } else {
    console.log(`  Date filter: ${daysFilter ? `Last ${daysFilter} days` : 'All dates'}`);
  }
  
  return result;
}

/**
 * Match ProductDetails items with Zomato and Swiggy using 100% fuzzy matching
 * Only includes items with at least one 100% match
 */
function matchProductsWithRatings(productDetails, zomatoItems, swiggyItems) {
  console.log('\n' + '='.repeat(60));
  console.log('MATCHING PRODUCTS (100% THRESHOLD ONLY)');
  console.log('='.repeat(60));
  
  const matchedProducts = [];
  const unmatchedProducts = [];
  
  let perfectMatches = 0;
  let noMatches = 0;
  
  for (const product of productDetails) {
    const productNormalized = product.normalizedName;

    let zomatoMatch = null;
    let swiggyMatch = null;
    let hasMatch = false;

    // Find exact match in Zomato (both are already normalized)
    for (const zItem of zomatoItems) {
      if (productNormalized === zItem.normalizedName) {
        zomatoMatch = zItem;
        hasMatch = true;
        break; // Take first perfect match only
      }
    }

    // Find exact match in Swiggy (both are already normalized)
    for (const sItem of swiggyItems) {
      if (productNormalized === sItem.normalizedName) {
        swiggyMatch = sItem;
        hasMatch = true;
        break; // Take first perfect match only
      }
    }
    
    if (hasMatch) {
      perfectMatches++;
      
      // Calculate combined ratings
      const zomatoRating = zomatoMatch ? zomatoMatch.rating : 0;
      const swiggyRating = swiggyMatch ? swiggyMatch.rating : 0;
      
      const ratings = [];
      if (zomatoRating > 0) ratings.push(zomatoRating);
      if (swiggyRating > 0) ratings.push(swiggyRating);
      
      const avgRating = ratings.length > 0
        ? ratings.reduce((a, b) => a + b, 0) / ratings.length
        : 0;
      
      // Aggregate high/low rated counts
      const highRated = (zomatoMatch?.highRated || 0) + (swiggyMatch?.highRated || 0);
      const lowRated = (zomatoMatch?.lowRated || 0) + (swiggyMatch?.lowRated || 0);
      
      // Calculate percentages based on total orders from ProductDetails
      const totalOrders = product.totalOrders;
      const lowRatedPercentage = totalOrders > 0 ? (lowRated / totalOrders * 100) : 0;
      const highRatedPercentage = totalOrders > 0 ? (highRated / totalOrders * 100) : 0;
      
      matchedProducts.push({
        name: product.itemName,
        totalOrders: totalOrders,
        totalRevenue: product.totalRevenue || 0,
        zomatoMatch: zomatoMatch ? '✓' : '✗',
        swiggyMatch: swiggyMatch ? '✓' : '✗',
        avgRating: parseFloat(avgRating.toFixed(2)),
        zomatoRating: parseFloat(zomatoRating.toFixed(2)),
        swiggyRating: parseFloat(swiggyRating.toFixed(2)),
        highRated: highRated,
        lowRated: lowRated,
        highRatedPercentage: parseFloat(highRatedPercentage.toFixed(2)),
        lowRatedPercentage: parseFloat(lowRatedPercentage.toFixed(2))
      });
    } else {
      noMatches++;
      unmatchedProducts.push({
        name: product.itemName,
        totalOrders: product.totalOrders,
        normalizedName: product.normalizedName
      });
    }
  }
  
  // Sort matched products by total orders (descending)
  matchedProducts.sort((a, b) => b.totalOrders - a.totalOrders);
  
  console.log(`\nMatching Results:`);
  console.log(`  Perfect matches (100%): ${perfectMatches}`);
  console.log(`  No matches: ${noMatches}`);
  console.log(`  Total processed: ${productDetails.length}`);
  
  return { matchedProducts, unmatchedProducts };
}

/**
 * Helper functions
 */
function parseItemsFromCell(cellValue) {
  if (!cellValue) return [];
  
  const separators = [',', ';', '|', '\n', ' + ', ' & ', ' and '];
  let items = [cellValue];
  
  separators.forEach(sep => {
    items = items.flatMap(item => item.split(sep));
  });
  
  return items
    .map(item => item.trim())
    .filter(item => item.length > 0)
    .map(item => cleanItemName(item));
}

function cleanItemName(itemName) {
  if (!itemName) return '';
  
  let cleaned = itemName
    .replace(/^\d+[\sx]?\s*/i, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/qty\s*:?\s*\d+/gi, '')
    .replace(/quantity\s*:?\s*\d+/gi, '')
    .replace(/size\s*:?\s*(small|medium|large|s|m|l)/gi, '')
    .replace(/₹\s*\d+/g, '')
    .trim();
  
  return cleaned;
}

function getCellValue(row, index) {
  return (index >= 0 && row[index]) ? row[index].trim() : '';
}

/**
 * Main function to process product analysis data from Google Sheets
 * NO RISTA API - Uses ProductDetails aggregation only
 */
async function processProductAnalysisData(spreadsheetId, daysFilter = DATE_FILTER_DAYS, additionalFilters = {}, ratingsRequired = true) {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('PRODUCT ANALYSIS - NO RISTA API VERSION');
  console.log('Using ProductDetails Sheet Aggregation + 100% Fuzzy Matching');
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log(`Spreadsheet ID: ${spreadsheetId}`);
  console.log(`Date Filter: ${daysFilter ? `Last ${daysFilter} days` : 'All dates'}`);
  console.log(`Ratings Required: ${ratingsRequired}`);
  if (additionalFilters.branch) console.log(`Branch Filter: ${additionalFilters.branch}`);
  if (additionalFilters.channel) console.log(`Channel Filter: ${additionalFilters.channel}`);
  console.log('');

  try {
    if (!sheets) {
      const initialized = await initializeGoogleServices();
      if (!initialized) {
        throw new Error('Failed to initialize Google Sheets');
      }
    }

    // Step 1: Fetch all sheet data in parallel
    console.log('Fetching sheet data...');
    const [productDetailsData, zomatoOrdersData, swiggyReviewData] = await Promise.all([
      sheets.spreadsheets.values.get({
        spreadsheetId: spreadsheetId,
        range: 'ProductDetails!A:Z'
      }).catch(e => ({ data: { values: [] }, error: e.message })),

      sheets.spreadsheets.values.get({
        spreadsheetId: spreadsheetId,
        range: 'zomato_orders!A:Z'
      }).catch(e => ({ data: { values: [] }, error: e.message })),

      sheets.spreadsheets.values.get({
        spreadsheetId: spreadsheetId,
        range: 'Copy of swiggy_review!A:Z'
      }).catch(e => ({ data: { values: [] }, error: e.message }))
    ]);

    // Step 2: Process ProductDetails sheet with date filter and additional filters
    const productDetails = processProductDetailsSheet(productDetailsData.data.values, daysFilter, additionalFilters);
    
    if (productDetails.length === 0) {
      console.error('ERROR: No products found in ProductDetails sheet');
      return createEmptyProductDataStructure();
    }

    // Step 3: Process rating data from Zomato and Swiggy with date filter
    const zomatoItems = processZomatoOrdersDataWithRatings(zomatoOrdersData.data.values, daysFilter);
    const swiggyItems = processSwiggyReviewDataWithRatings(swiggyReviewData.data.values, daysFilter);

    // Step 4: Match products with 100% fuzzy matching
    const { matchedProducts, unmatchedProducts } = matchProductsWithRatings(
      productDetails,
      zomatoItems,
      swiggyItems
    );

    // Step 5: Determine which products to return based on ratingsRequired flag
    let productsToReturn, productsForCalculation;

    if (ratingsRequired) {
      productsToReturn = matchedProducts;
      productsForCalculation = matchedProducts;
    } else {
      // When ratings are not required, use all products from productDetails
      // but add default rating properties to prevent errors in response generation
      productsToReturn = productDetails.map(p => ({
        ...p,
        name: p.itemName, // Add name alias
        avgRating: 0,
        highRated: 0,
        lowRated: 0,
        highRatedPercentage: 0,
        lowRatedPercentage: 0
      }));
      productsForCalculation = productsToReturn;
    }

    // Step 6: Calculate summary
    const summary = {
      totalProductsInSheet: productDetails.length,
      matchedProducts: matchedProducts.length,
      unmatchedProducts: unmatchedProducts.length,
      totalOrders: productsForCalculation.reduce((sum, p) => sum + p.totalOrders, 0),
      totalHighRated: productsForCalculation.reduce((sum, p) => sum + (p.highRated || 0), 0),
      totalLowRated: productsForCalculation.reduce((sum, p) => sum + (p.lowRated || 0), 0),
      totalRevenue: productsForCalculation.reduce((sum, p) => sum + (p.totalRevenue || 0), 0),
      avgRating: 0,
      avgLowRatedPercentage: 0,
      dateFilter: daysFilter ? `Last ${daysFilter} days` : 'All dates',
      ratingsRequired: ratingsRequired
    };

    // Calculate averages
    if (productsForCalculation.length > 0) {
      const validRatings = productsForCalculation.filter(p => p.avgRating && p.avgRating > 0);
      summary.avgRating = validRatings.length > 0
        ? validRatings.reduce((sum, p) => sum + p.avgRating, 0) / validRatings.length
        : 0;

      summary.avgLowRatedPercentage = summary.totalOrders > 0
        ? (summary.totalLowRated / summary.totalOrders * 100)
        : 0;
    }

    console.log('\n' + '═'.repeat(60));
    console.log('PROCESSING COMPLETE');
    console.log('═'.repeat(60));
    console.log(`Total Products in Sheet: ${summary.totalProductsInSheet}`);
    console.log(`Matched Products (100%): ${summary.matchedProducts}`);
    console.log(`Unmatched Products: ${summary.unmatchedProducts}`);
    console.log(`Products Returned: ${productsToReturn.length} (${ratingsRequired ? 'matched only' : 'all products'})`);
    console.log(`Total Orders: ${summary.totalOrders}`);
    console.log(`Total Revenue: ₹${summary.totalRevenue.toFixed(2)}`);
    console.log(`High Rated: ${summary.totalHighRated} (${summary.totalOrders > 0 ? ((summary.totalHighRated / summary.totalOrders) * 100).toFixed(2) : 0}%)`);
    console.log(`Low Rated: ${summary.totalLowRated} (${summary.avgLowRatedPercentage.toFixed(2)}%)`);
    console.log(`Average Rating: ${summary.avgRating.toFixed(2)}`);
    console.log('═'.repeat(60) + '\n');

    return {
      products: productsToReturn,
      unmatchedProducts: unmatchedProducts,
      summary: summary
    };

  } catch (error) {
    console.error('Error in processProductAnalysisData:', error.message);
    console.error('Stack trace:', error.stack);
    return createEmptyProductDataStructure();
  }
}

/**
 * Create empty structure for error cases
 */
function createEmptyProductDataStructure() {
  return {
    products: [],
    unmatchedProducts: [],
    summary: {
      totalProductsInSheet: 0,
      matchedProducts: 0,
      unmatchedProducts: 0,
      totalOrders: 0,
      totalHighRated: 0,
      totalLowRated: 0,
      avgRating: 0,
      avgLowRatedPercentage: 0,
      dateFilter: 'None'
    }
  };
}

/**
 * Generate AI insights for product analysis (keeping existing function structure)
 */
async function generateEnhancedProductInsightsWithGemini(data, analysisType = 'comprehensive') {
  if (!GEMINI_API_KEY) {
    return generateProductFallbackInsights(data);
  }

  try {
    console.log(`Generating product AI insights for ${data.products.length} products`);
    
    const topProducts = data.products.slice(0, 10);
    const problematicProducts = data.products
      .filter(p => p.lowRatedPercentage > 5)
      .sort((a, b) => b.lowRatedPercentage - a.lowRatedPercentage)
      .slice(0, 5);
    const highRatedProducts = data.products.filter(p => p.avgRating >= 4.0).length;
    const lowRatedProducts = data.products.filter(p => p.avgRating < 3.0 && p.avgRating > 0).length;

    const prompt = `You are a restaurant product analyst. Analyze this product performance data and provide actionable insights.

PRODUCT PERFORMANCE SUMMARY:
- Total Matched Products: ${data.products.length}
- Total Orders: ${data.summary.totalOrders}
- High Rated Orders: ${data.summary.totalHighRated}
- Low Rated Orders: ${data.summary.totalLowRated}
- Average Low Rated %: ${data.summary.avgLowRatedPercentage.toFixed(2)}%
- Date Range: ${data.summary.dateFilter}

TOP 5 PERFORMERS (by orders):
${topProducts.slice(0, 5).map(p => `- ${p.name}: ${p.totalOrders} orders, ${p.avgRating.toFixed(1)}★, ${p.lowRatedPercentage.toFixed(1)}% low rated`).join('\n')}

TOP 5 QUALITY ISSUES (by low-rated percentage):
${problematicProducts.map(p => `- ${p.name}: ${p.lowRatedPercentage.toFixed(1)}% low rated (${p.lowRated} complaints from ${p.totalOrders} orders)`).join('\n')}

RATING DISTRIBUTION:
- High Rated Products (4★+): ${highRatedProducts}
- Low Rated Products (<3★): ${lowRatedProducts}

Provide a JSON response with:
{
  "keyFindings": ["3-5 critical insights about product performance"],
  "qualityIssues": ["3-5 products with quality concerns and why"],
  "recommendations": ["3-5 specific, actionable recommendations"],
  "opportunities": ["2-3 growth opportunities based on popular products"]
}

Focus on identifying quality issues, popular items, and actionable improvements.`;

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: 0.4,
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
      
      try {
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const insights = JSON.parse(jsonMatch[0]);
          return {
            ...insights,
            topProducts: topProducts.slice(0, 5).map(p => ({
              name: p.name,
              orders: p.totalOrders,
              rating: p.avgRating.toFixed(1),
              lowRatedPercent: p.lowRatedPercentage.toFixed(1)
            })),
            problematicProducts: problematicProducts.map(p => ({
              name: p.name,
              orders: p.totalOrders,
              lowRatedPercent: p.lowRatedPercentage.toFixed(1),
              lowRatedCount: p.lowRated
            })),
            confidence: 0.85,
            generatedAt: new Date().toISOString()
          };
        }
      } catch (parseError) {
        console.log('JSON parsing failed, using fallback');
      }
    }

    throw new Error('No valid response from AI');

  } catch (error) {
    console.error('AI insight generation error:', error.message);
    return generateProductFallbackInsights(data);
  }
}

/**
 * Fallback insights generation
 */
function generateProductFallbackInsights(data) {
  const topProducts = data.products.slice(0, 10);
  const problematicProducts = data.products
    .filter(p => p.lowRatedPercentage > 5)
    .sort((a, b) => b.lowRatedPercentage - a.lowRatedPercentage)
    .slice(0, 5);
  const highRatedProducts = data.products.filter(p => p.avgRating >= 4.0).length;
  
  return {
    keyFindings: [
      `${data.products.length} products matched with ${data.summary.totalOrders} total orders`,
      `${highRatedProducts} products have ratings above 4 stars`,
      `${problematicProducts.length} products have low-rated percentage above 5%`,
      `Average low-rated percentage: ${data.summary.avgLowRatedPercentage.toFixed(2)}%`
    ],
    qualityIssues: problematicProducts.length > 0 
      ? problematicProducts.map(p => 
          `${p.name}: ${p.lowRatedPercentage.toFixed(1)}% low rated (${p.lowRated} complaints)`
        )
      : ['No major quality issues detected'],
    recommendations: [
      'Focus on products with low-rated percentage above 5%',
      'Investigate quality consistency for high-volume items',
      'Monitor customer feedback on problematic products',
      'Consider menu optimization based on popularity and ratings'
    ],
    opportunities: [
      'Expand variants of top-performing products',
      'Improve quality consistency across all outlets'
    ],
    topProducts: topProducts.slice(0, 5).map(p => ({
      name: p.name,
      orders: p.totalOrders,
      rating: p.avgRating.toFixed(1),
      lowRatedPercent: p.lowRatedPercentage.toFixed(1)
    })),
    problematicProducts: problematicProducts.map(p => ({
      name: p.name,
      orders: p.totalOrders,
      lowRatedPercent: p.lowRatedPercentage.toFixed(1),
      lowRatedCount: p.lowRated
    })),
    confidence: 0.65,
    generatedAt: new Date().toISOString(),
    source: 'fallback-analysis'
  };
}

module.exports = {
  processProductAnalysisData,
  generateEnhancedProductInsightsWithGemini,
  DATE_FILTER_DAYS
};

// === EMPLOYEE DASHBOARD SPECIFIC FUNCTIONS ===

// === INTELLIGENT EMPLOYEE DATA MAPPING WITH GEMINI ===


// Employee data processing function with intelligent mapping, filtering, and sorting
// FIXED: Employee data processing function with correct column mapping
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
  console.log('Employee headers found:', headers);

  // FIXED COLUMN MAPPING based on actual CSV structure
  const columnMapping = {
    employee_name: 0,                    // Employee Name
    high_rated_7_days: 6,                // High Rated Orders (7 days)
    high_rated_28_days: 7,               // High Rated Orders (28 days)
    low_rated_7_days: 8,                 // Low Rated Orders (7 days)
    low_rated_28_days: 9,                // Low Rated Orders (28 days)
    total_orders_7_days: 10,             // Total Orders (7 Days)
    total_orders_28_days: 11,            // Total Orders (28 Days)
    high_rated_percent_7_days: 12,       // High Rated Orders% (7 days)
    high_rated_percent_28_days: 13,      // High Rated Orders% (28 days)
    low_rated_percent_7_days: 14,        // Low Rated Orders% (7 days)
    low_rated_percent_28_days: 15,       // Low Rated Orders% (28 days)
    igcc_7_days: 16,                     // IGCC (7 Days)
    igcc_28_days: 17,                    // IGCC (28 Days)
    type: 18,                            // Type
    error_rate_7_days: 19,               // Error Rate% (7 Days)
    error_rate_28_days: 20,              // Error Rate% (28 Days)
    igcc_percent_7_days: 21,             // IGCC% (7 Days)
    igcc_percent_28_days: 22             // IGCC% (28 Days)
  };

  console.log('Using fixed column mapping:', columnMapping);

  const processedData = [];
  
  // Process each data row after headers
  for (let i = headerRowIndex + 1; i < rawData.length; i++) {
    const row = rawData[i];
    
    if (!row || !row[columnMapping.employee_name] || row[columnMapping.employee_name].toString().trim() === '') {
      continue; // Skip empty rows
    }
    
    const employeeName = getCellValue(row, columnMapping.employee_name, '').trim();
    
    // Skip if employee name is empty or is "overall" or "total"
    if (!employeeName || employeeName.toLowerCase() === 'overall' || employeeName.toLowerCase() === 'total') {
      console.log(`Skipping row ${i + 1}: ${employeeName || 'empty'}`);
      continue;
    }
    
    // Get the type value
    const employeeType = getCellValue(row, columnMapping.type, '').trim().toLowerCase();
    
    console.log(`Processing employee: ${employeeName} (${employeeType}) at row ${i + 1}`);
    
    // Map data using the fixed column mapping
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
      igcc_28_days: parseEmployeeValue(row[columnMapping.igcc_28_days]),
      error_rate_7_days: parseEmployeeValue(row[columnMapping.error_rate_7_days]),
      error_rate_28_days: parseEmployeeValue(row[columnMapping.error_rate_28_days]),
      igcc_percent_7_days: parseEmployeeValue(row[columnMapping.igcc_percent_7_days]),
      igcc_percent_28_days: parseEmployeeValue(row[columnMapping.igcc_percent_28_days])
    };
    
    // Calculate additional metrics based on requested period
    const totalOrders = requestedPeriod === '7 Days' ? employeeData.total_orders_7_days : employeeData.total_orders_28_days;
    const highRated = requestedPeriod === '7 Days' ? employeeData.high_rated_7_days : employeeData.high_rated_28_days;
    const lowRated = requestedPeriod === '7 Days' ? employeeData.low_rated_7_days : employeeData.low_rated_28_days;
    const highRatedPercent = requestedPeriod === '7 Days' ? employeeData.high_rated_percent_7_days : employeeData.high_rated_percent_28_days;
    const lowRatedPercent = requestedPeriod === '7 Days' ? employeeData.low_rated_percent_7_days : employeeData.low_rated_percent_28_days;
    const igcc = requestedPeriod === '7 Days' ? employeeData.igcc_7_days : employeeData.igcc_28_days;
    const igccPercent = requestedPeriod === '7 Days' ? employeeData.igcc_percent_7_days : employeeData.igcc_percent_28_days;
    const errorRate = requestedPeriod === '7 Days' ? employeeData.error_rate_7_days : employeeData.error_rate_28_days;

    // Add current period data for easier access
    employeeData.current_period = {
      total_orders: totalOrders,
      high_rated: highRated,
      low_rated: lowRated,
      high_rated_percent: highRatedPercent,
      low_rated_percent: lowRatedPercent,
      igcc: igcc,
      igcc_percent: igccPercent,
      error_rate: errorRate,
      performance_score: totalOrders > 0 ? (highRatedPercent - lowRatedPercent) : 0
    };
    
    // Debug log for first few employees
    if (processedData.length < 2) {
      console.log(`\nEMPLOYEE DATA DEBUG for "${employeeName}":`);
      console.log(`  Type: ${employeeType}`);
      console.log(`  High Rated (7d): ${employeeData.high_rated_7_days}`);
      console.log(`  High Rated % (7d): ${employeeData.high_rated_percent_7_days}%`);
      console.log(`  Total Orders (7d): ${employeeData.total_orders_7_days}`);
      console.log(`  Error Rate (7d): ${employeeData.error_rate_7_days}%`);
      console.log(`  IGCC (7d): ${employeeData.igcc_7_days}\n`);
    }
    
    processedData.push(employeeData);
  }
  
  // Sort by high_rated_percent in descending order
  const sortField = requestedPeriod === '7 Days' ? 'high_rated_percent_7_days' : 'high_rated_percent_28_days';
  processedData.sort((a, b) => b[sortField] - a[sortField]);
  
  console.log(`Processed ${processedData.length} employees for ${requestedPeriod}, sorted by ${sortField} (descending)`);
  
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

// === SWIGGY DASHBOARD API ENDPOINTS ===

// Swiggy dashboard data endpoint
app.get('/api/swiggy-dashboard-data', async (req, res) => {
  try {
    const period = req.query.period || '7 Day';
    console.log(`Swiggy dashboard data requested for period: ${period}`);
    
    // Only allow 1 Day and 7 Day for Swiggy dashboard
    if (!['28 Day', '7 Day', '1 Day'].includes(period)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid period for Swiggy dashboard. Must be one of: 7 Day, 1 Day',
      });
    }

    if (!sheets) {
      const initialized = await initializeGoogleServices();
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
    
    console.log(`Successfully processed Swiggy data for ${period}:`, {
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
    console.error('Error fetching Swiggy dashboard data:', error.message);
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
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`,
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
      await initializeGoogleServices();
    }

    const SWIGGY_SPREADSHEET_ID = '1XmKondedSs_c6PZflanfB8OFUsGxVoqi5pUPvscT8cs';
    const SWIGGY_SHEET_NAME = 'Swiggy Dashboard - AOD';

    console.log(`Debug: Fetching raw Swiggy data from ${SWIGGY_SPREADSHEET_ID}`);

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
    console.error('Error fetching debug Swiggy data:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      spreadsheetId: '1XmKondedSs_c6PZflanfB8OFUsGxVoqi5pUPvscT8cs',
      sheetName: 'Swiggy Dashboard - AOD',
    });
  }
});

// === EMPLOYEE DASHBOARD API ENDPOINTS ===

// Employee Dashboard data endpoint with intelligent mapping
app.get('/api/employee-data', async (req, res) => {
  try {
    const period = req.query.period || '7 Days';
    console.log(`Employee data requested for period: ${period}`);

    if (!['7 Days', '28 Days'].includes(period)) {
      res.set('Content-Type', 'application/json');
      return res.status(400).json({
        success: false,
        error: 'Invalid period. Must be one of: 7 Days, 28 Days',
      });
    }

    if (!sheets) {
      const initialized = await initializeGoogleServices();
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

    const processedData = await processEmployeeSheetData(sheetResponse.data.values, period);

    console.log(`Successfully processed Employee data for ${period}:`, {
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
        mappingType: 'fixed',
        columnsIncluded: [
          'High Rated Orders', 'Low Rated Orders', 'Total Orders',
          'High Rated %', 'Low Rated %', 'IGCC', 'IGCC %', 'Error Rate %', 'Type'
        ],
        columnsExcluded: ['OTP', 'Minutes Late']
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching Employee data:', error.message);
    res.set('Content-Type', 'application/json');
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.data || 'No additional details',
    });
  }
});

// Debug Employee endpoint
app.get('/api/debug-employee', async (req, res) => {
  try {
    if (!sheets) {
      await initializeGoogleServices();
    }

    const EMPLOYEE_SPREADSHEET_ID = '1FYXr8Wz0ddN3mFi-0AQbI6J_noi2glPbJLh44CEMUnE';
    const EMPLOYEE_SHEET_NAME = 'EmployeeDashboard';

    console.log(`Debug: Fetching raw Employee data from ${EMPLOYEE_SPREADSHEET_ID}`);

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
    console.error('Error fetching debug Employee data:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      spreadsheetId: '1FYXr8Wz0ddN3mFi-0AQbI6J_noi2glPbJLh44CEMUnE',
      sheetName: 'EmployeeDashboard',
    });
  }
});

// === PRODUCT ANALYSIS API ENDPOINTS ===

// Product analysis data endpoint
// Ensure RISTA_BRANCH_CODES is defined above or in scope
// Example (you said you already added it):
// const RISTA_BRANCH_CODES = ['branch-abc', 'branch-xyz'];
SPREADSHEET_ID = '1XmKondedSs_c6PZflanfB8OFUsGxVoqi5pUPvscT8cs';
// GET: Full Product Analysis Data
app.get('/api/product-analysis-data', async (req, res) => {
  try {
    console.log('=== API CALL STARTED ===');
    
    const data = await processProductAnalysisData(SPREADSHEET_ID);
    
    console.log('=== PROCESSING COMPLETE ===');
    console.log('Data structure:', {
      hasProducts: !!data.products,
      productsLength: data.products?.length,
      hasSummary: !!data.summary,
      summaryKeys: data.summary ? Object.keys(data.summary) : []
    });
    
    // Check summary values
    if (data.summary) {
      console.log('Summary avgLowRatedPercentage:', data.summary.avgLowRatedPercentage);
      console.log('Type:', typeof data.summary.avgLowRatedPercentage);
    }
    
    // Check first product
    if (data.products && data.products[0]) {
      console.log('First product lowRatedPercentage:', data.products[0].lowRatedPercentage);
      console.log('Type:', typeof data.products[0].lowRatedPercentage);
    }
    
    res.json({ 
      success: true, 
      data: data 
    });
    
  } catch (error) {
    console.error('=== ERROR CAUGHT ===');
    console.error('Message:', error.message);
    console.error('Stack:', error.stack);
    
    res.status(500).json({ 
      success: false, 
      error: error.message,
      stack: error.stack 
    });
  }
});

// GET: Product Matching from Sheets (NO RISTA API - 100% matches only)
app.get('/api/product-matching-sheets', async (req, res) => {
  try {
    console.log('=== Product Matching API Call Started (Sheet-based) ===');

    const result = await processProductAnalysisData(DASHBOARD_SPREADSHEET_ID);

    console.log('=== Product Matching Complete ===');
    console.log(`Found ${result.products.length} matched products`);

    // Transform the result to match expected format
    const response = {
      success: true,
      data: result.products,
      metadata: {
        totalProducts: result.summary.totalProductsInSheet,
        matchedProducts: result.summary.matchedProducts,
        unmatchedProducts: result.summary.unmatchedProducts,
        totalOrders: result.summary.totalOrders
      }
    };

    res.json(response);

  } catch (error) {
    console.error('=== Product Matching Error ===');
    console.error('Message:', error.message);
    console.error('Stack:', error.stack);

    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

// POST: Generate AI Insights
// POST: Generate AI Insights
app.post('/api/product-generate-insights', async (req, res) => {
  try {
    const { data, analysisType } = req.body;
    
    if (!data || !data.products) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request: Missing product data'
      });
    }

    console.log(`Generating AI insights for ${data.products.length} products (${analysisType || 'default'})`);
    
    // NOW THIS FUNCTION EXISTS!
    const insights = await generateEnhancedProductInsightsWithGemini(data, analysisType);
    
    res.json({
      success: true,
      insights,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error generating AI insights:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// DEBUG: Raw Sheet Data (Only used sheets)
app.get('/api/debug-product-analysis', async (req, res) => {
  try {
    if (!sheets) {
      await initializeGoogleServices();
    }

    const PRODUCT_SPREADSHEET_ID = '1XmKondedSs_c6PZflanfB8OFUsGxVoqi5pUPvscT8cs';
    console.log(`Debug: Fetching raw data from ${PRODUCT_SPREADSHEET_ID}`);

    const [productDetails, zomatoOrders, swiggyReview, igccComplaints] = await Promise.all([
      sheets.spreadsheets.values.get({
        spreadsheetId: PRODUCT_SPREADSHEET_ID,
        range: `ProductDetails!A1:Z20`,
      }).catch(e => ({ data: { values: null }, error: e.message })),

      sheets.spreadsheets.values.get({
        spreadsheetId: PRODUCT_SPREADSHEET_ID,
        range: `zomato_orders!A1:Z20`,
      }).catch(e => ({ data: { values: null }, error: e.message })),

      sheets.spreadsheets.values.get({
        spreadsheetId: PRODUCT_SPREADSHEET_ID,
        range: `Copy of swiggy_review!A1:Z20`,
      }).catch(e => ({ data: { values: null }, error: e.message })),

      sheets.spreadsheets.values.get({
        spreadsheetId: PRODUCT_SPREADSHEET_ID,
        range: `IGCC!A1:Z20`,
      }).catch(e => ({ data: { values: null }, error: e.message }))
    ]);

    res.json({
      success: true,
      spreadsheetId: PRODUCT_SPREADSHEET_ID,
      sheets: {
        product_details: {
          headers: productDetails.data.values?.[0] || null,
          sample: productDetails.data.values?.slice(1, 6) || null,
          error: productDetails.error || null
        },
        zomato_orders: {
          headers: zomatoOrders.data.values?.[0] || null,
          sample: zomatoOrders.data.values?.slice(1, 6) || null,
          error: zomatoOrders.error || null
        },
        swiggy_review: {
          headers: swiggyReview.data.values?.[0] || null,
          sample: swiggyReview.data.values?.slice(1, 6) || null,
          error: swiggyReview.error || null
        },
        igcc_complaints: {
          headers: igccComplaints.data.values?.[0] || null,
          sample: igccComplaints.data.values?.slice(1, 6) || null,
          error: igccComplaints.error || null
        }
      },
      note: "ProductDetails is used for order counts and revenue. IGCC is used for complaints. Zomato/Swiggy are used for ratings.",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Debug endpoint error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      spreadsheetId: '1XmKondedSs_c6PZflanfB8OFUsGxVoqi5pUPvscT8cs',
      timestamp: new Date().toISOString(),
    });
  }
});

// === PRODUCT ANALYTICS CHATBOT ENDPOINT ===

// POST: Product Analytics Chatbot - Conversational AI for product insights
app.post('/api/product-chat', async (req, res) => {
  try {
    const { message, conversationHistory = [], dateFilter } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Invalid request: message is required'
      });
    }

    console.log(`Product Chatbot Query: "${message}"`);

    // Parse date query from message
    const dateQuery = parseDateQuery(message);
    console.log(`Parsed date query:`, JSON.stringify(dateQuery, null, 2));

    // Parse branch and channel filters from message
    const filters = parseFilters(message);

    // Check if user wants channel-wise breakdown
    const wantsChannelBreakdown = /channel[-\s]?wise|by channel|breakdown by channel|each channel|per channel|split by channel/i.test(message);

    // Detect if query requires ratings data
    const isRatingsQuery = /rating|rated|review|quality|feedback|complaint|star|satisfaction|best.*quality|worst.*quality/i.test(message);
    const ratingsRequired = isRatingsQuery;
    console.log(`Ratings Required: ${ratingsRequired}`);

    // Handle comparison queries
    if (dateQuery && dateQuery.type === 'comparison') {
      // If user wants channel-wise breakdown, fetch data for each channel separately
      if (wantsChannelBreakdown) {
        const channels = ['Swiggy', 'Zomato', 'Dine-in', 'Ownly', 'Magicpin'];
        const channelData = {};

        // Fetch data for each channel
        for (const channel of channels) {
          const channelFilters = { ...filters, channel };
          const [data1, data2] = await Promise.all([
            processProductAnalysisData(DASHBOARD_SPREADSHEET_ID, dateQuery.period1, channelFilters, ratingsRequired),
            processProductAnalysisData(DASHBOARD_SPREADSHEET_ID, dateQuery.period2, channelFilters, ratingsRequired)
          ]);
          channelData[channel] = { period1: data1, period2: data2 };
        }

        // Generate AI response with channel-wise comparison
        const chatResponse = await generateChannelWiseComparisonResponse(
          message,
          channelData,
          dateQuery,
          conversationHistory,
          filters
        );

        res.json({
          success: true,
          response: chatResponse.message,
          data: chatResponse.structuredData || null,
          dateRangeInfo: `Comparing: ${dateQuery.period1.label} vs ${dateQuery.period2.label} (Channel-wise)`,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Regular comparison (not channel-wise)
      const [productData1, productData2] = await Promise.all([
        processProductAnalysisData(DASHBOARD_SPREADSHEET_ID, dateQuery.period1, filters, ratingsRequired),
        processProductAnalysisData(DASHBOARD_SPREADSHEET_ID, dateQuery.period2, filters, ratingsRequired)
      ]);

      // Generate AI response with comparison
      const chatResponse = await generateComparisonChatbotResponse(
        message,
        productData1,
        productData2,
        dateQuery,
        conversationHistory,
        filters
      );

      res.json({
        success: true,
        response: chatResponse.message,
        data: chatResponse.structuredData || null,
        comparisonData: {
          period1: {
            label: dateQuery.period1.label,
            summary: productData1.summary
          },
          period2: {
            label: dateQuery.period2.label,
            summary: productData2.summary
          }
        },
        dateRangeInfo: `Comparing: ${dateQuery.period1.label} vs ${dateQuery.period2.label}`,
        timestamp: new Date().toISOString(),
      });
    } else {
      // Single period query
      const filterOrRange = dateQuery && dateQuery.type === 'specific'
        ? { startDate: dateQuery.startDate, endDate: dateQuery.endDate }
        : dateQuery?.days || dateFilter || null;

      const productData = await processProductAnalysisData(DASHBOARD_SPREADSHEET_ID, filterOrRange, filters, ratingsRequired);

      const dateRangeInfo = dateQuery
        ? dateQuery.label
        : (dateFilter ? `Last ${dateFilter} days` : 'All dates');

      const chatResponse = await generateChatbotResponse(
        message,
        productData,
        conversationHistory,
        dateRangeInfo,
        filters
      );

      res.json({
        success: true,
        response: chatResponse.message,
        data: chatResponse.structuredData || null,
        dateRangeInfo: dateRangeInfo,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error('Error in product chatbot:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Direct stock-out events endpoint (no AI, just data)
app.get('/api/stock-events', async (req, res) => {
  try {
    const daysBack = parseInt(req.query.daysBack) || 7;
    const outlet = req.query.outlet || null;

    console.log(`📦 Stock Events Query: last ${daysBack} days${outlet ? ` at ${outlet}` : ''}`);

    // Get stock events directly
    const stockData = await getAllStockEvents(daysBack, outlet);

    // Format the response
    const formattedEvents = stockData.stockEvents.map(event => ({
      itemName: event.productName,
      sku: event.sku,
      dateTime: event.time,
      outlet: event.outlet
    }));

    // Group events by product name
    const groupedByProduct = {};
    stockData.stockEvents.forEach(event => {
      const name = event.productName;
      if (!groupedByProduct[name]) {
        groupedByProduct[name] = {
          itemName: name,
          totalEvents: 0,
          events: []
        };
      }
      groupedByProduct[name].totalEvents++;
      groupedByProduct[name].events.push({
        sku: event.sku,
        dateTime: event.time,
        outlet: event.outlet
      });
    });

    const productList = Object.values(groupedByProduct).sort((a, b) => b.totalEvents - a.totalEvents);

    res.json({
      success: true,
      summary: {
        totalEvents: stockData.stockEvents.length,
        uniqueProducts: productList.length,
        daysAnalyzed: daysBack,
        outlet: outlet || 'All outlets'
      },
      products: productList,
      allEvents: formattedEvents,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching stock events:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// === GEMINI API KEY ROTATION HELPERS ===

// Get current active Gemini API key
function getCurrentGeminiKey() {
  if (GEMINI_API_KEYS.length === 0) {
    throw new Error('No Gemini API keys available');
  }
  return GEMINI_API_KEYS[currentKeyIndex];
}

// Rotate to next available API key
function rotateGeminiKey() {
  if (GEMINI_API_KEYS.length <= 1) {
    console.warn('⚠️  Only one API key available, cannot rotate');
    return false;
  }

  const oldIndex = currentKeyIndex;
  currentKeyIndex = (currentKeyIndex + 1) % GEMINI_API_KEYS.length;

  console.log(`🔄 Rotated Gemini API key: Key ${oldIndex + 1} → Key ${currentKeyIndex + 1}`);
  return true;
}

// Check if error is a rate limit error
function isRateLimitError(error) {
  if (!error) return false;

  // Check HTTP status code
  if (error.response && error.response.status === 429) {
    return true;
  }

  // Check error message for rate limit indicators
  const errorMessage = error.message || '';
  const errorData = JSON.stringify(error.response?.data || '');

  const rateLimitIndicators = [
    'rate limit',
    'quota exceeded',
    'too many requests',
    'resource_exhausted',
    '429'
  ];

  return rateLimitIndicators.some(indicator =>
    errorMessage.toLowerCase().includes(indicator) ||
    errorData.toLowerCase().includes(indicator)
  );
}

// === GROQ API KEY ROTATION HELPERS ===

// Get current active Groq client
function getCurrentGroqClient() {
  if (groqClients.length === 0) {
    throw new Error('No Groq API keys available');
  }
  return groqClients[currentGroqKeyIndex];
}

// Rotate to next available Groq API key
function rotateGroqKey() {
  if (groqClients.length <= 1) {
    console.warn('⚠️  Only one Groq API key available, cannot rotate');
    return false;
  }

  const oldIndex = currentGroqKeyIndex;
  currentGroqKeyIndex = (currentGroqKeyIndex + 1) % groqClients.length;

  console.log(`🔄 Rotated Groq API key: Key ${oldIndex + 1} → Key ${currentGroqKeyIndex + 1}`);
  return true;
}

// Check if error is a Groq rate limit error
function isGroqRateLimitError(error) {
  if (!error) return false;

  // Groq uses similar rate limit patterns
  const errorMessage = error.message || '';
  const errorString = JSON.stringify(error);

  const groqRateLimitIndicators = [
    'rate_limit_exceeded',
    'rate limit',
    'quota exceeded',
    'too many requests',
    '429'
  ];

  return groqRateLimitIndicators.some(indicator =>
    errorMessage.toLowerCase().includes(indicator) ||
    errorString.toLowerCase().includes(indicator)
  );
}

// Universal AI call with automatic failover: Gemini → Groq
async function callAIWithFailover(prompt, config = {}) {
  const maxOutputTokens = config.maxOutputTokens || 2048;
  const temperature = config.temperature || 0.7;

  // Try Gemini first (with key rotation)
  if (GEMINI_API_KEYS.length > 0) {
    let attempts = 0;
    const maxRetries = GEMINI_API_KEYS.length;

    while (attempts < maxRetries) {
      try {
        const currentKey = getCurrentGeminiKey();
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${currentKey}`;

        console.log(`🔑 Trying Gemini (key ${currentKeyIndex + 1}/${GEMINI_API_KEYS.length}, attempt ${attempts + 1})`);

        const response = await axios.post(url, {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature,
            topK: 40,
            topP: 0.95,
            maxOutputTokens
          }
        }, { timeout: 30000 });

        console.log(`✅ Gemini succeeded`);
        return response.data.candidates[0].content.parts[0].text;

      } catch (error) {
        attempts++;

        // Check if this is a rate limit error
        if (isRateLimitError(error)) {
          console.log(`⚠️  Gemini rate limit hit (key ${currentKeyIndex + 1}). ${error.message}`);

          // Try to rotate to next key
          if (attempts < maxRetries) {
            const rotated = rotateGeminiKey();
            if (rotated) {
              console.log(`🔄 Rotating to next Gemini key...`);
              continue; // Retry with new key
            }
          }
          console.log(`⚠️  All Gemini keys exhausted. Trying Groq...`);
          break; // Fall through to Groq
        } else {
          // Not a rate limit error
          console.error(`❌ Gemini error (non-rate-limit): ${error.message}`);
          break; // Fall through to Groq
        }
      }
    }
  }

  // Try Groq as fallback (with key rotation)
  if (groqClients.length > 0) {
    let groqAttempts = 0;
    const maxGroqRetries = groqClients.length;

    while (groqAttempts < maxGroqRetries) {
      try {
        const currentGroqClient = getCurrentGroqClient();
        console.log(`🚀 Trying Groq (key ${currentGroqKeyIndex + 1}/${groqClients.length}, attempt ${groqAttempts + 1})...`);

        const completion = await currentGroqClient.chat.completions.create({
          messages: [{ role: 'user', content: prompt }],
          model: 'llama-3.3-70b-versatile', // Best free model
          temperature,
          max_tokens: maxOutputTokens
        });

        console.log(`✅ Groq succeeded (FREE!)`);
        return completion.choices[0].message.content;

      } catch (error) {
        groqAttempts++;

        // Check if this is a Groq rate limit error
        if (isGroqRateLimitError(error)) {
          console.log(`⚠️  Groq rate limit hit (key ${currentGroqKeyIndex + 1}). ${error.message}`);

          // Try to rotate to next key
          if (groqAttempts < maxGroqRetries) {
            const rotated = rotateGroqKey();
            if (rotated) {
              console.log(`🔄 Rotating to next Groq key...`);
              continue; // Retry with new key
            }
          }
          console.log(`⚠️  All Groq keys exhausted.`);
          throw new Error(`Both Gemini and Groq rate limited. All ${GEMINI_API_KEYS.length} Gemini + ${groqClients.length} Groq keys exhausted.`);
        } else {
          // Not a rate limit error
          console.error(`❌ Groq error (non-rate-limit): ${error.message}`);
          throw new Error(`Both Gemini and Groq failed. Gemini: rate limited, Groq: ${error.message}`);
        }
      }
    }
  }

  // No AI service available
  throw new Error('All Gemini keys rate limited and Groq not configured. Add GROQ_API_KEY to .env');
}

// === STOCK DATA INTEGRATION FOR CHATBOT ===

/**
 * Get stock tracker data for specific products/items
 * Checks out-of-stock history from tracker sheet
 */
async function getStockDataForProducts(productNames, daysBack = 7, outlet = null) {
  try {
    if (!sheets) {
      await initializeGoogleServices();
    }

    const STOCK_SPREADSHEET_ID = '12kfAZX7gV0UszUHhTI9i9iy8OObJ0Uc_8fJC18O1ILg';
    const TRACKER_TAB = 'Tracker';

    console.log(`Fetching stock tracker data for ${productNames.length} products (last ${daysBack} days)`);

    // Fetch tracker data
    const trackerResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: STOCK_SPREADSHEET_ID,
      range: `${TRACKER_TAB}!B:E`, // B=Time, C=Outlet, D=SKU Code, E=Item Name
    });

    const allTrackerData = trackerResponse.data.values || [];

    if (allTrackerData.length <= 1) {
      return { stockEvents: [], summary: 'No stock tracking data available' };
    }

    // Only process the most recent 10,000 rows (recent data is at bottom)
    const RECENT_ROWS_COUNT = 10000;
    const startIndex = Math.max(1, allTrackerData.length - RECENT_ROWS_COUNT);
    const trackerData = allTrackerData.slice(startIndex);

    console.log(`📊 Processing ${trackerData.length} recent rows (from row ${startIndex + 1} to ${allTrackerData.length}) out of ${allTrackerData.length} total rows`);

    // Calculate date threshold
    const now = new Date();
    const threshold = new Date(now.getTime() - (daysBack * 24 * 60 * 60 * 1000));

    // Track stock events for each product
    const stockEvents = [];
    const productStockMap = new Map(); // Map: productName -> { outletEvents: [], totalEvents: 0 }

    // Normalize product names for matching
    const normalizedProductNames = productNames.map(name => normalizeProductName(name));

    for (let i = 1; i < trackerData.length; i++) {
      const row = trackerData[i];
      if (row && row[0] && row[1] && row[3]) { // Time, Outlet, Item Name (SKU is optional)
        const entryTime = row[0].toString().trim();
        const entryOutlet = row[1].toString().trim();
        const entrySKU = row[2] ? row[2].toString().trim() : 'N/A';
        const entryItemName = row[3].toString().trim();

        // Check if within date range using proper date parser
        const entryDate = parseTrackerDate(entryTime);
        if (!entryDate || entryDate < threshold) {
          continue;
        }

        // Apply outlet filter if specified
        if (outlet && entryOutlet.toLowerCase() !== outlet.toLowerCase()) {
          continue;
        }

        // Match this item against our product names
        const normalizedItem = normalizeProductName(entryItemName);

        // Check if this item matches any of our products (fuzzy matching)
        for (let j = 0; j < productNames.length; j++) {
          const productName = productNames[j];
          const normalizedProduct = normalizedProductNames[j];

          // Use fuzzy matching (score > 80 is a good match)
          const score = calculateFuzzyScore(normalizedItem, normalizedProduct);

          if (score > 80) {
            stockEvents.push({
              productName: productName,
              matchedItem: entryItemName,
              outlet: entryOutlet,
              time: entryTime,
              sku: entrySKU,
              fuzzyScore: score
            });

            // Update product stock map
            if (!productStockMap.has(productName)) {
              productStockMap.set(productName, { outletEvents: [], totalEvents: 0, detailedEvents: [] });
            }

            const stockInfo = productStockMap.get(productName);
            stockInfo.totalEvents++;

            // Track detailed events with timestamps and SKU
            stockInfo.detailedEvents.push({
              outlet: entryOutlet,
              time: entryTime,
              item: entryItemName,
              sku: entrySKU
            });

            // Track unique outlets
            if (!stockInfo.outletEvents.find(e => e.outlet === entryOutlet)) {
              stockInfo.outletEvents.push({ outlet: entryOutlet, count: 1, lastSeen: entryTime });
            } else {
              const outletEvent = stockInfo.outletEvents.find(e => e.outlet === entryOutlet);
              outletEvent.count++;
              outletEvent.lastSeen = entryTime;
            }

            break; // Don't match the same item to multiple products
          }
        }
      }
    }

    // Generate summary
    let summary = '';
    if (stockEvents.length === 0) {
      summary = `No out-of-stock events found for these products in the last ${daysBack} days.`;
    } else {
      const affectedProducts = productStockMap.size;
      const totalEvents = stockEvents.length;
      summary = `Found ${totalEvents} out-of-stock event(s) affecting ${affectedProducts} product(s) in the last ${daysBack} days.`;
    }

    return {
      stockEvents: stockEvents,
      productStockMap: productStockMap,
      summary: summary,
      daysAnalyzed: daysBack
    };

  } catch (error) {
    console.error('Error fetching stock data for products:', error.message);
    return {
      stockEvents: [],
      summary: 'Error fetching stock data',
      error: error.message
    };
  }
}

/**
 * Parse date from DD/MM/YYYY HH:mm format used in tracker sheet
 */
function parseTrackerDate(dateString) {
  try {
    // Format: "15/12/2025 18:13" (DD/MM/YYYY HH:mm)
    const parts = dateString.split(' ');
    const datePart = parts[0]; // "15/12/2025"
    const timePart = parts[1] || '00:00'; // "18:13"

    const [day, month, year] = datePart.split('/');
    const [hours, minutes] = timePart.split(':');

    // JavaScript Date months are 0-indexed
    return new Date(year, month - 1, day, hours, minutes);
  } catch (e) {
    console.warn(`Failed to parse tracker date: ${dateString}`, e);
    return null;
  }
}

/**
 * Get ALL stock-out events from tracker (not filtered by sales data)
 * Returns complete list of stock events in the time period
 */
async function getAllStockEvents(daysBack = 7, outlet = null) {
  try {
    if (!sheets) {
      await initializeGoogleServices();
    }

    const STOCK_SPREADSHEET_ID = '12kfAZX7gV0UszUHhTI9i9iy8OObJ0Uc_8fJC18O1ILg';
    const TRACKER_TAB = 'Tracker';

    console.log(`Fetching ALL stock events from tracker (last ${daysBack} days)`);

    // Fetch tracker data
    const trackerResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: STOCK_SPREADSHEET_ID,
      range: `${TRACKER_TAB}!B:E`, // B=Time, C=Outlet, D=SKU Code, E=Item Name
    });

    const allTrackerData = trackerResponse.data.values || [];

    if (allTrackerData.length <= 1) {
      return { stockEvents: [], summary: 'No stock tracking data available' };
    }

    // Only process the most recent 10,000 rows (recent data is at bottom)
    const RECENT_ROWS_COUNT = 10000;
    const startIndex = Math.max(1, allTrackerData.length - RECENT_ROWS_COUNT);
    const trackerData = allTrackerData.slice(startIndex);

    console.log(`📊 Processing ${trackerData.length} recent rows (from row ${startIndex + 1} to ${allTrackerData.length}) out of ${allTrackerData.length} total rows`);

    // Calculate date threshold
    const now = new Date();
    const threshold = new Date(now.getTime() - (daysBack * 24 * 60 * 60 * 1000));

    console.log(`🔍 Date Filter Debug:`);
    console.log(`   Current date (now): ${now.toISOString()} (${now.toLocaleString()})`);
    console.log(`   Threshold (${daysBack} days back): ${threshold.toISOString()} (${threshold.toLocaleString()})`);
    console.log(`   Looking for dates >= ${threshold.toLocaleDateString()}`);

    // Collect ALL stock events
    const stockEvents = [];
    let debugCount = 0;
    let filteredByDateCount = 0;
    let emptyRowCount = 0;

    // Debug: Show first 5 raw rows
    console.log(`🔬 Raw row data sample (first 5 rows):`);
    for (let i = 0; i < Math.min(5, trackerData.length); i++) {
      const row = trackerData[i];
      console.log(`   Row ${startIndex + i + 1}: ${row ? `[${row.length} cols] ${JSON.stringify(row.slice(0, 4))}` : 'undefined/null'}`);
    }

    for (let i = 0; i < trackerData.length; i++) {
      const row = trackerData[i];

      // Skip header row (contains "Time", "Outlet", etc.)
      if (row && row[0] && row[0].toString().toLowerCase() === 'time') {
        continue;
      }

      if (row && row[0] && row[1] && row[3]) { // Time, Outlet, Item Name required
        const entryTime = row[0].toString().trim();
        const entryOutlet = row[1].toString().trim();
        const entrySKU = row[2] ? row[2].toString().trim() : 'N/A';
        const entryItemName = row[3].toString().trim();

        // Check if within date range using proper date parser
        const entryDate = parseTrackerDate(entryTime);

        // Debug first 5 rows
        if (debugCount < 5) {
          console.log(`   Row ${startIndex + i + 1}: "${entryTime}" → ${entryDate ? entryDate.toISOString() : 'PARSE_FAILED'} → ${entryDate && entryDate >= threshold ? '✅ PASS' : '❌ FILTERED'}`);
          debugCount++;
        }

        if (!entryDate || entryDate < threshold) {
          filteredByDateCount++;
          continue;
        }

        // Apply outlet filter if specified
        if (outlet && entryOutlet.toLowerCase() !== outlet.toLowerCase()) {
          continue;
        }

        // Add ALL events (no filtering by product sales data)
        stockEvents.push({
          productName: entryItemName,
          matchedItem: entryItemName,
          outlet: entryOutlet,
          time: entryTime,
          sku: entrySKU
        });
      } else {
        emptyRowCount++;
      }
    }

    console.log(`📊 Processing results:`);
    console.log(`   - Empty/invalid rows (missing required columns): ${emptyRowCount}`);
    console.log(`   - Rows filtered by date: ${filteredByDateCount}`);
    console.log(`   - Events that passed all filters: ${stockEvents.length}`);

    // Generate summary
    const summary = stockEvents.length === 0
      ? `No out-of-stock events found in the last ${daysBack} days.`
      : `Found ${stockEvents.length} out-of-stock event(s) in the last ${daysBack} days.`;

    return {
      stockEvents: stockEvents,
      summary: summary,
      daysAnalyzed: daysBack
    };

  } catch (error) {
    console.error('Error fetching all stock events:', error.message);
    return {
      stockEvents: [],
      summary: 'Error fetching stock data',
      error: error.message
    };
  }
}

/**
 * Delivery Schedule Configuration
 * Maps outlet codes to their delivery days
 */
const DELIVERY_SCHEDULE = {
  // Group 1: Monday, Thursday, Saturday
  'BLN': [1, 4, 6],        // Bangalore (assuming)
  'WF': [1, 4, 6],         // WF
  'KLN': [1, 4, 6],        // Koramangala (KLN)
  'SAHA': [1, 4, 6],       // Sahakarnagar

  // Group 2: Wednesday, Friday, Sunday
  'IND': [3, 5, 0],        // Indiranagar
  'KOR': [3, 5, 0],        // Koramangala (KOR)
  'HSR': [3, 5, 0],        // HSR Layout
  'ARK': [3, 5, 0],        // Arekere
  'JAY': [3, 5, 0],        // Jayanagar

  // Special: Night deliveries on Monday & Thursday
  'FERRO': [1, 4]          // FERRO (night deliveries)
};

// Outlet name mappings (full name to code)
const OUTLET_NAME_TO_CODE = {
  'koramangala': 'KLN',
  'sahakarnagar': 'SAHA',
  'sahakar nagar': 'SAHA',
  'indiranagar': 'IND',
  'hsr layout': 'HSR',
  'hsr': 'HSR',
  'arekere': 'ARK',
  'ck arekere': 'ARK',
  'jayanagar': 'JAY',
  'ferro': 'FERRO',
  'residency road': 'BLN',
  'marathahalli': 'WF'
};

/**
 * Get days until next delivery for an outlet
 * Returns object with next delivery day info and urgency level
 */
function getNextDeliveryInfo(outletName) {
  const today = new Date();
  const currentDay = today.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday

  // Normalize outlet name and get code
  const normalizedName = outletName.toLowerCase().trim();
  const outletCode = OUTLET_NAME_TO_CODE[normalizedName];

  if (!outletCode || !DELIVERY_SCHEDULE[outletCode]) {
    return {
      hasSchedule: false,
      message: 'Delivery schedule not available',
      urgency: 'unknown'
    };
  }

  const deliveryDays = DELIVERY_SCHEDULE[outletCode];

  // Find next delivery day
  let daysUntilDelivery = 7; // Max days in a week
  let nextDeliveryDay = null;

  for (let i = 0; i <= 7; i++) {
    const checkDay = (currentDay + i) % 7;
    if (deliveryDays.includes(checkDay)) {
      daysUntilDelivery = i;
      nextDeliveryDay = checkDay;
      break;
    }
  }

  // Determine urgency
  let urgency, urgencyLabel;
  if (daysUntilDelivery === 0) {
    urgency = 'low';
    urgencyLabel = '✅ OK - Delivery TODAY';
  } else if (daysUntilDelivery === 1) {
    urgency = 'low';
    urgencyLabel = '✅ OK - Delivery TOMORROW';
  } else if (daysUntilDelivery === 2) {
    urgency = 'medium';
    urgencyLabel = '⚠️ MEDIUM - Delivery in 2 days';
  } else {
    urgency = 'high';
    urgencyLabel = `🔴 CRITICAL - Delivery in ${daysUntilDelivery} days`;
  }

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  return {
    hasSchedule: true,
    daysUntilDelivery,
    nextDeliveryDay: dayNames[nextDeliveryDay],
    urgency,
    urgencyLabel,
    message: urgencyLabel
  };
}

/**
 * Get current stock status from Live Inventory sheet
 * Returns real-time IN STOCK / OUT OF STOCK status for all items
 */
async function getLiveInventoryStatus(outlet = null, statusFilter = null) {
  try {
    if (!sheets) {
      await initializeGoogleServices();
    }

    const STOCK_SPREADSHEET_ID = '12kfAZX7gV0UszUHhTI9i9iy8OObJ0Uc_8fJC18O1ILg';
    const LIVE_INVENTORY_TAB = 'Live Inventory';

    console.log(`📦 Fetching Live Inventory${outlet ? ` for ${outlet}` : ''}${statusFilter ? ` (${statusFilter})` : ''}`);

    // Fetch live inventory data
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: STOCK_SPREADSHEET_ID,
      range: `${LIVE_INVENTORY_TAB}!A:H`, // A=SKU, B=Item, C=Outlet, D=Status, E=LastOut, F=LastIn, G=CurrentSince, H=Duration(hours)
    });

    const allData = response.data.values || [];

    if (allData.length <= 1) {
      return { items: [], summary: 'No live inventory data available' };
    }

    // Skip header row
    const dataRows = allData.slice(1);

    const inventoryItems = [];
    let filteredCount = 0;

    for (const row of dataRows) {
      if (row && row.length >= 4) { // Need at least SKU, Item, Outlet, Status
        const skuCode = row[0] ? row[0].toString().trim() : '';
        const itemName = row[1] ? row[1].toString().trim() : '';
        const itemOutlet = row[2] ? row[2].toString().trim() : '';
        const status = row[3] ? row[3].toString().trim() : '';
        const lastStockOut = row[4] ? row[4].toString().trim() : '';
        const lastStockIn = row[5] ? row[5].toString().trim() : '';
        const currentSince = row[6] ? row[6].toString().trim() : '';
        const durationHours = row[7] ? parseFloat(row[7].toString().trim()) : null;

        // Skip if missing required fields
        if (!itemName || !itemOutlet || !status) {
          continue;
        }

        // Apply outlet filter if specified
        if (outlet && itemOutlet.toLowerCase() !== outlet.toLowerCase()) {
          filteredCount++;
          continue;
        }

        // Apply status filter if specified (OUT OF STOCK, IN STOCK)
        if (statusFilter && status.toLowerCase() !== statusFilter.toLowerCase()) {
          filteredCount++;
          continue;
        }

        // Get delivery info for this outlet
        const deliveryInfo = getNextDeliveryInfo(itemOutlet);

        inventoryItems.push({
          skuCode,
          itemName,
          outlet: itemOutlet,
          status,
          lastStockOutDate: lastStockOut,
          lastStockInDate: lastStockIn,
          currentSince,
          durationHours, // Duration in hours for out-of-stock items
          deliveryInfo
        });
      }
    }

    // Generate summary
    const outOfStockCount = inventoryItems.filter(item => item.status.toLowerCase().includes('out')).length;
    const inStockCount = inventoryItems.filter(item => item.status.toLowerCase().includes('in')).length;

    const summary = outlet
      ? `${outlet}: ${outOfStockCount} OUT OF STOCK, ${inStockCount} IN STOCK`
      : `Total: ${outOfStockCount} OUT OF STOCK, ${inStockCount} IN STOCK across all outlets`;

    console.log(`📊 Live Inventory Results: ${inventoryItems.length} items (filtered: ${filteredCount})`);

    return {
      items: inventoryItems,
      summary,
      counts: {
        total: inventoryItems.length,
        outOfStock: outOfStockCount,
        inStock: inStockCount,
        filtered: filteredCount
      }
    };

  } catch (error) {
    console.error('Error fetching live inventory:', error.message);
    return {
      items: [],
      summary: 'Error fetching live inventory data',
      error: error.message
    };
  }
}

/**
 * Get stock-out durations from Live Inventory sheet
 * Calculates how long products were out of stock using LastOut and LastIn timestamps
 */
async function getStockOutDurations(daysBack = 7, outlet = null) {
  try {
    if (!sheets) {
      await initializeGoogleServices();
    }

    const STOCK_SPREADSHEET_ID = '12kfAZX7gV0UszUHhTI9i9iy8OObJ0Uc_8fJC18O1ILg';
    const LIVE_INVENTORY_TAB = 'Live Inventory';

    console.log(`📦 Calculating stock-out durations for last ${daysBack} days...`);

    // Fetch live inventory data
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: STOCK_SPREADSHEET_ID,
      range: `${LIVE_INVENTORY_TAB}!A:H`, // Include Duration (hours) column
    });

    const allData = response.data.values || [];
    if (allData.length <= 1) {
      return { stockOutEvents: [], summary: 'No live inventory data available' };
    }

    const dataRows = allData.slice(1);
    const stockOutEvents = [];
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);

    for (const row of dataRows) {
      if (row && row.length >= 6) {
        const skuCode = row[0] ? row[0].toString().trim() : '';
        const itemName = row[1] ? row[1].toString().trim() : '';
        const itemOutlet = row[2] ? row[2].toString().trim() : '';
        const status = row[3] ? row[3].toString().trim() : '';
        const lastStockOut = row[4] ? row[4].toString().trim() : '';
        const lastStockIn = row[5] ? row[5].toString().trim() : '';

        if (!itemName || !lastStockOut) continue;

        // Apply outlet filter
        if (outlet && itemOutlet.toLowerCase() !== outlet.toLowerCase()) continue;

        // Parse dates
        const stockOutDate = parseDate(lastStockOut);
        if (!stockOutDate || stockOutDate < cutoffDate) continue;

        let durationHours = null;
        let durationDays = null;
        let isStillOut = false;

        if (lastStockIn && lastStockIn !== '') {
          const stockInDate = parseDate(lastStockIn);
          if (stockInDate && stockInDate > stockOutDate) {
            const durationMs = stockInDate - stockOutDate;
            durationHours = (durationMs / (1000 * 60 * 60)).toFixed(1);
            durationDays = (durationMs / (1000 * 60 * 60 * 24)).toFixed(1);
          }
        } else {
          // Still out of stock
          isStillOut = true;
          const now = new Date();
          const durationMs = now - stockOutDate;
          durationHours = (durationMs / (1000 * 60 * 60)).toFixed(1);
          durationDays = (durationMs / (1000 * 60 * 60 * 24)).toFixed(1);
        }

        stockOutEvents.push({
          sku: skuCode,
          itemName,
          outlet: itemOutlet,
          stockOutDate: lastStockOut,
          stockInDate: lastStockIn || 'Still Out',
          durationHours: parseFloat(durationHours),
          durationDays: parseFloat(durationDays),
          isStillOut,
          status
        });
      }
    }

    // Sort by duration (longest first)
    stockOutEvents.sort((a, b) => b.durationHours - a.durationHours);

    // Calculate summary stats
    const totalEvents = stockOutEvents.length;
    const stillOutCount = stockOutEvents.filter(e => e.isStillOut).length;
    const resolvedCount = totalEvents - stillOutCount;
    const avgDurationHours = totalEvents > 0
      ? (stockOutEvents.reduce((sum, e) => sum + e.durationHours, 0) / totalEvents).toFixed(1)
      : 0;

    return {
      stockOutEvents,
      summary: `Found ${totalEvents} stock-out events in last ${daysBack} days. ${stillOutCount} still out, ${resolvedCount} resolved. Avg duration: ${avgDurationHours} hours.`,
      stats: {
        totalEvents,
        stillOut: stillOutCount,
        resolved: resolvedCount,
        avgDurationHours: parseFloat(avgDurationHours)
      }
    };

  } catch (error) {
    console.error('Error calculating stock-out durations:', error.message);
    return {
      stockOutEvents: [],
      summary: `Error: ${error.message}`,
      stats: null
    };
  }
}

/**
 * Calculate out-of-stock duration percentage for an item at an outlet or across all outlets
 * Returns the percentage of time an item was out of stock relative to operating hours
 */
async function getStockOutDurationPercentage(itemQuery, outletQuery, daysBack = 3) {
  try {
    if (!sheets) {
      await initializeGoogleServices();
    }

    const STOCK_SPREADSHEET_ID = '12kfAZX7gV0UszUHhTI9i9iy8OObJ0Uc_8fJC18O1ILg';
    const LIVE_INVENTORY_TAB = 'Live Inventory';

    const isAllOutlets = !outletQuery || outletQuery.toLowerCase() === 'all';
    console.log(`📊 Calculating OOS percentage for "${itemQuery}" ${isAllOutlets ? 'across ALL outlets' : `at "${outletQuery}"`} (last ${daysBack} days)`);

    // Fetch live inventory data
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: STOCK_SPREADSHEET_ID,
      range: `${LIVE_INVENTORY_TAB}!A:H`,
    });

    const allData = response.data.values || [];
    if (allData.length <= 1) {
      return { error: 'No live inventory data available' };
    }

    const dataRows = allData.slice(1);
    let totalOOSHours = 0;
    let itemsFound = [];
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);

    // Track outlets found for calculating total operating hours
    const outletsFound = new Set();

    console.log(`📊 Analyzing period: last ${daysBack} days (cutoff: ${cutoffDate.toISOString()})`);

    // Find matching items and aggregate their durations within the time period
    for (const row of dataRows) {
      if (row && row.length >= 4) {
        const skuCode = row[0] ? row[0].toString().trim() : '';
        const itemName = row[1] ? row[1].toString().trim() : '';
        const itemOutlet = row[2] ? row[2].toString().trim() : '';
        const status = row[3] ? row[3].toString().trim() : '';
        const lastStockOut = row[4] ? row[4].toString().trim() : '';
        const lastStockIn = row[5] ? row[5].toString().trim() : '';
        const durationHours = row[7] ? parseFloat(row[7].toString().trim()) : 0;

        // Match item (by name or SKU) and outlet
        const itemMatches = itemName.toLowerCase().includes(itemQuery.toLowerCase()) ||
                          skuCode.toLowerCase().includes(itemQuery.toLowerCase());
        const outletMatches = isAllOutlets || itemOutlet.toLowerCase().includes(outletQuery.toLowerCase());

        if (itemMatches && outletMatches && durationHours > 0) {
          // Get operating hours for THIS specific outlet
          const outletHoursPerDay = getOutletOperatingHours(itemOutlet);
          const maxDurationForPeriod = daysBack * outletHoursPerDay;

          // Track this outlet
          outletsFound.add(itemOutlet);

          // Parse the stock-out date to check if it's within the period
          const stockOutDate = lastStockOut ? parseDate(lastStockOut) : null;

          let durationToCount = durationHours;
          let note = '';

          if (stockOutDate) {
            // Check if stock-out happened before the cutoff date
            if (stockOutDate < cutoffDate) {
              // Item went out before our analysis period
              // Only count the portion that falls within the period
              const now = new Date();
              const stockInDate = lastStockIn ? parseDate(lastStockIn) : null;

              if (stockInDate && stockInDate > cutoffDate) {
                // Item came back in stock during the period
                const durationInPeriod = (stockInDate - cutoffDate) / (1000 * 60 * 60);
                durationToCount = Math.min(durationInPeriod, maxDurationForPeriod);
                note = `(${durationHours}h total, counting ${durationToCount.toFixed(1)}h within period)`;
              } else if (!stockInDate && status.toLowerCase().includes('out')) {
                // Item is still out, count from cutoff date to now
                const durationInPeriod = (now - cutoffDate) / (1000 * 60 * 60);
                durationToCount = Math.min(durationInPeriod, maxDurationForPeriod);
                note = `(${durationHours}h total, counting ${durationToCount.toFixed(1)}h within period)`;
              } else {
                // Item came back in before the period started, skip it
                continue;
              }
            } else {
              // Stock-out happened within the analysis period
              // Use the full duration, but cap at max for the period
              durationToCount = Math.min(durationHours, maxDurationForPeriod);
              if (durationHours > maxDurationForPeriod) {
                note = `(capped at ${maxDurationForPeriod}h for ${daysBack}-day period)`;
              }
            }
          } else {
            // No stock-out date, use duration as-is but cap it
            durationToCount = Math.min(durationHours, maxDurationForPeriod);
            if (durationHours > maxDurationForPeriod) {
              note = `(capped at ${maxDurationForPeriod}h for ${daysBack}-day period)`;
            }
          }

          totalOOSHours += durationToCount;
          itemsFound.push({
            itemName,
            outlet: itemOutlet,
            status,
            durationHours: durationToCount,
            originalDuration: durationHours,
            stockOutDate: lastStockOut || 'N/A',
            note
          });
        }
      }
    }

    if (itemsFound.length === 0) {
      return {
        percentage: 0,
        summary: `No out-of-stock events found for "${itemQuery}" ${isAllOutlets ? 'across all outlets' : `at "${outletQuery}"`} in the last ${daysBack} days`,
        details: {
          itemName: itemQuery,
          outlet: isAllOutlets ? 'All Outlets' : outletQuery,
          outlets: [],
          totalOOSHours: 0,
          totalOperatingHours: 0,
          daysAnalyzed: daysBack,
          outletBreakdown: [],
          entriesCount: 0,
          events: []
        }
      };
    }

    // Calculate total operating hours based on outlets found
    let totalOperatingHours = 0;
    const outletBreakdown = [];

    if (isAllOutlets) {
      // Sum operating hours for all outlets found
      for (const outlet of outletsFound) {
        const hours = getOutletOperatingHours(outlet);
        const outletTotal = daysBack * hours;
        totalOperatingHours += outletTotal;
        outletBreakdown.push({ outlet, hoursPerDay: hours, totalHours: outletTotal });
      }
    } else {
      // Single outlet
      const outletHoursPerDay = getOutletOperatingHours(itemsFound[0].outlet);
      totalOperatingHours = daysBack * outletHoursPerDay;
      outletBreakdown.push({
        outlet: itemsFound[0].outlet,
        hoursPerDay: outletHoursPerDay,
        totalHours: totalOperatingHours
      });
    }

    // Calculate percentage
    const percentage = ((totalOOSHours / totalOperatingHours) * 100).toFixed(2);

    const outletList = isAllOutlets
      ? `across ${outletsFound.size} outlets (${Array.from(outletsFound).join(', ')})`
      : `at ${itemsFound[0].outlet}`;

    return {
      percentage: parseFloat(percentage),
      summary: `"${itemsFound[0].itemName}" ${outletList} was OUT OF STOCK for ${totalOOSHours.toFixed(1)} hours (aggregated from ${itemsFound.length} entry/entries) out of ${totalOperatingHours} operating hours in the last ${daysBack} days (${percentage}%)`,
      details: {
        itemName: itemsFound[0].itemName,
        outlet: isAllOutlets ? `All Outlets (${outletsFound.size})` : itemsFound[0].outlet,
        outlets: Array.from(outletsFound),
        totalOOSHours: parseFloat(totalOOSHours.toFixed(1)),
        totalOperatingHours,
        daysAnalyzed: daysBack,
        outletBreakdown,
        entriesCount: itemsFound.length,
        events: itemsFound
      }
    };

  } catch (error) {
    console.error('Error calculating OOS percentage:', error.message);
    return {
      error: `Error: ${error.message}`,
      percentage: null
    };
  }
}

/**
 * Get stock-out duration percentages for ALL products
 * @param {Number} daysBack - Period to analyze
 * @param {String} outletQuery - Specific outlet or null for all
 * @returns {Object} All products with their OOS percentages
 */
async function getAllProductsStockOutPercentages(daysBack = 3, outletQuery = null) {
  try {
    if (!sheets) {
      await initializeGoogleServices();
    }

    const STOCK_SPREADSHEET_ID = '12kfAZX7gV0UszUHhTI9i9iy8OObJ0Uc_8fJC18O1ILg';
    const LIVE_INVENTORY_TAB = 'Live Inventory';

    const isAllOutlets = !outletQuery || outletQuery.toLowerCase() === 'all';
    console.log(`📊 Calculating OOS percentage for ALL products ${isAllOutlets ? 'across all outlets' : `at "${outletQuery}"`} (last ${daysBack} days)`);

    // Fetch live inventory data
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: STOCK_SPREADSHEET_ID,
      range: `${LIVE_INVENTORY_TAB}!A:H`,
    });

    const allData = response.data.values || [];
    if (allData.length <= 1) {
      return { error: 'No live inventory data available' };
    }

    const dataRows = allData.slice(1);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);

    // Group by product
    const productMap = new Map();
    const outletsByProduct = new Map();

    for (const row of dataRows) {
      if (row && row.length >= 4) {
        const itemName = row[1] ? row[1].toString().trim() : '';
        const itemOutlet = row[2] ? row[2].toString().trim() : '';
        const status = row[3] ? row[3].toString().trim() : '';
        const lastStockOut = row[4] ? row[4].toString().trim() : '';
        const lastStockIn = row[5] ? row[5].toString().trim() : '';
        const durationHours = row[7] ? parseFloat(row[7].toString().trim()) : 0;

        if (!itemName) continue;

        // Check outlet filter
        const outletMatches = isAllOutlets || itemOutlet.toLowerCase().includes(outletQuery.toLowerCase());
        if (!outletMatches) continue;

        const normalizedName = itemName.toLowerCase();

        if (!productMap.has(normalizedName)) {
          productMap.set(normalizedName, {
            productName: itemName,
            totalOOSHours: 0,
            outlets: new Set(),
            entries: []
          });
          outletsByProduct.set(normalizedName, new Set());
        }

        const productData = productMap.get(normalizedName);
        productData.outlets.add(itemOutlet);

        if (durationHours > 0) {
          const outletHoursPerDay = getOutletOperatingHours(itemOutlet);
          const maxDurationForPeriod = daysBack * outletHoursPerDay;

          const stockOutDate = lastStockOut ? parseDate(lastStockOut) : null;
          let durationToCount = durationHours;

          // For weekly reports: Only include stock-out events that started within the last 7 days
          if (stockOutDate) {
            // Skip stock-out events that started before the cutoff date (older than 7 days)
            if (stockOutDate < cutoffDate) {
              continue;
            }
            // Stock-out event is within the 7-day period
            durationToCount = Math.min(durationHours, maxDurationForPeriod);
          } else {
            // No stock-out date available - skip this entry
            continue;
          }

          productData.totalOOSHours += durationToCount;
          productData.entries.push({
            outlet: itemOutlet,
            duration: durationToCount,
            stockOutDate: lastStockOut || 'N/A'
          });
        }
      }
    }

    // Calculate percentages
    const results = [];
    for (const [normalizedName, data] of productMap.entries()) {
      if (data.entries.length === 0) continue; // Skip products with no OOS events

      // Calculate total operating hours for all outlets this product is in
      let totalOperatingHours = 0;
      for (const outlet of data.outlets) {
        const hours = getOutletOperatingHours(outlet);
        totalOperatingHours += daysBack * hours;
      }

      const percentage = totalOperatingHours > 0
        ? (data.totalOOSHours / totalOperatingHours) * 100
        : 0;

      results.push({
        productName: data.productName,
        oosPercentage: parseFloat(percentage.toFixed(2)),
        totalOOSHours: parseFloat(data.totalOOSHours.toFixed(1)),
        totalOperatingHours,
        outletsAffected: data.outlets.size,
        outlets: Array.from(data.outlets),
        eventsCount: data.entries.length
      });
    }

    // Sort by OOS percentage (highest first)
    results.sort((a, b) => b.oosPercentage - a.oosPercentage);

    const totalProducts = results.length;
    const productsWithOOS = results.filter(p => p.oosPercentage > 0).length;
    const avgOOSPercentage = totalProducts > 0
      ? results.reduce((sum, p) => sum + p.oosPercentage, 0) / totalProducts
      : 0;

    return {
      success: true,
      summary: {
        totalProducts,
        productsWithOOS,
        avgOOSPercentage: parseFloat(avgOOSPercentage.toFixed(2)),
        daysAnalyzed: daysBack,
        outletFilter: isAllOutlets ? 'All Outlets' : outletQuery
      },
      products: results
    };

  } catch (error) {
    console.error('Error getting all products OOS percentages:', error.message);
    return { error: error.message };
  }
}

/**
 * Correlate sales deprecation with stock availability
 * Analyzes if sales decrease is due to stock issues
 */
async function correlateSalesWithStock(productData, dateRangeInfo, filters = {}) {
  try {
    // Extract product names from product data
    const productNames = productData.products.map(p => p.name);

    if (productNames.length === 0) {
      return null;
    }

    // Parse days from dateRangeInfo
    let daysBack = 7;
    if (dateRangeInfo.includes('last 7 days')) daysBack = 7;
    else if (dateRangeInfo.includes('last 30 days')) daysBack = 30;
    else if (dateRangeInfo.includes('last 14 days')) daysBack = 14;

    // Get stock data for these products
    const stockData = await getStockDataForProducts(
      productNames,
      daysBack,
      filters.branch || null
    );

    if (!stockData.productStockMap || stockData.productStockMap.size === 0) {
      return {
        hasStockIssues: false,
        affectedProducts: [],
        summary: 'No stock issues detected for analyzed products.'
      };
    }

    // Identify products with both low sales AND stock issues
    const affectedProducts = [];

    for (const product of productData.products) {
      if (stockData.productStockMap.has(product.name)) {
        const stockInfo = stockData.productStockMap.get(product.name);
        affectedProducts.push({
          name: product.name,
          orders: product.totalOrders,
          rating: product.avgRating,
          stockEvents: stockInfo.totalEvents,
          outletCount: stockInfo.outletEvents.length,
          outlets: stockInfo.outletEvents.map(e => `${e.outlet} (${e.count}x)`).join(', '),
          detailedEvents: stockInfo.detailedEvents || [] // Include detailed timestamp info
        });
      }
    }

    // Sort by stock events (most affected first)
    affectedProducts.sort((a, b) => b.stockEvents - a.stockEvents);

    return {
      hasStockIssues: affectedProducts.length > 0,
      affectedProducts: affectedProducts,
      summary: affectedProducts.length > 0
        ? `${affectedProducts.length} product(s) had stock availability issues that may have affected sales.`
        : 'No correlation between sales and stock issues detected.',
      totalStockEvents: stockData.stockEvents.length,
      allStockEvents: stockData.stockEvents // Include all raw events for detailed queries
    };

  } catch (error) {
    console.error('Error correlating sales with stock:', error.message);
    return null;
  }
}

/**
 * Calculate sales impact before and after stock-out events
 * Returns percentage drop in sales and revenue impact
 */
async function calculateSalesImpact(productNames, daysBack = 7, outlet = null) {
  try {
    console.log('Calculating sales impact for stock-out events...');

    // Get stock-out events for the specified products
    const stockData = await getStockDataForProducts(productNames, daysBack, outlet);

    if (!stockData.productStockMap || stockData.productStockMap.size === 0) {
      return {
        success: false,
        message: 'No stock-out events found for the specified products and time period.',
        impacts: []
      };
    }

    const impacts = [];

    // Process each product that had stock-out events
    for (const [productName, stockInfo] of stockData.productStockMap) {
      const productImpacts = [];

      // Process each stock-out event
      for (const event of stockInfo.detailedEvents || []) {
        try {
          // Parse the stock-out date (format: "DD/MM/YYYY HH:mm")
          const stockOutDateParts = event.time.split(' ')[0].split('/');
          const stockOutDate = new Date(
            parseInt(stockOutDateParts[2]),
            parseInt(stockOutDateParts[1]) - 1,
            parseInt(stockOutDateParts[0])
          );

          if (isNaN(stockOutDate.getTime())) {
            console.warn(`Invalid date for stock-out event: ${event.time}`);
            continue;
          }

          // Define periods
          const beforePeriodEnd = new Date(stockOutDate);
          beforePeriodEnd.setDate(beforePeriodEnd.getDate() - 1);
          const beforePeriodStart = new Date(beforePeriodEnd);
          beforePeriodStart.setDate(beforePeriodStart.getDate() - 6); // 7 days before

          const duringPeriodStart = stockOutDate;
          const duringPeriodEnd = new Date(stockOutDate);
          duringPeriodEnd.setDate(duringPeriodEnd.getDate() + 2); // Assume 3-day stock-out

          const afterPeriodStart = new Date(duringPeriodEnd);
          afterPeriodStart.setDate(afterPeriodStart.getDate() + 1);
          const afterPeriodEnd = new Date(afterPeriodStart);
          afterPeriodEnd.setDate(afterPeriodEnd.getDate() + 6); // 7 days after

          // Get sales data for each period
          const beforeSales = await getSalesForPeriod(productName, beforePeriodStart, beforePeriodEnd, event.outlet);
          const duringSales = await getSalesForPeriod(productName, duringPeriodStart, duringPeriodEnd, event.outlet);
          const afterSales = await getSalesForPeriod(productName, afterPeriodStart, afterPeriodEnd, event.outlet);

          // Calculate impact
          const avgDailyBefore = beforeSales.totalOrders / 7;
          const avgDailyDuring = duringSales.totalOrders / 3;
          const avgDailyAfter = afterSales.totalOrders / 7;

          const salesDropPercentage = avgDailyBefore > 0
            ? ((avgDailyBefore - avgDailyDuring) / avgDailyBefore * 100)
            : 0;

          const expectedOrders = avgDailyBefore * 3;
          const lostOrders = Math.max(0, expectedOrders - duringSales.totalOrders);
          const lostRevenue = lostOrders * (beforeSales.totalRevenue / Math.max(1, beforeSales.totalOrders));

          productImpacts.push({
            stockOutDate: event.time,
            outlet: event.outlet,
            sku: event.sku,
            beforePeriod: {
              start: beforePeriodStart.toISOString().split('T')[0],
              end: beforePeriodEnd.toISOString().split('T')[0],
              totalOrders: beforeSales.totalOrders,
              totalRevenue: beforeSales.totalRevenue,
              avgDailyOrders: avgDailyBefore.toFixed(2)
            },
            duringPeriod: {
              start: duringPeriodStart.toISOString().split('T')[0],
              end: duringPeriodEnd.toISOString().split('T')[0],
              totalOrders: duringSales.totalOrders,
              totalRevenue: duringSales.totalRevenue,
              avgDailyOrders: avgDailyDuring.toFixed(2)
            },
            afterPeriod: {
              start: afterPeriodStart.toISOString().split('T')[0],
              end: afterPeriodEnd.toISOString().split('T')[0],
              totalOrders: afterSales.totalOrders,
              totalRevenue: afterSales.totalRevenue,
              avgDailyOrders: avgDailyAfter.toFixed(2)
            },
            impact: {
              salesDropPercentage: salesDropPercentage.toFixed(2),
              lostOrders: Math.round(lostOrders),
              lostRevenue: lostRevenue.toFixed(2),
              recoveryPercentage: avgDailyBefore > 0
                ? ((avgDailyAfter / avgDailyBefore) * 100).toFixed(2)
                : 0
            }
          });
        } catch (eventError) {
          console.error(`Error processing event for ${productName}:`, eventError.message);
        }
      }

      if (productImpacts.length > 0) {
        // Calculate aggregate impact for the product
        const totalLostOrders = productImpacts.reduce((sum, imp) => sum + parseInt(imp.impact.lostOrders), 0);
        const totalLostRevenue = productImpacts.reduce((sum, imp) => sum + parseFloat(imp.impact.lostRevenue), 0);
        const avgSalesDropPercentage = productImpacts.reduce((sum, imp) => sum + parseFloat(imp.impact.salesDropPercentage), 0) / productImpacts.length;

        impacts.push({
          productName,
          totalStockOutEvents: productImpacts.length,
          totalLostOrders,
          totalLostRevenue: totalLostRevenue.toFixed(2),
          avgSalesDropPercentage: avgSalesDropPercentage.toFixed(2),
          events: productImpacts
        });
      }
    }

    // Sort by total lost revenue (highest impact first)
    impacts.sort((a, b) => parseFloat(b.totalLostRevenue) - parseFloat(a.totalLostRevenue));

    return {
      success: true,
      totalProducts: impacts.length,
      totalLostOrders: impacts.reduce((sum, imp) => sum + imp.totalLostOrders, 0),
      totalLostRevenue: impacts.reduce((sum, imp) => sum + parseFloat(imp.totalLostRevenue), 0).toFixed(2),
      impacts
    };

  } catch (error) {
    console.error('Error calculating sales impact:', error.message);
    return {
      success: false,
      message: `Error: ${error.message}`,
      impacts: []
    };
  }
}

/**
 * Get sales data for a specific product and time period
 */
async function getSalesForPeriod(productName, startDate, endDate, outlet = null) {
  try {
    if (!sheets) {
      await initializeGoogleServices();
    }

    // Fetch ProductDetails sheet
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: DASHBOARD_SPREADSHEET_ID,
      range: 'ProductDetails!A:Z'
    });

    const rows = response.data.values || [];
    if (rows.length < 2) {
      return { totalOrders: 0, totalRevenue: 0 };
    }

    const headers = rows[0];
    const dateIndex = headers.findIndex(h => h && h.toLowerCase().includes('date'));
    const itemNameIndex = headers.findIndex(h => h && h.toLowerCase().includes('item name'));
    const ordersIndex = headers.findIndex(h => h && h.toLowerCase() === 'orders');
    const revenueIndex = headers.findIndex(h => h && (h.toLowerCase().includes('revenue') || h.toLowerCase().includes('total')));
    const outletIndex = headers.findIndex(h => h && (h.toLowerCase().includes('outlet') || h.toLowerCase().includes('branch')));

    let totalOrders = 0;
    let totalRevenue = 0;

    // Process rows
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];

      // Check product name match (fuzzy)
      const itemName = row[itemNameIndex] || '';
      if (!itemName.toLowerCase().includes(productName.toLowerCase().substring(0, 10))) {
        continue;
      }

      // Check outlet match if specified
      if (outlet && outletIndex >= 0) {
        const rowOutlet = row[outletIndex] || '';
        if (!rowOutlet.toLowerCase().includes(outlet.toLowerCase())) {
          continue;
        }
      }

      // Check date range
      if (dateIndex >= 0) {
        const dateStr = row[dateIndex];
        if (dateStr) {
          const rowDate = parseDate(dateStr);
          if (rowDate && rowDate >= startDate && rowDate <= endDate) {
            totalOrders += parseInt(row[ordersIndex]) || 0;
            totalRevenue += parseFloat(row[revenueIndex]) || 0;
          }
        }
      }
    }

    return { totalOrders, totalRevenue };

  } catch (error) {
    console.error('Error getting sales for period:', error.message);
    return { totalOrders: 0, totalRevenue: 0 };
  }
}

/**
 * Parse date string in various formats
 * Handles: DD/MM/YYYY, DD/MM/YYYY HH:MM, standard ISO dates
 */
function parseDate(dateStr) {
  try {
    if (!dateStr || dateStr.trim() === '') return null;

    // Try DD/MM/YYYY or DD/MM/YYYY HH:MM format
    if (dateStr.includes('/')) {
      // Split by space to separate date and time
      const [datePart, timePart] = dateStr.split(' ');
      const dateParts = datePart.split('/');

      if (dateParts.length === 3) {
        const day = parseInt(dateParts[0]);
        const month = parseInt(dateParts[1]) - 1; // JS months are 0-indexed
        const year = parseInt(dateParts[2]);

        if (timePart) {
          // Parse time HH:MM
          const timeParts = timePart.split(':');
          const hours = parseInt(timeParts[0]) || 0;
          const minutes = parseInt(timeParts[1]) || 0;
          return new Date(year, month, day, hours, minutes);
        } else {
          // No time component
          return new Date(year, month, day);
        }
      }
    }

    // Try standard Date parsing
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date;
  } catch (error) {
    return null;
  }
}

/**
 * Analyze daily sales to find days where sales dropped below average
 * @param {Number|Object} filterOrRange - Either daysFilter (number) or dateRange {startDate, endDate}
 * @param {Object} additionalFilters - Branch and channel filters
 * @returns {Object} Analysis of daily sales with days below average
 */
async function analyzeDailySalesDrops(filterOrRange = DATE_FILTER_DAYS, additionalFilters = {}) {
  try {
    if (!sheets) {
      const initialized = await initializeGoogleServices();
      if (!initialized) {
        throw new Error('Failed to initialize Google Sheets');
      }
    }

    // Fetch ProductDetails sheet
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: DASHBOARD_SPREADSHEET_ID,
      range: 'ProductDetails!A1:Z50000',
    });

    const rawData = response.data.values;
    if (!rawData || rawData.length < 2) {
      return { error: 'No data available' };
    }

    const headers = rawData[0];
    const dateIndex = headers.findIndex(h => h && h.toLowerCase().includes('date'));
    const orderCountIndex = headers.findIndex(h => h && h.toLowerCase().includes('order count'));
    const revenueIndex = headers.findIndex(h => h && h.toLowerCase() === 'revenue');
    const branchIndex = headers.findIndex(h => h && h.toLowerCase().includes('branch'));
    const channelIndex = headers.findIndex(h => h && h.toLowerCase().includes('channel'));

    if (dateIndex === -1 || orderCountIndex === -1) {
      return { error: 'Required columns not found' };
    }

    // Determine filter type
    const isRangeFilter = filterOrRange && typeof filterOrRange === 'object' && filterOrRange.startDate;
    const daysFilter = !isRangeFilter ? filterOrRange : null;
    const dateRange = isRangeFilter ? filterOrRange : null;

    const { branch, channel } = additionalFilters;

    // Group data by date
    const dailySalesMap = new Map();

    for (let i = 1; i < rawData.length; i++) {
      const row = rawData[i];
      const dateStr = row[dateIndex]?.toString().trim();
      const orderCount = parseInt(row[orderCountIndex]) || 0;
      const revenue = revenueIndex !== -1 ? parseCurrencyValue(row[revenueIndex]) : 0;
      const branchName = branchIndex !== -1 ? row[branchIndex]?.toString().trim() : '';
      const channelName = channelIndex !== -1 ? row[channelIndex]?.toString().trim() : '';

      if (!dateStr) continue;

      // Apply date filter
      let includeRow = true;
      if (dateRange) {
        includeRow = isDateInRange(dateStr, dateRange.startDate, dateRange.endDate);
      } else if (daysFilter) {
        includeRow = isDateWithinRange(dateStr, daysFilter);
      }

      if (!includeRow) continue;

      // Apply branch filter
      if (branch && !branchesMatch(branchName, branch)) continue;

      // Apply channel filter
      if (channel && channelName.toLowerCase() !== channel.toLowerCase()) continue;

      // Aggregate by date
      const parsedDate = parseFlexibleDate(dateStr);
      if (!parsedDate) continue;

      const dateKey = parsedDate.toISOString().split('T')[0]; // YYYY-MM-DD format

      if (dailySalesMap.has(dateKey)) {
        const existing = dailySalesMap.get(dateKey);
        existing.totalOrders += orderCount;
        existing.totalRevenue += revenue;
      } else {
        dailySalesMap.set(dateKey, {
          date: dateKey,
          displayDate: dateStr,
          totalOrders: orderCount,
          totalRevenue: revenue
        });
      }
    }

    // Convert to array and sort by date
    const dailySales = Array.from(dailySalesMap.values()).sort((a, b) =>
      new Date(a.date) - new Date(b.date)
    );

    if (dailySales.length === 0) {
      return { error: 'No sales data found for the specified period' };
    }

    // Calculate average daily sales
    const totalOrders = dailySales.reduce((sum, day) => sum + day.totalOrders, 0);
    const totalRevenue = dailySales.reduce((sum, day) => sum + day.totalRevenue, 0);
    const avgDailyOrders = totalOrders / dailySales.length;
    const avgDailyRevenue = totalRevenue / dailySales.length;

    // Find days below average
    const daysWithDrops = dailySales
      .map(day => {
        const orderDrop = avgDailyOrders - day.totalOrders;
        const revenueDrop = avgDailyRevenue - day.totalRevenue;
        const orderDropPercentage = (orderDrop / avgDailyOrders) * 100;
        const revenueDropPercentage = (revenueDrop / avgDailyRevenue) * 100;

        return {
          ...day,
          orderDrop,
          revenueDrop,
          orderDropPercentage,
          revenueDropPercentage,
          isBelowAverage: day.totalOrders < avgDailyOrders || day.totalRevenue < avgDailyRevenue
        };
      })
      .filter(day => day.isBelowAverage)
      .sort((a, b) => b.orderDropPercentage - a.orderDropPercentage); // Sort by biggest drop first

    // Get day of week distribution
    const dayOfWeekSales = new Map();
    dailySales.forEach(day => {
      const date = new Date(day.date);
      const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long' });

      if (!dayOfWeekSales.has(dayOfWeek)) {
        dayOfWeekSales.set(dayOfWeek, { orders: 0, revenue: 0, count: 0 });
      }

      const existing = dayOfWeekSales.get(dayOfWeek);
      existing.orders += day.totalOrders;
      existing.revenue += day.totalRevenue;
      existing.count += 1;
    });

    const dayOfWeekAnalysis = Array.from(dayOfWeekSales.entries()).map(([day, data]) => ({
      dayOfWeek: day,
      avgOrders: data.orders / data.count,
      avgRevenue: data.revenue / data.count,
      totalDays: data.count
    })).sort((a, b) => a.avgOrders - b.avgOrders);

    return {
      success: true,
      periodSummary: {
        totalDays: dailySales.length,
        avgDailyOrders: Math.round(avgDailyOrders * 100) / 100,
        avgDailyRevenue: Math.round(avgDailyRevenue * 100) / 100,
        totalOrders,
        totalRevenue,
        daysAboveAverage: dailySales.filter(d => d.totalOrders >= avgDailyOrders).length,
        daysBelowAverage: daysWithDrops.length
      },
      daysWithDrops,
      allDailySales: dailySales,
      dayOfWeekAnalysis,
      filters: additionalFilters
    };
  } catch (error) {
    console.error('Error analyzing daily sales drops:', error);
    return { error: error.message };
  }
}

/**
 * Predict optimal stock levels based on historical demand patterns
 * Calculates safety stock and reorder quantities to prevent stock-outs
 * @param {Number} daysBack - Historical data period to analyze
 * @param {Object} additionalFilters - Branch and channel filters
 * @param {Number} serviceLevel - Target service level (default 95% = 1.65 std dev)
 * @param {Number} leadTimeDays - Supplier lead time in days (default 0.5)
 * @returns {Object} Stock recommendations by product and outlet
 */
async function predictOptimalStockLevels(daysBack = 30, additionalFilters = {}, serviceLevel = 0.95, leadTimeDays = 0.5) {
  try {
    if (!sheets) {
      const initialized = await initializeGoogleServices();
      if (!initialized) {
        throw new Error('Failed to initialize Google Sheets');
      }
    }

    // Fetch ProductDetails sheet for historical sales
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: DASHBOARD_SPREADSHEET_ID,
      range: 'ProductDetails!A1:Z50000',
    });

    const rawData = response.data.values;
    if (!rawData || rawData.length < 2) {
      return { error: 'No data available' };
    }

    const headers = rawData[0];
    const dateIndex = headers.findIndex(h => h && h.toLowerCase().includes('date'));
    const itemNameIndex = headers.findIndex(h => h && h.toLowerCase().includes('item name'));
    const orderCountIndex = headers.findIndex(h => h && h.toLowerCase().includes('order count'));
    const branchIndex = headers.findIndex(h => h && h.toLowerCase().includes('branch'));
    const channelIndex = headers.findIndex(h => h && h.toLowerCase().includes('channel'));

    if (dateIndex === -1 || itemNameIndex === -1 || orderCountIndex === -1) {
      return { error: 'Required columns not found' };
    }

    const { branch, channel } = additionalFilters;

    // Group data by product, outlet, and date
    const productOutletDateMap = new Map();
    const cutoffDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

    for (let i = 1; i < rawData.length; i++) {
      const row = rawData[i];
      const dateStr = row[dateIndex]?.toString().trim();
      const itemName = row[itemNameIndex]?.toString().trim();
      const orderCount = parseInt(row[orderCountIndex]) || 0;
      const branchName = branchIndex !== -1 ? row[branchIndex]?.toString().trim() : '';
      const channelName = channelIndex !== -1 ? row[channelIndex]?.toString().trim() : '';

      if (!dateStr || !itemName || !branchName) continue;

      // Apply date filter
      const parsedDate = parseFlexibleDate(dateStr);
      if (!parsedDate || parsedDate < cutoffDate) continue;

      // Apply filters
      if (branch && !branchesMatch(branchName, branch)) continue;
      if (channel && channelName.toLowerCase() !== channel.toLowerCase()) continue;

      // Create unique key for product-outlet-date
      const normalizedName = normalizeProductName(itemName);
      const dateKey = parsedDate.toISOString().split('T')[0];
      const key = `${normalizedName}|||${branchName}|||${dateKey}`;

      if (productOutletDateMap.has(key)) {
        productOutletDateMap.get(key).orders += orderCount;
      } else {
        productOutletDateMap.set(key, {
          productName: itemName,
          normalizedName,
          outlet: branchName,
          date: dateKey,
          orders: orderCount
        });
      }
    }

    // Aggregate by product and outlet
    const productOutletStats = new Map();

    for (const entry of productOutletDateMap.values()) {
      const key = `${entry.normalizedName}|||${entry.outlet}`;

      if (!productOutletStats.has(key)) {
        productOutletStats.set(key, {
          productName: entry.productName,
          normalizedName: entry.normalizedName,
          outlet: entry.outlet,
          dailyDemands: [],
          totalDays: 0
        });
      }

      productOutletStats.get(key).dailyDemands.push(entry.orders);
    }

    // Calculate statistics and optimal stock levels
    const recommendations = [];
    const zScore = serviceLevel === 0.95 ? 1.65 : (serviceLevel === 0.99 ? 2.33 : 1.65); // Z-score for service level

    for (const [key, stats] of productOutletStats.entries()) {
      const dailyDemands = stats.dailyDemands;
      const n = dailyDemands.length;

      if (n === 0) continue;

      // Calculate average daily demand
      const avgDailyDemand = dailyDemands.reduce((sum, d) => sum + d, 0) / n;

      // Calculate standard deviation of demand
      const variance = dailyDemands.reduce((sum, d) => sum + Math.pow(d - avgDailyDemand, 2), 0) / n;
      const stdDev = Math.sqrt(variance);

      // Calculate coefficient of variation (demand variability indicator)
      const coefficientOfVariation = avgDailyDemand > 0 ? (stdDev / avgDailyDemand) * 100 : 0;

      // Safety stock formula: Z-score × StdDev × √(Lead Time)
      const safetyStock = Math.ceil(zScore * stdDev * Math.sqrt(leadTimeDays));

      // Reorder point: (Average Daily Demand × Lead Time) + Safety Stock
      const reorderPoint = Math.ceil((avgDailyDemand * leadTimeDays) + safetyStock);

      // Economic Order Quantity (simplified) - order for 1 day + safety stock
      const recommendedOrderQty = Math.ceil(avgDailyDemand + safetyStock);

      // Maximum inventory level (for 1.5 days with safety stock)
      const maxInventory = Math.ceil((avgDailyDemand * 1.5) + safetyStock);

      // Stock-out risk assessment
      const maxDemand = Math.max(...dailyDemands);
      const stockOutRisk = maxDemand > reorderPoint ? 'High' : (maxDemand > safetyStock ? 'Medium' : 'Low');

      // Demand pattern classification
      let demandPattern = 'Stable';
      if (coefficientOfVariation > 50) demandPattern = 'Highly Variable';
      else if (coefficientOfVariation > 25) demandPattern = 'Variable';

      recommendations.push({
        productName: stats.productName,
        outlet: stats.outlet,
        avgDailyDemand: parseFloat(avgDailyDemand.toFixed(2)),
        stdDev: parseFloat(stdDev.toFixed(2)),
        coefficientOfVariation: parseFloat(coefficientOfVariation.toFixed(1)),
        demandPattern,
        safetyStock,
        reorderPoint,
        recommendedOrderQty,
        maxInventory,
        maxDemandObserved: maxDemand,
        stockOutRisk,
        daysAnalyzed: n,
        serviceLevel: `${(serviceLevel * 100).toFixed(0)}%`
      });
    }

    // Sort by stock-out risk (High first) then by average demand (highest first)
    recommendations.sort((a, b) => {
      const riskOrder = { 'High': 0, 'Medium': 1, 'Low': 2 };
      if (riskOrder[a.stockOutRisk] !== riskOrder[b.stockOutRisk]) {
        return riskOrder[a.stockOutRisk] - riskOrder[b.stockOutRisk];
      }
      return b.avgDailyDemand - a.avgDailyDemand;
    });

    // Calculate summary statistics
    const totalProducts = recommendations.length;
    const highRiskProducts = recommendations.filter(r => r.stockOutRisk === 'High').length;
    const mediumRiskProducts = recommendations.filter(r => r.stockOutRisk === 'Medium').length;
    const lowRiskProducts = recommendations.filter(r => r.stockOutRisk === 'Low').length;
    const highVariabilityProducts = recommendations.filter(r => r.demandPattern === 'Highly Variable').length;

    return {
      success: true,
      summary: {
        totalProducts,
        highRiskProducts,
        mediumRiskProducts,
        lowRiskProducts,
        highVariabilityProducts,
        daysAnalyzed: daysBack,
        serviceLevel: `${(serviceLevel * 100).toFixed(0)}%`,
        leadTimeDays,
        currentBufferDays: 0.5,
        recommendedApproach: 'Dynamic safety stock based on demand variability'
      },
      recommendations,
      methodology: {
        description: 'Statistical inventory optimization using safety stock calculation',
        safetyStockFormula: `Z-score (${zScore}) × Standard Deviation × √(Lead Time Days)`,
        reorderPointFormula: '(Avg Daily Demand × Lead Time) + Safety Stock',
        serviceLevel: `${(serviceLevel * 100).toFixed(0)}% (${zScore} standard deviations)`,
        notes: [
          'Safety stock varies by product based on demand variability',
          'Higher variability = higher safety stock needed',
          'Reorder point triggers when to order more stock',
          'Max inventory prevents overstocking'
        ]
      },
      filters: additionalFilters
    };
  } catch (error) {
    console.error('Error predicting optimal stock levels:', error);
    return { error: error.message };
  }
}

/**
 * Analyze product performance trends - identify growing, stable, and declining products
 * Compares recent period vs previous period to detect trends
 * @param {Number} recentDays - Recent period to analyze (default 14 days)
 * @param {Number} previousDays - Previous period to compare against (default 14 days)
 * @param {Object} additionalFilters - Branch and channel filters
 * @returns {Object} Product trend analysis with growth rates
 */
async function analyzeProductTrends(recentDays = 14, previousDays = 14, additionalFilters = {}) {
  try {
    if (!sheets) {
      const initialized = await initializeGoogleServices();
      if (!initialized) {
        throw new Error('Failed to initialize Google Sheets');
      }
    }

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: DASHBOARD_SPREADSHEET_ID,
      range: 'ProductDetails!A1:Z50000',
    });

    const rawData = response.data.values;
    if (!rawData || rawData.length < 2) return { error: 'No data available' };

    const headers = rawData[0];
    const dateIndex = headers.findIndex(h => h && h.toLowerCase().includes('date'));
    const itemNameIndex = headers.findIndex(h => h && h.toLowerCase().includes('item name'));
    const orderCountIndex = headers.findIndex(h => h && h.toLowerCase().includes('order count'));
    const revenueIndex = headers.findIndex(h => h && h.toLowerCase() === 'revenue');
    const branchIndex = headers.findIndex(h => h && h.toLowerCase().includes('branch'));
    const channelIndex = headers.findIndex(h => h && h.toLowerCase().includes('channel'));

    if (dateIndex === -1 || itemNameIndex === -1 || orderCountIndex === -1) {
      return { error: 'Required columns not found' };
    }

    const { branch, channel } = additionalFilters;

    const recentStart = new Date(Date.now() - recentDays * 24 * 60 * 60 * 1000);
    const previousStart = new Date(Date.now() - (recentDays + previousDays) * 24 * 60 * 60 * 1000);
    const previousEnd = recentStart;

    const recentPeriod = new Map();
    const previousPeriod = new Map();

    for (let i = 1; i < rawData.length; i++) {
      const row = rawData[i];
      const dateStr = row[dateIndex]?.toString().trim();
      const itemName = row[itemNameIndex]?.toString().trim();
      const orderCount = parseInt(row[orderCountIndex]) || 0;
      const revenue = revenueIndex !== -1 ? parseCurrencyValue(row[revenueIndex]) : 0;
      const branchName = branchIndex !== -1 ? row[branchIndex]?.toString().trim() : '';
      const channelName = channelIndex !== -1 ? row[channelIndex]?.toString().trim() : '';

      if (!dateStr || !itemName) continue;

      const parsedDate = parseFlexibleDate(dateStr);
      if (!parsedDate) continue;

      // Apply filters
      if (branch && !branchesMatch(branchName, branch)) continue;
      if (channel && channelName.toLowerCase() !== channel.toLowerCase()) continue;

      const normalizedName = normalizeProductName(itemName);

      // Categorize into recent or previous period
      if (parsedDate >= recentStart) {
        if (!recentPeriod.has(normalizedName)) {
          recentPeriod.set(normalizedName, { name: itemName, orders: 0, revenue: 0 });
        }
        const entry = recentPeriod.get(normalizedName);
        entry.orders += orderCount;
        entry.revenue += revenue;
      } else if (parsedDate >= previousStart && parsedDate < previousEnd) {
        if (!previousPeriod.has(normalizedName)) {
          previousPeriod.set(normalizedName, { name: itemName, orders: 0, revenue: 0 });
        }
        const entry = previousPeriod.get(normalizedName);
        entry.orders += orderCount;
        entry.revenue += revenue;
      }
    }

    // Calculate trends
    const trends = [];
    const allProducts = new Set([...recentPeriod.keys(), ...previousPeriod.keys()]);

    for (const normalizedName of allProducts) {
      const recent = recentPeriod.get(normalizedName) || { name: '', orders: 0, revenue: 0 };
      const previous = previousPeriod.get(normalizedName) || { name: '', orders: 0, revenue: 0 };
      const name = recent.name || previous.name;

      const orderGrowth = previous.orders > 0
        ? ((recent.orders - previous.orders) / previous.orders) * 100
        : (recent.orders > 0 ? 100 : 0);

      const revenueGrowth = previous.revenue > 0
        ? ((recent.revenue - previous.revenue) / previous.revenue) * 100
        : (recent.revenue > 0 ? 100 : 0);

      let trend = 'Stable';
      if (orderGrowth > 20) trend = 'Rapidly Growing';
      else if (orderGrowth > 10) trend = 'Growing';
      else if (orderGrowth < -20) trend = 'Rapidly Declining';
      else if (orderGrowth < -10) trend = 'Declining';

      let lifecycle = 'Mature';
      if (previous.orders === 0 && recent.orders > 0) lifecycle = 'New Product';
      else if (recent.orders === 0 && previous.orders > 0) lifecycle = 'Discontinued';
      else if (orderGrowth > 50) lifecycle = 'Star (High Growth)';
      else if (orderGrowth < -30 && recent.orders < 10) lifecycle = 'Dying';

      trends.push({
        productName: name,
        recentOrders: recent.orders,
        previousOrders: previous.orders,
        recentRevenue: recent.revenue,
        previousRevenue: previous.revenue,
        orderGrowth: parseFloat(orderGrowth.toFixed(1)),
        revenueGrowth: parseFloat(revenueGrowth.toFixed(1)),
        trend,
        lifecycle,
        avgDailyOrders: parseFloat((recent.orders / recentDays).toFixed(2))
      });
    }

    trends.sort((a, b) => b.orderGrowth - a.orderGrowth);

    const growing = trends.filter(t => t.orderGrowth > 10);
    const declining = trends.filter(t => t.orderGrowth < -10);
    const stable = trends.filter(t => t.orderGrowth >= -10 && t.orderGrowth <= 10);
    const newProducts = trends.filter(t => t.lifecycle === 'New Product');
    const stars = trends.filter(t => t.lifecycle === 'Star (High Growth)');

    return {
      success: true,
      summary: {
        totalProducts: trends.length,
        growing: growing.length,
        declining: declining.length,
        stable: stable.length,
        newProducts: newProducts.length,
        stars: stars.length,
        recentPeriod: `Last ${recentDays} days`,
        comparedTo: `Previous ${previousDays} days`
      },
      trends,
      growing,
      declining,
      stable,
      newProducts,
      stars
    };
  } catch (error) {
    console.error('Error analyzing product trends:', error);
    return { error: error.message };
  }
}

/**
 * Compare outlet performance across all metrics
 * @param {Number} daysBack - Period to analyze
 * @returns {Object} Outlet comparison with rankings
 */
async function compareOutletPerformance(daysBack = 30) {
  try {
    if (!sheets) {
      const initialized = await initializeGoogleServices();
      if (!initialized) {
        throw new Error('Failed to initialize Google Sheets');
      }
    }

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: DASHBOARD_SPREADSHEET_ID,
      range: 'ProductDetails!A1:Z50000',
    });

    const rawData = response.data.values;
    if (!rawData || rawData.length < 2) return { error: 'No data available' };

    const headers = rawData[0];
    const dateIndex = headers.findIndex(h => h && h.toLowerCase().includes('date'));
    const orderCountIndex = headers.findIndex(h => h && h.toLowerCase().includes('order count'));
    const revenueIndex = headers.findIndex(h => h && h.toLowerCase() === 'revenue');
    const branchIndex = headers.findIndex(h => h && h.toLowerCase().includes('branch'));

    if (dateIndex === -1 || orderCountIndex === -1 || branchIndex === -1) {
      return { error: 'Required columns not found' };
    }

    const cutoffDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
    const outletStats = new Map();

    for (let i = 1; i < rawData.length; i++) {
      const row = rawData[i];
      const dateStr = row[dateIndex]?.toString().trim();
      const orderCount = parseInt(row[orderCountIndex]) || 0;
      const revenue = revenueIndex !== -1 ? parseCurrencyValue(row[revenueIndex]) : 0;
      const branchName = branchIndex !== -1 ? row[branchIndex]?.toString().trim() : '';

      if (!dateStr || !branchName) continue;

      const parsedDate = parseFlexibleDate(dateStr);
      if (!parsedDate || parsedDate < cutoffDate) continue;

      if (!outletStats.has(branchName)) {
        outletStats.set(branchName, { orders: 0, revenue: 0, days: new Set() });
      }

      const stats = outletStats.get(branchName);
      stats.orders += orderCount;
      stats.revenue += revenue;
      stats.days.add(parsedDate.toISOString().split('T')[0]);
    }

    const outletPerformance = [];
    for (const [outlet, stats] of outletStats.entries()) {
      const activeDays = stats.days.size;
      const avgDailyOrders = activeDays > 0 ? stats.orders / activeDays : 0;
      const avgDailyRevenue = activeDays > 0 ? stats.revenue / activeDays : 0;

      outletPerformance.push({
        outlet,
        totalOrders: stats.orders,
        totalRevenue: stats.revenue,
        avgDailyOrders: parseFloat(avgDailyOrders.toFixed(2)),
        avgDailyRevenue: parseFloat(avgDailyRevenue.toFixed(2)),
        activeDays
      });
    }

    // Rankings
    const byRevenue = [...outletPerformance].sort((a, b) => b.totalRevenue - a.totalRevenue);
    const byOrders = [...outletPerformance].sort((a, b) => b.totalOrders - a.totalOrders);
    const byAvgRevenue = [...outletPerformance].sort((a, b) => b.avgDailyRevenue - a.avgDailyRevenue);

    const totalRevenue = outletPerformance.reduce((sum, o) => sum + o.totalRevenue, 0);
    const totalOrders = outletPerformance.reduce((sum, o) => sum + o.totalOrders, 0);

    return {
      success: true,
      summary: {
        totalOutlets: outletPerformance.length,
        totalRevenue,
        totalOrders,
        avgRevenuePerOutlet: parseFloat((totalRevenue / outletPerformance.length).toFixed(2)),
        avgOrdersPerOutlet: parseFloat((totalOrders / outletPerformance.length).toFixed(2)),
        daysAnalyzed: daysBack
      },
      outletPerformance,
      rankings: {
        byRevenue,
        byOrders,
        byAvgDailyRevenue: byAvgRevenue
      }
    };
  } catch (error) {
    console.error('Error comparing outlet performance:', error);
    return { error: error.message };
  }
}

/**
 * Analyze product profitability and identify high-value items
 * @param {Number} daysBack - Period to analyze
 * @param {Object} additionalFilters - Branch and channel filters
 * @returns {Object} Profitability analysis
 */
async function analyzeProductProfitability(daysBack = 30, additionalFilters = {}) {
  try {
    if (!sheets) {
      const initialized = await initializeGoogleServices();
      if (!initialized) {
        throw new Error('Failed to initialize Google Sheets');
      }
    }

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: DASHBOARD_SPREADSHEET_ID,
      range: 'ProductDetails!A1:Z50000',
    });

    const rawData = response.data.values;
    if (!rawData || rawData.length < 2) return { error: 'No data available' };

    const headers = rawData[0];
    const dateIndex = headers.findIndex(h => h && h.toLowerCase().includes('date'));
    const itemNameIndex = headers.findIndex(h => h && h.toLowerCase().includes('item name'));
    const orderCountIndex = headers.findIndex(h => h && h.toLowerCase().includes('order count'));
    const revenueIndex = headers.findIndex(h => h && h.toLowerCase() === 'revenue');
    const branchIndex = headers.findIndex(h => h && h.toLowerCase().includes('branch'));
    const channelIndex = headers.findIndex(h => h && h.toLowerCase().includes('channel'));

    if (dateIndex === -1 || itemNameIndex === -1 || orderCountIndex === -1 || revenueIndex === -1) {
      return { error: 'Required columns not found' };
    }

    const { branch, channel } = additionalFilters;
    const cutoffDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
    const productStats = new Map();

    for (let i = 1; i < rawData.length; i++) {
      const row = rawData[i];
      const dateStr = row[dateIndex]?.toString().trim();
      const itemName = row[itemNameIndex]?.toString().trim();
      const orderCount = parseInt(row[orderCountIndex]) || 0;
      const revenue = parseCurrencyValue(row[revenueIndex]);
      const branchName = branchIndex !== -1 ? row[branchIndex]?.toString().trim() : '';
      const channelName = channelIndex !== -1 ? row[channelIndex]?.toString().trim() : '';

      if (!dateStr || !itemName || revenue === 0) continue;

      const parsedDate = parseFlexibleDate(dateStr);
      if (!parsedDate || parsedDate < cutoffDate) continue;

      if (branch && !branchesMatch(branchName, branch)) continue;
      if (channel && channelName.toLowerCase() !== channel.toLowerCase()) continue;

      const normalizedName = normalizeProductName(itemName);

      if (!productStats.has(normalizedName)) {
        productStats.set(normalizedName, { name: itemName, orders: 0, revenue: 0 });
      }

      const stats = productStats.get(normalizedName);
      stats.orders += orderCount;
      stats.revenue += revenue;
    }

    const products = [];
    let totalRevenue = 0;
    let totalOrders = 0;

    for (const [normalizedName, stats] of productStats.entries()) {
      const revenuePerOrder = stats.orders > 0 ? stats.revenue / stats.orders : 0;
      totalRevenue += stats.revenue;
      totalOrders += stats.orders;

      products.push({
        productName: stats.name,
        totalOrders: stats.orders,
        totalRevenue: parseFloat(stats.revenue.toFixed(2)),
        revenuePerOrder: parseFloat(revenuePerOrder.toFixed(2)),
        percentOfTotalRevenue: 0, // Will calculate after
        percentOfTotalOrders: 0
      });
    }

    // Calculate percentages and categorize
    for (const product of products) {
      product.percentOfTotalRevenue = parseFloat(((product.totalRevenue / totalRevenue) * 100).toFixed(2));
      product.percentOfTotalOrders = parseFloat(((product.totalOrders / totalOrders) * 100).toFixed(2));

      // Menu Engineering Matrix (simplified)
      const isHighRevenue = product.percentOfTotalRevenue > (100 / products.length);
      const isHighVolume = product.percentOfTotalOrders > (100 / products.length);

      if (isHighRevenue && isHighVolume) product.category = 'Star (High Value + High Volume)';
      else if (isHighRevenue && !isHighVolume) product.category = 'Premium (High Value, Low Volume)';
      else if (!isHighRevenue && isHighVolume) product.category = 'Workhorse (Low Value, High Volume)';
      else product.category = 'Dog (Consider Removing)';
    }

    products.sort((a, b) => b.totalRevenue - a.totalRevenue);

    // Calculate Pareto (80/20 rule)
    let cumulativeRevenue = 0;
    let paretoProducts = 0;
    for (const product of products) {
      cumulativeRevenue += product.totalRevenue;
      paretoProducts++;
      if (cumulativeRevenue >= totalRevenue * 0.8) break;
    }

    const stars = products.filter(p => p.category === 'Star (High Value + High Volume)');
    const premium = products.filter(p => p.category === 'Premium (High Value, Low Volume)');
    const workhorses = products.filter(p => p.category === 'Workhorse (Low Value, High Volume)');
    const dogs = products.filter(p => p.category === 'Dog (Consider Removing)');

    return {
      success: true,
      summary: {
        totalProducts: products.length,
        totalRevenue: parseFloat(totalRevenue.toFixed(2)),
        totalOrders,
        avgRevenuePerProduct: parseFloat((totalRevenue / products.length).toFixed(2)),
        avgRevenuePerOrder: parseFloat((totalRevenue / totalOrders).toFixed(2)),
        paretoProducts, // Products that generate 80% of revenue
        paretoPercentage: parseFloat(((paretoProducts / products.length) * 100).toFixed(1)),
        stars: stars.length,
        premium: premium.length,
        workhorses: workhorses.length,
        dogs: dogs.length,
        daysAnalyzed: daysBack
      },
      products,
      stars,
      premium,
      workhorses,
      dogs
    };
  } catch (error) {
    console.error('Error analyzing product profitability:', error);
    return { error: error.message };
  }
}

// Helper function to generate chatbot responses using AI (Gemini with Groq fallback)
async function generateChatbotResponse(userMessage, productData, conversationHistory = [], dateRangeInfo = 'All dates', filters = {}) {
  if (GEMINI_API_KEYS.length === 0 && groqClients.length === 0) {
    return {
      message: "AI service is not configured. Add GEMINI_API_KEY or GROQ_API_KEY to .env file.",
      structuredData: null
    };
  }

  try {
    // Prepare conversation context
    const conversationContext = conversationHistory
      .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
      .join('\n');

    // Prepare product data summary for context
    const topProducts = productData.products
      .sort((a, b) => b.totalOrders - a.totalOrders)
      .slice(0, 20);

    const lowRatedProducts = productData.products
      .filter(p => p.lowRatedPercentage > 5)
      .sort((a, b) => b.lowRatedPercentage - a.lowRatedPercentage)
      .slice(0, 10);

    const highRatedProducts = productData.products
      .filter(p => p.avgRating >= 4.0)
      .sort((a, b) => b.totalOrders - a.totalOrders)
      .slice(0, 10);

    // Build filter description
    const filterParts = [];
    if (filters.branch) filterParts.push(`Outlet: ${filters.branch}`);
    if (filters.channel) filterParts.push(`Channel: ${filters.channel}`);
    const filterInfo = filterParts.length > 0 ? filterParts.join(', ') : 'All outlets and channels';

    // Check if user is asking primarily about stock (not sales analysis)
    const isStockFocusedQuery = /out of stock|stock.*out|went.*stock|stock.*issue|stock.*event|which.*stock|stock.*last week/i.test(userMessage);

    // Check if user is asking about current/live stock status
    const isLiveInventoryQuery = /current.*stock|currently.*stock|what.*in stock|live.*inventory|stock.*status|stock.*now|which.*currently/i.test(userMessage);

    // Check if user is asking about sales impact from stock-outs
    const isSalesImpactQuery = /sales.*impact|impact.*sales|percentage.*drop|drop.*sales|lost.*sales|lost.*revenue|sales.*before.*after|before.*after.*stock|revenue.*impact|calculate.*impact|sales.*decrease|decrease.*sales/i.test(userMessage);

    // Check if user is asking about stock-out durations
    const isDurationQuery = /duration|how long|stock.*out.*for|out.*for.*how|time.*out|hours.*out|days.*out|stock.*out.*time/i.test(userMessage);

    // Check if user is asking about duration percentage (e.g., "percentage of time out of stock")
    const isDurationPercentageQuery = /percentage.*duration|duration.*percentage|percent.*out|out.*percent|% of time|percentage of time.*out|out of stock.*%|percentage.*being.*out|what.*percentage|give.*percentage/i.test(userMessage);

    // Check if asking for ALL products
    const isAllProductsOOSQuery = isDurationPercentageQuery && /all.*product|every.*product|all.*item|each.*product/i.test(userMessage);

    // Check if user is asking about daily sales drops/comparison
    const isDailySalesDropQuery = /daily.*sales.*drop|sales.*drop.*daily|which.*day.*sales.*drop|day.*sales.*dropped|sales.*below.*average|average.*daily.*sales|daily.*comparison|day.*by.*day|daily.*performance|worst.*day|best.*day.*sales/i.test(userMessage);

    // Check if user is asking about inventory optimization / stock predictions
    const isInventoryOptimizationQuery = /optimal.*stock|stock.*prediction|predict.*demand|how much.*stock|inventory.*optimization|safety.*stock|reorder.*point|stock.*level|prevent.*stock.*out|buffer.*stock|recommend.*stock|forecast.*demand|demand.*forecast|stock.*recommendation/i.test(userMessage);

    // Check if user is asking about product trends (growing/declining)
    const isProductTrendsQuery = /product.*trend|growing.*product|declining.*product|which.*growing|which.*declining|product.*lifecycle|new.*product|star.*product|trend.*analysis|growth.*rate|sales.*trend/i.test(userMessage);

    // Check if user is asking about outlet/branch comparison
    const isOutletComparisonQuery = /compare.*outlet|outlet.*performance|which.*outlet.*best|best.*performing.*outlet|outlet.*ranking|branch.*comparison|compare.*branch|outlet.*vs.*outlet|top.*outlet|worst.*outlet/i.test(userMessage);

    // Check if user is asking about product profitability / menu engineering
    const isProfitabilityQuery = /profitability|profit.*margin|high.*value.*product|revenue.*per.*order|menu.*engineering|pareto|80.*20|star.*product|premium.*product|workhorse|dog.*product|which.*product.*most.*profitable|highest.*revenue/i.test(userMessage);

    // NEW: Get stock data
    let stockCorrelation = null;
    let allStockEventsData = null;
    let liveInventoryData = null;
    let salesImpactData = null;
    let durationData = null;
    let durationPercentageData = null;
    let allProductsOOSData = null;
    let dailySalesAnalysis = null;
    let inventoryOptimization = null;
    let productTrends = null;
    let outletComparison = null;
    let profitabilityAnalysis = null;

    // Get live inventory if user is asking about current status
    if (isLiveInventoryQuery) {
      liveInventoryData = await getLiveInventoryStatus(filters.branch || null, null);
    }

    if (isStockFocusedQuery) {
      // Parse days from dateRangeInfo for ALL stock events
      let daysBack = 7;
      if (dateRangeInfo.includes('last 7 days') || dateRangeInfo.includes('Last 7 days')) daysBack = 7;
      else if (dateRangeInfo.includes('last 30 days')) daysBack = 30;
      else if (dateRangeInfo.includes('last 14 days')) daysBack = 14;

      // Get ALL stock events (not filtered by sales data)
      allStockEventsData = await getAllStockEvents(daysBack, filters.branch || null);

      // ALSO get stock correlation with sales data for impact analysis
      stockCorrelation = await correlateSalesWithStock(productData, dateRangeInfo, filters);
    } else {
      // Get stock correlation with sales data
      stockCorrelation = await correlateSalesWithStock(productData, dateRangeInfo, filters);
    }

    // Calculate sales impact if user is asking about impact
    if (isSalesImpactQuery && productData.products.length > 0) {
      // Parse days from dateRangeInfo
      let daysBack = 7;
      if (dateRangeInfo.includes('last 7 days') || dateRangeInfo.includes('Last 7 days')) daysBack = 7;
      else if (dateRangeInfo.includes('last 30 days')) daysBack = 30;
      else if (dateRangeInfo.includes('last 14 days')) daysBack = 14;

      // Get product names from the current product data
      const productNames = productData.products.slice(0, 50).map(p => p.name);

      // Calculate sales impact
      salesImpactData = await calculateSalesImpact(productNames, daysBack, filters.branch || null);
    }

    // Get stock-out durations if user is asking about durations
    if (isDurationQuery || isStockFocusedQuery) {
      let daysBack = 7;
      if (dateRangeInfo.includes('last 7 days') || dateRangeInfo.includes('Last 7 days')) daysBack = 7;
      else if (dateRangeInfo.includes('last 30 days')) daysBack = 30;
      else if (dateRangeInfo.includes('last 14 days')) daysBack = 14;
      else if (dateRangeInfo.includes('last 2 days')) daysBack = 2;

      durationData = await getStockOutDurations(daysBack, filters.branch || null);
    }

    // Get stock-out duration percentage if user is asking about percentage
    if (isDurationPercentageQuery) {
      // Parse days from message (e.g., "last 3 days", "last week")
      let daysBack = 3; // default
      const daysMatch = userMessage.match(/last\s+(\d+)\s+days?/i);
      if (daysMatch) {
        daysBack = parseInt(daysMatch[1]);
      } else if (/last\s+week/i.test(userMessage)) {
        daysBack = 7;
      } else if (/last\s+month/i.test(userMessage)) {
        daysBack = 30;
      }

      // Check if user wants ALL products
      if (isAllProductsOOSQuery) {
        console.log(`📊 Getting OOS% for ALL products (last ${daysBack} days)`);
        allProductsOOSData = await getAllProductsStockOutPercentages(daysBack, filters.branch || null);
      } else {
        // Try to parse item name and outlet from the message
        let itemQuery = null;
        let outletQuery = null;

      console.log(`🔍 Original query: "${userMessage}"`);

      // Clean up the message - remove filler phrases
      let cleanMessage = userMessage
        .replace(/what\s+(is|was)\s+the\s+percentage\s+of\s+time\s+(was|is)\s+/gi, '')
        .replace(/what\s+percentage\s+of\s+time\s+(was|is)\s+/gi, '')
        .replace(/percentage\s+of\s+time\s+(was|is)\s+/gi, '')
        .replace(/what\s+(is|was)\s+the\s+/gi, '')
        .replace(/give\s+me\s+(the\s+)?/gi, '')
        .replace(/duration\s+percentage\s+of\s+/gi, '')
        .replace(/percentage\s+of\s+/gi, '')
        .replace(/\s+out\s+of\s+stock(\s+|$)/gi, ' ')  // Fixed: allow end of string
        .replace(/\s+being\s+/gi, ' ')
        .trim();

      console.log(`🔍 Cleaned: "${cleanMessage}"`);

      // Pattern 0: "in the last X days, ITEM" or "last X days, ITEM" (time period comes first)
      let match0 = cleanMessage.match(/(?:in\s+the\s+)?last\s+\d+\s+days?,?\s+(.+?)$/i);
      if (match0) {
        itemQuery = match0[1].trim();
        console.log(`✅ Pattern 0 (time first): Item="${itemQuery}"`);
      }

      // Pattern 1: "ITEM at/in OUTLET in/last X days"
      if (!itemQuery) {
        let match1 = cleanMessage.match(/^([a-zA-Z0-9\s]+?)\s+(?:at|in)\s+([a-zA-Z0-9\s]+?)\s+(?:in\s+the\s+)?last/i);
        if (match1) {
          itemQuery = match1[1].trim();
          outletQuery = match1[2].trim();
          console.log(`✅ Pattern 1: Item="${itemQuery}", Outlet="${outletQuery}"`);
        }
      }

      // Pattern 2: "ITEM in/last X days" (no outlet specified)
      if (!itemQuery) {
        let match2 = cleanMessage.match(/^([a-zA-Z0-9\s]+?)\s+(?:in\s+the\s+)?last/i);
        if (match2) {
          itemQuery = match2[1].trim();
          console.log(`✅ Pattern 2: Item="${itemQuery}" (no outlet)`);
        }
      }

      // Pattern 3: Remove common prefixes/suffixes
      if (itemQuery) {
        itemQuery = itemQuery
          .replace(/^(for|of|the|percentage)\s+/i, '')
          .replace(/\s+(for|of|the|percentage)$/i, '')
          .trim();
      }

      if (outletQuery) {
        outletQuery = outletQuery
          .replace(/^(the|a|an)\s+/i, '')
          .replace(/\s+(the|a|an)$/i, '')
          .trim();

        // Filter out non-outlet words
        if (['the', 'a', 'an', 'last', 'this', 'that'].includes(outletQuery.toLowerCase())) {
          console.log(`❌ Filtered out invalid outlet: "${outletQuery}"`);
          outletQuery = null;
        }
      }

      console.log(`🎯 Final parse: Item="${itemQuery}", Outlet="${outletQuery || 'ALL OUTLETS'}"`);


      // Use filters.branch if outlet not found in message
      if (!outletQuery && filters.branch) {
        outletQuery = filters.branch;
      }

      // Try to fetch the data if we have the item
      if (itemQuery) {
        if (outletQuery) {
          console.log(`📊 Attempting to calculate OOS% for "${itemQuery}" at "${outletQuery}" (${daysBack} days)`);
        } else {
          console.log(`📊 Attempting to calculate OOS% for "${itemQuery}" across ALL outlets (${daysBack} days)`);
        }
        durationPercentageData = await getStockOutDurationPercentage(itemQuery, outletQuery, daysBack);
        }
      }
    }

    // Get daily sales analysis if user is asking about daily drops
    if (isDailySalesDropQuery) {
      // Parse days from dateRangeInfo
      let daysBack = 7; // default
      if (dateRangeInfo.includes('last 7 days') || dateRangeInfo.includes('Last 7 days')) daysBack = 7;
      else if (dateRangeInfo.includes('last 30 days')) daysBack = 30;
      else if (dateRangeInfo.includes('last 14 days')) daysBack = 14;
      else if (dateRangeInfo.includes('last 28 days')) daysBack = 28;

      // Parse days from message if specified
      const daysMatch = userMessage.match(/last\s+(\d+)\s+days?/i);
      if (daysMatch) {
        daysBack = parseInt(daysMatch[1]);
      }

      console.log(`📊 Analyzing daily sales drops for last ${daysBack} days`);

      const filterOrRange = {
        startDate: new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000),
        endDate: new Date()
      };

      dailySalesAnalysis = await analyzeDailySalesDrops(filterOrRange, filters);
    }

    // Get inventory optimization recommendations if user is asking
    if (isInventoryOptimizationQuery) {
      // Parse days from message or use 30 days default for better accuracy
      let daysBack = 30; // default for inventory analysis
      const daysMatch = userMessage.match(/last\s+(\d+)\s+days?/i);
      if (daysMatch) {
        daysBack = parseInt(daysMatch[1]);
      }

      // Parse service level if mentioned (e.g., "95% service level")
      let serviceLevel = 0.95; // default 95%
      const serviceLevelMatch = userMessage.match(/(\d+)%?\s*service\s*level/i);
      if (serviceLevelMatch) {
        serviceLevel = parseInt(serviceLevelMatch[1]) / 100;
      }

      console.log(`📦 Analyzing inventory optimization for last ${daysBack} days (${(serviceLevel * 100).toFixed(0)}% service level)`);

      inventoryOptimization = await predictOptimalStockLevels(daysBack, filters, serviceLevel);
    }

    // Get product trends if user is asking
    if (isProductTrendsQuery) {
      let recentDays = 14; // default
      let previousDays = 14; // default

      const daysMatch = userMessage.match(/last\s+(\d+)\s+days?/i);
      if (daysMatch) {
        recentDays = parseInt(daysMatch[1]);
        previousDays = recentDays; // Compare equal periods
      }

      console.log(`📈 Analyzing product trends: last ${recentDays} days vs previous ${previousDays} days`);

      productTrends = await analyzeProductTrends(recentDays, previousDays, filters);
    }

    // Get outlet comparison if user is asking
    if (isOutletComparisonQuery) {
      let daysBack = 30; // default
      const daysMatch = userMessage.match(/last\s+(\d+)\s+days?/i);
      if (daysMatch) {
        daysBack = parseInt(daysMatch[1]);
      }

      console.log(`🏪 Comparing outlet performance for last ${daysBack} days`);

      outletComparison = await compareOutletPerformance(daysBack);
    }

    // Get profitability analysis if user is asking
    if (isProfitabilityQuery) {
      let daysBack = 30; // default
      const daysMatch = userMessage.match(/last\s+(\d+)\s+days?/i);
      if (daysMatch) {
        daysBack = parseInt(daysMatch[1]);
      }

      console.log(`💰 Analyzing product profitability for last ${daysBack} days`);

      profitabilityAnalysis = await analyzeProductProfitability(daysBack, filters);
    }

    // Prepare stock information for prompt
    let stockInfo = '';

    // If user is asking about stock primarily, show ALL stock events
    if (isStockFocusedQuery && allStockEventsData) {
      stockInfo = `\n=== COMPLETE STOCK-OUT EVENT LOG ===
${allStockEventsData.summary}

ALL Out-of-Stock Events from Tracker:
${allStockEventsData.stockEvents.slice(0, 200).map((event, idx) =>
  `${idx + 1}. ${event.productName}
   - SKU Code: ${event.sku}
   - Date/Time: ${event.time}
   - Outlet: ${event.outlet}`
).join('\n')}
${allStockEventsData.stockEvents.length > 200 ? `\n... and ${allStockEventsData.stockEvents.length - 200} more events (showing first 200)` : ''}

IMPORTANT: This is the COMPLETE list of ALL out-of-stock events from the tracker, regardless of whether these products had sales or not.
When answering, provide:
- The exact SKU code for each item
- The precise date and time
- The specific outlet name
- Group by product name to show all instances
`;

      // Add sales correlation data if available
      if (stockCorrelation && stockCorrelation.hasStockIssues) {
        stockInfo += `\n=== SALES IMPACT ANALYSIS ===
Products from above list that ALSO have sales data (for impact correlation):
${stockCorrelation.affectedProducts.map((p, idx) => `${idx + 1}. ${p.name}
   - Current Period Sales: ${p.orders} orders
   - Average Rating: ${p.rating ? p.rating.toFixed(2) : 'N/A'} stars
   - Stock-out Events: ${p.stockEvents} event(s) in ${p.outletCount} outlet(s)
   - Impact: Product had ${p.stockEvents} stock-out(s) during the period which likely reduced potential sales`).join('\n')}

CRITICAL FOR ANALYSIS:
- Products with stock-outs AND low sales: The low sales are likely DUE TO stock unavailability
- Products with stock-outs AND good ratings: Sales drop is NOT a quality issue, it's a supply issue
- To calculate sales impact: Compare current sales to historical average (if product normally sells well but had low sales this period with stock-outs, that indicates impact)
`;
      }

    } else if (stockCorrelation && stockCorrelation.hasStockIssues) {
      // Sales-correlated stock analysis
      // Check if user is asking for detailed event information
      const wantsDetailedEvents = /exact|specific|when|which date|what date|detail|timestamp|sku/i.test(userMessage);

      stockInfo = `\n=== STOCK AVAILABILITY ANALYSIS ===
${stockCorrelation.summary}

Products with Out-of-Stock Events:
${stockCorrelation.affectedProducts.map((p, idx) => `${idx + 1}. ${p.name}
   - Sales: ${p.orders} orders
   - Stock Issues: ${p.stockEvents} out-of-stock event(s) in ${p.outletCount} outlet(s)
   - Affected Outlets: ${p.outlets}`).join('\n')}

IMPORTANT: When analyzing sales performance, consider that these products may have lower sales due to stock unavailability, NOT quality issues. This is critical for accurate insights.
`;

      // Add detailed event log if user is asking for specific dates/outlets
      if (wantsDetailedEvents && stockCorrelation.allStockEvents) {
        stockInfo += `\n=== DETAILED OUT-OF-STOCK EVENT LOG ===
The following is a complete log of out-of-stock events with exact dates, outlets, and SKU codes:

${stockCorrelation.allStockEvents.slice(0, 100).map((event, idx) =>
  `${idx + 1}. ${event.productName}
   - SKU Code: ${event.sku}
   - Date/Time: ${event.time}
   - Outlet: ${event.outlet}
   - Item Name: ${event.matchedItem}`
).join('\n')}
${stockCorrelation.allStockEvents.length > 100 ? `\n... and ${stockCorrelation.allStockEvents.length - 100} more events` : ''}

When asked for specific dates, outlets, and SKU codes, use this detailed log to provide EXACT information including:
- The SKU code of the out-of-stock item
- The specific date and time of the stock-out event
- The exact outlet name where it occurred
- The full item name as it appears in the stock tracker

IMPORTANT: Always include the SKU code when listing out-of-stock items.
`;
      }
    } else if (stockCorrelation && !stockCorrelation.hasStockIssues) {
      stockInfo = `\n=== STOCK AVAILABILITY ANALYSIS ===
✓ No stock availability issues detected for analyzed products.
- All products appear to have been consistently in stock during this period.
- Sales performance reflects actual demand, not stock constraints.
`;
    }

    // Add live inventory data if requested
    if (liveInventoryData && liveInventoryData.items.length > 0) {
      const outOfStockItems = liveInventoryData.items.filter(item => item.status.toLowerCase().includes('out'));
      const inStockItems = liveInventoryData.items.filter(item => item.status.toLowerCase().includes('in'));

      // Group OUT OF STOCK items by urgency
      const criticalItems = outOfStockItems.filter(item => item.deliveryInfo?.urgency === 'high');
      const mediumItems = outOfStockItems.filter(item => item.deliveryInfo?.urgency === 'medium');
      const okItems = outOfStockItems.filter(item => item.deliveryInfo?.urgency === 'low');
      const unknownItems = outOfStockItems.filter(item => !item.deliveryInfo?.hasSchedule);

      stockInfo += `\n=== LIVE INVENTORY STATUS (CURRENT) ===
${liveInventoryData.summary}

🔴 CRITICAL OUT OF STOCK (${criticalItems.length}) - Delivery 3+ days away:
${criticalItems.slice(0, 30).map((item, idx) =>
  `${idx + 1}. ${item.itemName}
   - SKU: ${item.skuCode || 'N/A'}
   - Outlet: ${item.outlet}
   - ${item.deliveryInfo.urgencyLabel} (Next: ${item.deliveryInfo.nextDeliveryDay})
   - Out Since: ${item.lastStockOutDate}`
).join('\n')}
${criticalItems.length > 30 ? `\n... and ${criticalItems.length - 30} more CRITICAL items` : ''}

⚠️ MEDIUM PRIORITY OUT OF STOCK (${mediumItems.length}) - Delivery in 2 days:
${mediumItems.slice(0, 20).map((item, idx) =>
  `${idx + 1}. ${item.itemName} - ${item.outlet} - ${item.deliveryInfo.urgencyLabel}`
).join('\n')}
${mediumItems.length > 20 ? `\n... and ${mediumItems.length - 20} more MEDIUM items` : ''}

✅ OK - OUT OF STOCK (${okItems.length}) - Delivery today/tomorrow:
${okItems.slice(0, 15).map((item, idx) =>
  `${idx + 1}. ${item.itemName} - ${item.outlet} - ${item.deliveryInfo.urgencyLabel}`
).join('\n')}
${okItems.length > 15 ? `\n... and ${okItems.length - 15} more OK items` : ''}
${unknownItems.length > 0 ? `\n${unknownItems.length} items with unknown delivery schedule` : ''}

Currently IN STOCK Items (${inStockItems.length}):
${inStockItems.slice(0, 20).map((item, idx) =>
  `${idx + 1}. ${item.itemName} - ${item.outlet} (Last Stock In: ${item.lastStockInDate})`
).join('\n')}
${inStockItems.length > 20 ? `\n... and ${inStockItems.length - 20} more IN STOCK items` : ''}

DELIVERY SCHEDULE CONTEXT:
- Group 1 (BLN, WF, KLN/Koramangala, Sahakarnagar): Mon, Thu, Sat deliveries
- Group 2 (Indiranagar, HSR, Arekere, Jayanagar): Wed, Fri, Sun deliveries
- FERRO: Night deliveries Mon & Thu
- We keep half-day stock, so items out today/tomorrow delivery = low priority
- CRITICAL items need immediate attention (3+ days until delivery)

IMPORTANT: This is REAL-TIME inventory status prioritized by delivery urgency. When answering, focus on CRITICAL items first.
`;
    }

    // Add sales impact analysis if calculated
    if (salesImpactData && salesImpactData.success && salesImpactData.impacts.length > 0) {
      stockInfo += `\n=== SALES IMPACT ANALYSIS - BEFORE/AFTER STOCK-OUTS ===
Summary:
- Total Products Analyzed: ${salesImpactData.totalProducts}
- Total Lost Orders: ${salesImpactData.totalLostOrders}
- Total Lost Revenue: ₹${salesImpactData.totalLostRevenue}

Detailed Impact by Product (sorted by revenue impact):
${salesImpactData.impacts.map((product, idx) => `
${idx + 1}. ${product.productName}
   - Stock-Out Events: ${product.totalStockOutEvents}
   - Average Sales Drop: ${product.avgSalesDropPercentage}%
   - Total Lost Orders: ${product.totalLostOrders}
   - Total Lost Revenue: ₹${product.totalLostRevenue}

   Detailed Events:
${product.events.map((event, eventIdx) => `   Event ${eventIdx + 1} - ${event.stockOutDate} at ${event.outlet}:
      • Before Stock-Out (${event.beforePeriod.start} to ${event.beforePeriod.end}):
        - Orders: ${event.beforePeriod.totalOrders} | Revenue: ₹${event.beforePeriod.totalRevenue.toFixed(2)}
        - Avg Daily Orders: ${event.beforePeriod.avgDailyOrders}
      • During Stock-Out (${event.duringPeriod.start} to ${event.duringPeriod.end}):
        - Orders: ${event.duringPeriod.totalOrders} | Revenue: ₹${event.duringPeriod.totalRevenue.toFixed(2)}
        - Avg Daily Orders: ${event.duringPeriod.avgDailyOrders}
      • After Stock-Out (${event.afterPeriod.start} to ${event.afterPeriod.end}):
        - Orders: ${event.afterPeriod.totalOrders} | Revenue: ₹${event.afterPeriod.totalRevenue.toFixed(2)}
        - Avg Daily Orders: ${event.afterPeriod.avgDailyOrders}
      • IMPACT:
        - Sales Drop: ${event.impact.salesDropPercentage}%
        - Lost Orders: ${event.impact.lostOrders}
        - Lost Revenue: ₹${event.impact.lostRevenue}
        - Recovery Rate: ${event.impact.recoveryPercentage}%`).join('\n')}
`).join('\n')}

CRITICAL INSIGHTS FOR RESPONSE:
- The above data shows EXACT percentage drops in sales before and after each stock-out event
- "Sales Drop %" = ((Avg Daily Before - Avg Daily During) / Avg Daily Before) * 100
- "Lost Orders" = Expected orders based on pre-stock-out average minus actual orders during stock-out
- "Lost Revenue" = Lost orders multiplied by average revenue per order
- "Recovery Rate" = (Avg Daily After / Avg Daily Before) * 100 - shows if sales recovered post-stock-out
- When answering about sales impact, use these EXACT numbers and percentages
- Highlight products with highest revenue impact first
`;
    } else if (salesImpactData && !salesImpactData.success) {
      stockInfo += `\n=== SALES IMPACT ANALYSIS ===
${salesImpactData.message || 'Unable to calculate sales impact - no stock-out events found in the specified period.'}
`;
    }

    // Add stock-out duration data if available
    if (durationData && durationData.stockOutEvents && durationData.stockOutEvents.length > 0) {
      stockInfo += `\n=== STOCK-OUT DURATIONS (From Live Inventory) ===
${durationData.summary}

Top Stock-Out Events by Duration:
${durationData.stockOutEvents.slice(0, 20).map((event, idx) =>
  `${idx + 1}. ${event.itemName} (${event.outlet})
   - SKU: ${event.sku}
   - Out Since: ${event.stockOutDate}
   - Back In Stock: ${event.stockInDate}
   - Duration: ${event.durationDays} days (${event.durationHours} hours)${event.isStillOut ? ' - STILL OUT OF STOCK ⚠️' : ''}`
).join('\n')}
${durationData.stockOutEvents.length > 20 ? `\n... and ${durationData.stockOutEvents.length - 20} more events` : ''}

CRITICAL INSIGHTS:
- Average stock-out duration: ${durationData.stats.avgDurationHours} hours
- ${durationData.stats.stillOut} items still out of stock
- ${durationData.stats.resolved} items resolved
- When answering duration questions, use these EXACT durations from Live Inventory
- Prioritize items that are STILL OUT or had longest durations
`;
    }

    // Add stock-out duration percentage if available
    if (durationPercentageData && durationPercentageData.percentage !== null) {
      stockInfo += `\n=== OUT-OF-STOCK DURATION PERCENTAGE (CALCULATED) ===
${durationPercentageData.summary}

⚠️ CRITICAL - USE THESE EXACT VALUES:
- Item: ${durationPercentageData.details.itemName}
- Outlet: ${durationPercentageData.details.outlet}
${durationPercentageData.details.outlets && durationPercentageData.details.outlets.length > 1 ? `- Outlets included: ${durationPercentageData.details.outlets.join(', ')}
- Outlet breakdown:
${durationPercentageData.details.outletBreakdown && durationPercentageData.details.outletBreakdown.length > 0 ? durationPercentageData.details.outletBreakdown.map(ob => `  * ${ob.outlet}: ${ob.hoursPerDay} hrs/day × ${durationPercentageData.details.daysAnalyzed} days = ${ob.totalHours} hours`).join('\n') : 'N/A'}` : durationPercentageData.details.outletBreakdown && durationPercentageData.details.outletBreakdown.length > 0 ? `- Operating hours per day: ${durationPercentageData.details.outletBreakdown[0].hoursPerDay} hours (NOT 24 hours!)` : ''}
- Days analyzed: ${durationPercentageData.details.daysAnalyzed} days
- Total operating hours: ${durationPercentageData.details.totalOperatingHours} hours
- Number of OOS entries found: ${durationPercentageData.details.entriesCount}
- Total out-of-stock hours (AGGREGATED): ${durationPercentageData.details.totalOOSHours} hours
- CALCULATED PERCENTAGE: ${durationPercentageData.percentage}%

BREAKDOWN OF ALL ENTRIES (PERIOD-AWARE AGGREGATION):
${durationPercentageData.details.events && durationPercentageData.details.events.length > 0 ? durationPercentageData.details.events.map((event, idx) =>
  `${idx + 1}. Duration counted: ${event.durationHours.toFixed(1)} hours${event.note ? ' ' + event.note : ''}
   - Status: ${event.status}
   - Stock-out date: ${event.stockOutDate}`
).join('\n') : 'No events found'}
${durationPercentageData.details.entriesCount > 1 ? `\nTotal OOS Hours in Period: ${durationPercentageData.details.totalOOSHours} hours (aggregated from ${durationPercentageData.details.entriesCount} entries)` : ''}

⚠️ MANDATORY INSTRUCTIONS FOR PERCENTAGE CALCULATIONS:
- ALWAYS use the EXACT percentage shown above: ${durationPercentageData.percentage}%
- DO NOT recalculate using 24 hours/day - the calculation already uses correct operating hours
- The calculation is PERIOD-AWARE: only counts OOS hours within the requested time period (${durationPercentageData.details.daysAnalyzed} days)
- If an item was out longer than the period, only the portion within the period is counted
- The total OOS hours (${durationPercentageData.details.totalOOSHours}) is the AGGREGATE of ALL duration entries within the ${durationPercentageData.details.daysAnalyzed}-day period
- Formula used: (${durationPercentageData.details.totalOOSHours} hours ÷ ${durationPercentageData.details.totalOperatingHours} hours) × 100 = ${durationPercentageData.percentage}%
- Operating hours are based on actual outlet working hours:
  * Dine-in outlets (Jayanagar, Sahakarnagar, Residency Road, Koramangala, Electronic City): 14 hrs/day
  * Cloud Kitchens (Rajajinagar, Whitefield, Bellandur, Kalyan Nagar, Indiranagar, Arekere, HSR): 15 hrs/day
- When explaining multi-outlet queries, show breakdown per outlet and total
- When explaining single-outlet queries, show: "${durationPercentageData.details.totalOOSHours} hours out of ${durationPercentageData.details.totalOperatingHours} hours = ${durationPercentageData.percentage}%"
`;
    } else if (isDurationPercentageQuery && (!durationPercentageData || durationPercentageData.error)) {
      stockInfo += `\n=== OUT-OF-STOCK DURATION PERCENTAGE ===
${durationPercentageData?.message || 'To calculate duration percentage, please specify:'}
${!durationPercentageData?.message ? `1. The item name or SKU
2. The outlet/location
3. The time period (e.g., last 3 days, last week)

Example: "What percentage of time was Chicken Biryani out of stock at Rajajinagar in the last 3 days?"` : ''}

IMPORTANT: Calculations are based on ACTUAL OPERATING HOURS, not 24-hour days:
- Dine-in outlets (Jayanagar, Sahakarnagar, Residency Road, Koramangala, Electronic City): 14 hours/day
- Cloud Kitchens (Rajajinagar, Whitefield, Bellandur, Kalyan Nagar, Indiranagar, Arekere, HSR): 15 hours/day
- Any 24 hrs/day outlets are calculated as 15 hours/day

So for 3 days:
- Dine-in: 3 × 14 = 42 operating hours
- Cloud Kitchen: 3 × 15 = 45 operating hours
NOT 3 × 24 = 72 hours!
`;
    }

    // Add all products OOS percentages if requested
    if (allProductsOOSData && allProductsOOSData.success) {
      stockInfo += `\n=== ALL PRODUCTS OUT-OF-STOCK DURATION PERCENTAGES ===
ANALYSIS PERIOD: ${allProductsOOSData.summary.daysAnalyzed} days
OUTLET FILTER: ${allProductsOOSData.summary.outletFilter}

SUMMARY:
- Total Products Analyzed: ${allProductsOOSData.summary.totalProducts}
- Products with Stock-Outs: ${allProductsOOSData.summary.productsWithOOS}
- Average OOS Percentage: ${allProductsOOSData.summary.avgOOSPercentage}%

TOP 20 PRODUCTS BY OUT-OF-STOCK PERCENTAGE (Highest First):
${allProductsOOSData.products.slice(0, 20).map((p, idx) =>
  `${idx + 1}. ${p.productName}
   - OUT OF STOCK: ${p.oosPercentage}% of time
   - Total OOS Hours: ${p.totalOOSHours} hours
   - Total Operating Hours: ${p.totalOperatingHours} hours
   - Outlets Affected: ${p.outletsAffected} (${p.outlets.join(', ')})
   - Stock-Out Events: ${p.eventsCount}`
).join('\n\n')}

${allProductsOOSData.products.length > 20 ? `\n... and ${allProductsOOSData.products.length - 20} more products (showing top 20)` : ''}

INSTRUCTIONS FOR ANSWERING:
- Highlight products with high OOS% (>10%) as critical issues
- Products with 0% had no stock-outs in this period
- Focus on products that are frequently out of stock across multiple outlets
- Recommend addressing high OOS% products immediately to prevent revenue loss
- Products not shown had 0% out-of-stock time
`;
    }

    // Add daily sales analysis if available
    if (dailySalesAnalysis && dailySalesAnalysis.success) {
      stockInfo += `\n=== DAILY SALES ANALYSIS ===
${dailySalesAnalysis.periodSummary.totalDays} days analyzed
- Average daily orders: ${dailySalesAnalysis.periodSummary.avgDailyOrders.toFixed(0)} orders/day
- Average daily revenue: ₹${dailySalesAnalysis.periodSummary.avgDailyRevenue.toFixed(2)}/day
- Total orders: ${dailySalesAnalysis.periodSummary.totalOrders}
- Total revenue: ₹${dailySalesAnalysis.periodSummary.totalRevenue.toFixed(2)}
- Days above average: ${dailySalesAnalysis.periodSummary.daysAboveAverage}
- Days below average: ${dailySalesAnalysis.periodSummary.daysBelowAverage}

TOP 10 DAYS WITH BIGGEST SALES DROPS (Below Average):
${dailySalesAnalysis.daysWithDrops.slice(0, 10).map((day, idx) => {
  const date = new Date(day.date);
  const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long' });
  return `${idx + 1}. ${day.date} (${dayOfWeek})
   - Orders: ${day.totalOrders} (${day.orderDrop > 0 ? '-' : '+'}${Math.abs(day.orderDrop).toFixed(0)} from avg)
   - Revenue: ₹${day.totalRevenue.toFixed(2)} (${day.revenueDrop > 0 ? '-' : '+'}₹${Math.abs(day.revenueDrop).toFixed(2)} from avg)
   - Order drop: ${day.orderDropPercentage.toFixed(1)}% below average
   - Revenue drop: ${day.revenueDropPercentage.toFixed(1)}% below average`;
}).join('\n')}
${dailySalesAnalysis.daysWithDrops.length === 0 ? 'No days had sales below average!' : ''}

DAY OF WEEK PERFORMANCE (Avg orders per day):
${dailySalesAnalysis.dayOfWeekAnalysis.map((day, idx) =>
  `${idx + 1}. ${day.dayOfWeek}: ${day.avgOrders.toFixed(0)} orders/day, ₹${day.avgRevenue.toFixed(2)}/day (${day.totalDays} days sampled)`
).join('\n')}

COMPLETE DAILY BREAKDOWN:
${dailySalesAnalysis.allDailySales.map((day, idx) => {
  const date = new Date(day.date);
  const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'short' });
  const isAboveAvg = day.totalOrders >= dailySalesAnalysis.periodSummary.avgDailyOrders;
  return `${day.date} (${dayOfWeek}): ${day.totalOrders} orders, ₹${day.totalRevenue.toFixed(2)} ${isAboveAvg ? '✓' : '✗ Below avg'}`;
}).join('\n')}

INSTRUCTIONS FOR ANSWERING:
- When asked "which day dropped the most", refer to the TOP DAYS WITH BIGGEST DROPS section above
- Show the specific date, day of week, actual values, and percentage drop
- Compare to the average to explain how much it dropped
- Use the DAY OF WEEK PERFORMANCE to identify patterns (e.g., "Mondays typically have lower sales")
- Reference the COMPLETE DAILY BREAKDOWN for day-by-day analysis
`;
    } else if (isDailySalesDropQuery && dailySalesAnalysis && dailySalesAnalysis.error) {
      stockInfo += `\n=== DAILY SALES ANALYSIS ===
Error: ${dailySalesAnalysis.error}
`;
    }

    // Add inventory optimization recommendations if available
    if (inventoryOptimization && inventoryOptimization.success) {
      stockInfo += `\n=== INVENTORY OPTIMIZATION & DEMAND FORECASTING ===
ANALYSIS PERIOD: ${inventoryOptimization.summary.daysAnalyzed} days of historical data
SERVICE LEVEL TARGET: ${inventoryOptimization.summary.serviceLevel} (reduces stock-out probability)
CURRENT APPROACH: ${inventoryOptimization.summary.currentBufferDays} day buffer (uniform for all products)
RECOMMENDED APPROACH: ${inventoryOptimization.summary.recommendedApproach}

SUMMARY:
- Total Products Analyzed: ${inventoryOptimization.summary.totalProducts}
- High Stock-Out Risk: ${inventoryOptimization.summary.highRiskProducts} products ⚠️
- Medium Stock-Out Risk: ${inventoryOptimization.summary.mediumRiskProducts} products
- Low Stock-Out Risk: ${inventoryOptimization.summary.lowRiskProducts} products ✓
- High Demand Variability: ${inventoryOptimization.summary.highVariabilityProducts} products (need larger buffer)

TOP 20 PRIORITY PRODUCTS (by stock-out risk):
${inventoryOptimization.recommendations.slice(0, 20).map((rec, idx) =>
  `${idx + 1}. ${rec.productName} at ${rec.outlet}
   - Avg Daily Demand: ${rec.avgDailyDemand.toFixed(1)} orders/day
   - Demand Pattern: ${rec.demandPattern} (CV: ${rec.coefficientOfVariation}%)
   - Stock-Out Risk: ${rec.stockOutRisk} ${rec.stockOutRisk === 'High' ? '⚠️' : rec.stockOutRisk === 'Medium' ? '⚡' : '✓'}
   - RECOMMENDED SAFETY STOCK: ${rec.safetyStock} units
   - REORDER POINT: ${rec.reorderPoint} units (order when stock hits this level)
   - DAILY ORDER QUANTITY: ${rec.recommendedOrderQty} units
   - Max Inventory Needed: ${rec.maxInventory} units (to handle peak demand)
   - Max Demand Observed: ${rec.maxDemandObserved} orders in a day`
).join('\n\n')}

METHODOLOGY:
${inventoryOptimization.methodology.description}
- Safety Stock Formula: ${inventoryOptimization.methodology.safetyStockFormula}
- Reorder Point Formula: ${inventoryOptimization.methodology.reorderPointFormula}
- Service Level: ${inventoryOptimization.methodology.serviceLevel}

KEY INSIGHTS:
${inventoryOptimization.methodology.notes.map(note => `- ${note}`).join('\n')}

INSTRUCTIONS FOR ANSWERING:
- Focus on HIGH RISK products first - these need immediate attention
- Explain that products with "Highly Variable" demand need LARGER safety stock than stable products
- Current 0.5 day buffer is TOO SMALL for high-variability products
- REORDER POINT tells when to order more stock (not how much to order)
- RECOMMENDED ORDER QTY tells how much to order each time
- Safety stock varies by product - one-size-fits-all approach causes either stock-outs or waste
- Products with low variability can use smaller buffers, saving on inventory costs
- Use specific numbers from the recommendations when providing advice
`;
    } else if (isInventoryOptimizationQuery && inventoryOptimization && inventoryOptimization.error) {
      stockInfo += `\n=== INVENTORY OPTIMIZATION ===
Error: ${inventoryOptimization.error}
`;
    }

    // Add product trends analysis if available
    if (productTrends && productTrends.success) {
      stockInfo += `\n=== PRODUCT TREND ANALYSIS ===
COMPARISON: ${productTrends.summary.recentPeriod} vs ${productTrends.summary.comparedTo}

SUMMARY:
- Total Products: ${productTrends.summary.totalProducts}
- Growing Products: ${productTrends.summary.growing} (>10% growth)
- Declining Products: ${productTrends.summary.declining} (>10% decline)
- Stable Products: ${productTrends.summary.stable}
- New Products Launched: ${productTrends.summary.newProducts}
- Star Products (High Growth): ${productTrends.summary.stars}

TOP 10 GROWING PRODUCTS:
${productTrends.growing.slice(0, 10).map((p, idx) =>
  `${idx + 1}. ${p.productName}
   - Growth: ${p.orderGrowth > 0 ? '+' : ''}${p.orderGrowth}% orders, ${p.revenueGrowth > 0 ? '+' : ''}${p.revenueGrowth}% revenue
   - Recent Period: ${p.recentOrders} orders, ₹${p.recentRevenue.toFixed(2)}
   - Previous Period: ${p.previousOrders} orders, ₹${p.previousRevenue.toFixed(2)}
   - Trend: ${p.trend} | Lifecycle: ${p.lifecycle}`
).join('\n\n')}

TOP 10 DECLINING PRODUCTS (Need Attention):
${productTrends.declining.slice(0, 10).map((p, idx) =>
  `${idx + 1}. ${p.productName}
   - Decline: ${p.orderGrowth}% orders, ${p.revenueGrowth}% revenue
   - Recent Period: ${p.recentOrders} orders, ₹${p.recentRevenue.toFixed(2)}
   - Previous Period: ${p.previousOrders} orders, ₹${p.previousRevenue.toFixed(2)}
   - Trend: ${p.trend} | Lifecycle: ${p.lifecycle}`
).join('\n\n')}

INSTRUCTIONS FOR ANSWERING:
- Highlight growing products as success stories
- Investigate declining products - check if it's quality issues, stock-outs, or seasonality
- New products need monitoring to see if they gain traction
- Star products (>50% growth) deserve special promotion
- Dying products (<-30% and low volume) should be considered for removal
`;
    }

    // Add outlet comparison if available
    if (outletComparison && outletComparison.success) {
      stockInfo += `\n=== OUTLET PERFORMANCE COMPARISON ===
ANALYSIS PERIOD: ${outletComparison.summary.daysAnalyzed} days

SUMMARY:
- Total Outlets: ${outletComparison.summary.totalOutlets}
- Total Revenue: ₹${outletComparison.summary.totalRevenue.toFixed(2)}
- Total Orders: ${outletComparison.summary.totalOrders}
- Avg Revenue per Outlet: ₹${outletComparison.summary.avgRevenuePerOutlet.toFixed(2)}
- Avg Orders per Outlet: ${outletComparison.summary.avgOrdersPerOutlet.toFixed(2)}

OUTLET RANKINGS BY REVENUE:
${outletComparison.rankings.byRevenue.map((o, idx) =>
  `${idx + 1}. ${o.outlet}
   - Total Revenue: ₹${o.totalRevenue.toFixed(2)} (${((o.totalRevenue / outletComparison.summary.totalRevenue) * 100).toFixed(1)}% of total)
   - Total Orders: ${o.totalOrders}
   - Avg Daily Revenue: ₹${o.avgDailyRevenue.toFixed(2)}
   - Avg Daily Orders: ${o.avgDailyOrders.toFixed(2)}
   - Active Days: ${o.activeDays}`
).join('\n\n')}

OUTLET RANKINGS BY AVERAGE DAILY REVENUE:
${outletComparison.rankings.byAvgDailyRevenue.slice(0, 5).map((o, idx) =>
  `${idx + 1}. ${o.outlet}: ₹${o.avgDailyRevenue.toFixed(2)}/day (${o.avgDailyOrders.toFixed(2)} orders/day)`
).join('\n')}

INSTRUCTIONS FOR ANSWERING:
- Identify top performers and what makes them successful
- Highlight underperforming outlets that need support
- Compare average daily metrics to find efficiency leaders
- Look for outlets with low active days (potential operational issues)
`;
    }

    // Add profitability analysis if available
    if (profitabilityAnalysis && profitabilityAnalysis.success) {
      stockInfo += `\n=== PRODUCT PROFITABILITY & MENU ENGINEERING ===
ANALYSIS PERIOD: ${profitabilityAnalysis.summary.daysAnalyzed} days

SUMMARY:
- Total Products: ${profitabilityAnalysis.summary.totalProducts}
- Total Revenue: ₹${profitabilityAnalysis.summary.totalRevenue.toFixed(2)}
- Total Orders: ${profitabilityAnalysis.summary.totalOrders}
- Avg Revenue per Order: ₹${profitabilityAnalysis.summary.avgRevenuePerOrder.toFixed(2)}
- Pareto Rule (80/20): ${profitabilityAnalysis.summary.paretoProducts} products (${profitabilityAnalysis.summary.paretoPercentage}%) generate 80% of revenue

MENU ENGINEERING CATEGORIES:
- ⭐ Stars (High Value + High Volume): ${profitabilityAnalysis.summary.stars} products
- 💎 Premium (High Value, Low Volume): ${profitabilityAnalysis.summary.premium} products
- 🔧 Workhorses (Low Value, High Volume): ${profitabilityAnalysis.summary.workhorses} products
- 🗑️  Dogs (Consider Removing): ${profitabilityAnalysis.summary.dogs} products

TOP 10 REVENUE GENERATORS (Pareto Products):
${profitabilityAnalysis.products.slice(0, 10).map((p, idx) =>
  `${idx + 1}. ${p.productName}
   - Total Revenue: ₹${p.totalRevenue.toFixed(2)} (${p.percentOfTotalRevenue}% of total)
   - Total Orders: ${p.totalOrders} (${p.percentOfTotalOrders}% of total)
   - Revenue per Order: ₹${p.revenuePerOrder.toFixed(2)}
   - Category: ${p.category}`
).join('\n\n')}

STAR PRODUCTS (High Value + High Volume):
${profitabilityAnalysis.stars.slice(0, 5).map(p =>
  `- ${p.productName}: ₹${p.totalRevenue.toFixed(2)} revenue, ${p.totalOrders} orders, ₹${p.revenuePerOrder.toFixed(2)}/order`
).join('\n')}

PREMIUM PRODUCTS (High Value, Low Volume):
${profitabilityAnalysis.premium.slice(0, 5).map(p =>
  `- ${p.productName}: ₹${p.totalRevenue.toFixed(2)} revenue, ${p.totalOrders} orders, ₹${p.revenuePerOrder.toFixed(2)}/order`
).join('\n')}

DOGS (Consider Removing):
${profitabilityAnalysis.dogs.slice(0, 5).map(p =>
  `- ${p.productName}: ₹${p.totalRevenue.toFixed(2)} revenue, ${p.totalOrders} orders, ₹${p.revenuePerOrder.toFixed(2)}/order`
).join('\n')}

INSTRUCTIONS FOR ANSWERING:
- STARS: Promote heavily, ensure always in stock, high priority
- PREMIUM: Maintain quality, justify premium pricing, target specific customers
- WORKHORSES: Keep on menu for volume, but don't overpromote
- DOGS: Analyze if worth keeping - low value and low volume
- Focus on Pareto products - they drive 80% of revenue
- Revenue per order shows which products have high ticket value
`;
    }

    // Create the prompt for Gemini with few-shot examples and chain-of-thought
    const prompt = `You are an AI assistant for a restaurant analytics dashboard. You help analyze product sales data from Swiggy and Zomato platforms.

CRITICAL RESPONSE GUIDELINES:
- Keep responses COMPACT and INFORMATIVE
- Use bullet points and tables for better readability
- Limit lists to top 5-10 items unless specifically asked for more
- Provide summary statistics first, then details
- Focus on actionable insights, not just data dumps
- When showing stock-out events, GROUP by product and show counts, not every single event

=== CONTEXT ===
Date Range: ${dateRangeInfo}
Filters: ${filterInfo}

Product Data Summary:
- Total Products: ${productData.summary.totalProductsInSheet}
- Total Orders: ${productData.summary.totalOrders}
- Total Revenue: ₹${productData.summary.totalRevenue.toFixed(2)}
- Average Rating: ${productData.summary.avgRating.toFixed(2)}
- High Rated Orders: ${productData.summary.totalHighRated}
- Low Rated Orders: ${productData.summary.totalLowRated}
- Average Low Rated Percentage: ${productData.summary.avgLowRatedPercentage.toFixed(2)}%

Top 20 Products by Sales:
${topProducts.map((p, idx) => `${idx + 1}. ${p.name} - Orders: ${p.totalOrders}, Revenue: ₹${(p.totalRevenue || 0).toFixed(2)}, Avg Rating: ${p.avgRating.toFixed(2)}, Low Rated: ${p.lowRatedPercentage.toFixed(1)}%`).join('\n')}

Top 10 High-Rated Products (4.0+):
${highRatedProducts.map((p, idx) => `${idx + 1}. ${p.name} - Orders: ${p.totalOrders}, Avg Rating: ${p.avgRating.toFixed(2)}`).join('\n')}

Top 10 Problematic Products (>5% low ratings):
${lowRatedProducts.length > 0 ? lowRatedProducts.map((p, idx) => `${idx + 1}. ${p.name} - Low Rated: ${p.lowRatedPercentage.toFixed(1)}%, Total Orders: ${p.totalOrders}`).join('\n') : 'No products with >5% low ratings'}
${stockInfo}

${conversationContext ? `Previous Conversation:\n${conversationContext}\n` : ''}

=== EXAMPLES OF GOOD RESPONSES ===

Example 1 - Best Sellers Query:
User: "What are the best selling products?"
Response: In ${dateRangeInfo.toLowerCase()}, your best selling products are:

1. ${topProducts[0]?.name || 'N/A'} - Leading with ${topProducts[0]?.totalOrders || 0} orders and a ${topProducts[0]?.avgRating.toFixed(1) || 'N/A'} star rating
2. ${topProducts[1]?.name || 'N/A'} - ${topProducts[1]?.totalOrders || 0} orders with ${topProducts[1]?.avgRating.toFixed(1) || 'N/A'} stars
3. ${topProducts[2]?.name || 'N/A'} - ${topProducts[2]?.totalOrders || 0} orders, rated ${topProducts[2]?.avgRating.toFixed(1) || 'N/A'} stars

These three products account for ${((topProducts[0]?.totalOrders || 0) + (topProducts[1]?.totalOrders || 0) + (topProducts[2]?.totalOrders || 0))} orders total.

Example 2 - Problem Detection:
User: "Any problems with our products?"
Response: ${lowRatedProducts.length > 0 ? `Yes, I've identified ${lowRatedProducts.length} products with concerning feedback in ${dateRangeInfo.toLowerCase()}:

MOST CONCERNING:
- ${lowRatedProducts[0]?.name} has ${lowRatedProducts[0]?.lowRatedPercentage.toFixed(1)}% low ratings (${lowRatedProducts[0]?.lowRated} out of ${lowRatedProducts[0]?.totalOrders} orders). This is significantly above average and needs immediate attention.

${lowRatedProducts.length > 1 ? `ALSO WATCH:
- ${lowRatedProducts[1]?.name}: ${lowRatedProducts[1]?.lowRatedPercentage.toFixed(1)}% low rated
${lowRatedProducts.length > 2 ? `- ${lowRatedProducts[2]?.name}: ${lowRatedProducts[2]?.lowRatedPercentage.toFixed(1)}% low rated` : ''}` : ''}

I recommend reviewing customer feedback for these items to identify quality or consistency issues.` : `Good news! No significant problems detected in ${dateRangeInfo.toLowerCase()}. All products are performing within acceptable ranges with low complaint rates.`}

Example 3 - Quality + Sales:
User: "What sold well with good ratings?"
Response: Your top performers combining high sales with excellent ratings in ${dateRangeInfo.toLowerCase()}:

${highRatedProducts.slice(0, 3).map((p, idx) => `${idx + 1}. ${p.name}
   - ${p.totalOrders} orders (strong demand)
   - ${p.avgRating.toFixed(1)} star rating (customer satisfaction)
   - ${p.lowRatedPercentage.toFixed(1)}% complaint rate (low)`).join('\n\n')}

These items are your proven winners - they're both popular with customers and consistently well-received.

Example 4 - Outlet-Specific Query:
User: "How is Koramangala doing?"
Response: Here's the performance for Koramangala outlet in ${dateRangeInfo.toLowerCase()}:

TOP SELLERS AT KORAMANGALA:
1. Chocolate Fudge Brownie - 156 orders, 4.6 stars
2. Vanilla Bean Ice Cream - 134 orders, 4.5 stars
3. Strawberry Cheesecake - 98 orders, 4.3 stars

Total orders from Koramangala: 843
Average rating: 4.4 stars

The outlet is performing well with strong customer satisfaction. Your dessert items are particularly popular here.

Example 5 - Date-Specific Query:
User: "What sold best last week?"
Response: In the last 7 days, your top performing products were:

1. Red Velvet Cake - 89 orders (up 23% from previous week)
2. Mango Ice Cream - 76 orders (seasonal favorite)
3. Dark Chocolate Truffle - 64 orders (consistently strong)

Total orders last week: 634
Compared to the week before: +12% growth

The increase was primarily driven by seasonal items and your cake offerings.

Example 6 - Channel-Specific Query:
User: "How are we doing on Swiggy?"
Response: Your Swiggy performance in ${dateRangeInfo.toLowerCase()}:

TOP SWIGGY PRODUCTS:
1. Ice Cream Tub (2kg) - 234 orders, 4.7 stars
2. Brownie Pack - 187 orders, 4.5 stars
3. Cheesecake Slice - 165 orders, 4.6 stars

Swiggy total orders: 1,245
Average rating: 4.5 stars
Low rated percentage: 3.2% (excellent)

Swiggy performance is strong. Bulk items like ice cream tubs are performing particularly well on this platform.

Example 7 - Stock-Aware Analysis:
User: "Why did Chocolate Brownie sales drop?"
Response: Looking at Chocolate Brownie in ${dateRangeInfo.toLowerCase()}:

SALES PERFORMANCE:
- 45 orders (below average for this product)
- 4.3 star rating (good quality)

STOCK AVAILABILITY ISSUE DETECTED:
- 3 out-of-stock events across 2 outlets (Koramangala, HSR Layout)
- Stock unavailable on multiple days during this period

ANALYSIS:
The sales drop is NOT due to quality issues (4.3 stars is solid). The main factor is stock availability - the product was out of stock at key outlets, preventing customers from ordering it.

RECOMMENDATION:
Improve inventory management for Chocolate Brownie. The demand is there (good ratings), but stock constraints are limiting sales. This represents lost revenue opportunity.

Example 8 - Growth Validation with Stock Data:
User: "Red Velvet Cake sales grew 25%. Is our production keeping up?"
Response: Excellent news about Red Velvet Cake's 25% growth in ${dateRangeInfo.toLowerCase()}!

STOCK AVAILABILITY CHECK:
✓ No out-of-stock events detected during this period
✓ Product was consistently available across all outlets

ANALYSIS:
YES, your production is keeping pace with demand. The 25% growth is real demand growth, not recovery from stock issues. The consistent availability means you're meeting customer demand effectively.

This is healthy, sustainable growth driven by product popularity, not just resolving supply problems.

=== YOUR TASK ===
User Question: ${userMessage}

STEP 1 - UNDERSTAND THE QUESTION:
Think about what specific information the user is asking for. Are they asking about:
- Sales performance (volume, rankings)?
- Revenue metrics (total revenue, net sales)?
- Quality metrics (ratings, complaints)?
- Specific products or categories?
- Specific outlets/branches (Koramangala, HSR, Indiranagar, etc.)?
- Specific channels (Swiggy, Zomato, Dine In)?
- Specific time periods (last week, last 7 days, specific dates)?
- Problems or opportunities?
- Comparisons between products/outlets/time periods?
- Stock availability or out-of-stock issues?
- Why sales or revenue increased or decreased (consider stock availability)?

STEP 2 - FIND RELEVANT DATA:
Identify which products from the data above are most relevant to answer this question.
- Use the EXACT product names from the lists provided
- Note if they're asking about a specific outlet, channel, or time period
- If filtered data applies, reference the filter in your response
- CHECK THE STOCK AVAILABILITY ANALYSIS section if provided
- Correlate sales patterns with stock events when relevant

STEP 3 - PROVIDE A CLEAR, SPECIFIC ANSWER:
- IMPORTANT: The data you see is ALREADY FILTERED by the filters shown above
- Start your response by acknowledging the specific outlet/channel/date if filtered
- Use actual product names from the filtered data (never say "Product 1" or generic references)
- Include specific numbers (orders, ratings, percentages, revenue amounts)
- When discussing revenue, always use the ₹ symbol and format numbers properly
- Analyze both sales volume AND revenue together (a product may have low orders but high revenue due to pricing)
- If identifying problems, explain WHY they're problems with numbers
- If showing successes, explain what makes them successful
- CRITICAL: If stock availability data shows out-of-stock events, ALWAYS mention this when analyzing sales/revenue deprecation
- When sales/revenue are down + stock issues present = explain it's likely a supply problem, NOT demand/quality problem
- When sales/revenue are up + no stock issues = confirm production is keeping pace with demand
- NEVER say "I don't have outlet-specific data" - the data IS outlet-specific if an outlet filter is shown
- Keep it conversational but data-driven
- Use plain text only (no markdown like ** or __)
- Format with line breaks and bullets for readability

Now provide your response following the same pattern as the examples above:

Response:`;

    // Call AI with automatic failover (Gemini → Groq)
    const aiMessage = await callAIWithFailover(prompt, {
      temperature: 0.7,
      maxOutputTokens: 2048
    });

    // Extract structured data if the query is about specific products
    let structuredData = null;
    const lowerMessage = userMessage.toLowerCase();

    if (lowerMessage.includes('best') || lowerMessage.includes('top')) {
      structuredData = {
        topProducts: topProducts.slice(0, 5).map(p => ({
          name: p.name,
          orders: p.totalOrders,
          rating: p.avgRating,
          lowRatedPercentage: p.lowRatedPercentage
        }))
      };
    } else if (lowerMessage.includes('worst') || lowerMessage.includes('low rating') || lowerMessage.includes('problem')) {
      structuredData = {
        problematicProducts: lowRatedProducts.slice(0, 5).map(p => ({
          name: p.name,
          orders: p.totalOrders,
          rating: p.avgRating,
          lowRatedPercentage: p.lowRatedPercentage
        }))
      };
    }

    // Include stock correlation if available and relevant to the query
    if (stockCorrelation && (
      lowerMessage.includes('stock') ||
      lowerMessage.includes('out of stock') ||
      lowerMessage.includes('deprecat') ||
      lowerMessage.includes('drop') ||
      lowerMessage.includes('decreas') ||
      lowerMessage.includes('growth') ||
      lowerMessage.includes('increas')
    )) {
      structuredData = structuredData || {};
      structuredData.stockAnalysis = {
        hasStockIssues: stockCorrelation.hasStockIssues,
        affectedProducts: stockCorrelation.affectedProducts,
        summary: stockCorrelation.summary
      };
    }

    return {
      message: aiMessage,
      structuredData: structuredData,
      stockCorrelation: stockCorrelation // Include for frontend use
    };

  } catch (error) {
    // Log the full error response from axios if available for better debugging
    if (error.response) {
       console.error('Gemini API Error:', error.response.status, error.response.data);
    } else {
       console.error('Error calling Gemini API for chatbot:', error.message);
    }

    // Fallback response
    return {
      message: `I encountered an error processing your question. Here's what I can tell you:\n\n` +
               `Total Products: ${productData.summary.totalProductsInSheet}\n` +
               `Total Orders: ${productData.summary.totalOrders}\n` +
               `Average Rating: ${productData.summary.avgRating.toFixed(2)}\n\n` +
               `Please try rephrasing your question or ask about specific metrics.`,
      structuredData: null
    };
  }
}

// Helper function to generate comparison chatbot responses
async function generateComparisonChatbotResponse(userMessage, productData1, productData2, dateQuery, conversationHistory = [], filters = {}) {
  if (GEMINI_API_KEYS.length === 0 && groqClients.length === 0) {
    return {
      message: "AI service is not configured. Add GEMINI_API_KEY or GROQ_API_KEY to .env file.",
      structuredData: null
    };
  }

  try {
    // Prepare conversation context
    const conversationContext = conversationHistory
      .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
      .join('\n');

    // Calculate changes between periods
    const orderChange = productData1.summary.totalOrders - productData2.summary.totalOrders;
    const orderChangePercent = productData2.summary.totalOrders > 0
      ? ((orderChange / productData2.summary.totalOrders) * 100).toFixed(1)
      : 0;

    const ratingChange = productData1.summary.avgRating - productData2.summary.avgRating;

    // Find products that appear in both periods for comparison
    const product1Map = new Map(productData1.products.map(p => [p.name, p]));
    const product2Map = new Map(productData2.products.map(p => [p.name, p]));

    const comparableProducts = [];
    productData1.products.forEach(p1 => {
      const p2 = product2Map.get(p1.name);
      if (p2) {
        const orderDiff = p1.totalOrders - p2.totalOrders;
        const orderDiffPercent = p2.totalOrders > 0 ? ((orderDiff / p2.totalOrders) * 100).toFixed(1) : 0;
        comparableProducts.push({
          name: p1.name,
          period1Orders: p1.totalOrders,
          period2Orders: p2.totalOrders,
          orderChange: orderDiff,
          orderChangePercent: orderDiffPercent,
          period1Rating: p1.avgRating,
          period2Rating: p2.avgRating,
          ratingChange: (p1.avgRating - p2.avgRating).toFixed(2)
        });
      }
    });

    // Sort by absolute order change
    comparableProducts.sort((a, b) => Math.abs(b.orderChange) - Math.abs(a.orderChange));

    const topGainers = comparableProducts.filter(p => p.orderChange > 0).slice(0, 10);
    const topDecliners = comparableProducts.filter(p => p.orderChange < 0).slice(0, 10);

    // Build filter description
    const filterParts = [];
    if (filters.branch) filterParts.push(`Outlet: ${filters.branch}`);
    if (filters.channel) filterParts.push(`Channel: ${filters.channel}`);
    const filterInfo = filterParts.length > 0 ? filterParts.join(', ') : 'All outlets and channels';

    // NEW: Get stock correlation data for both periods
    const stockCorrelation1 = await correlateSalesWithStock(productData1, dateQuery.period1.label, filters);
    const stockCorrelation2 = await correlateSalesWithStock(productData2, dateQuery.period2.label, filters);

    // Prepare stock comparison info
    let stockComparisonInfo = '';
    if (stockCorrelation1 || stockCorrelation2) {
      stockComparisonInfo = `\n=== STOCK AVAILABILITY COMPARISON ===\n`;

      if (stockCorrelation1 && stockCorrelation1.hasStockIssues) {
        stockComparisonInfo += `\nPeriod 1 (${dateQuery.period1.label}) - STOCK ISSUES DETECTED:\n`;
        stockComparisonInfo += `${stockCorrelation1.summary}\n`;
        stockComparisonInfo += `Affected Products:\n`;
        stockComparisonInfo += stockCorrelation1.affectedProducts.slice(0, 5).map(p =>
          `- ${p.name}: ${p.stockEvents} out-of-stock event(s) in ${p.outletCount} outlet(s)`
        ).join('\n');
      } else {
        stockComparisonInfo += `\nPeriod 1 (${dateQuery.period1.label}): ✓ No significant stock issues\n`;
      }

      if (stockCorrelation2 && stockCorrelation2.hasStockIssues) {
        stockComparisonInfo += `\n\nPeriod 2 (${dateQuery.period2.label}) - STOCK ISSUES DETECTED:\n`;
        stockComparisonInfo += `${stockCorrelation2.summary}\n`;
        stockComparisonInfo += `Affected Products:\n`;
        stockComparisonInfo += stockCorrelation2.affectedProducts.slice(0, 5).map(p =>
          `- ${p.name}: ${p.stockEvents} out-of-stock event(s) in ${p.outletCount} outlet(s)`
        ).join('\n');
      } else {
        stockComparisonInfo += `\nPeriod 2 (${dateQuery.period2.label}): ✓ No significant stock issues\n`;
      }

      stockComparisonInfo += `\n\nCRITICAL: When analyzing sales changes, consider stock availability:
- If Period 1 had stock issues and Period 2 didn't: Lower sales in Period 1 may be due to supply constraints
- If Period 2 had stock issues and Period 1 didn't: Lower sales in Period 2 may be due to supply constraints
- Products with stock issues should NOT be flagged as "declining in popularity" - they had supply problems
`;
    }

    // Create the prompt for Gemini with few-shot examples and chain-of-thought
    const prompt = `You are an AI assistant for a restaurant analytics dashboard. You help analyze and compare product sales data from Swiggy and Zomato platforms across different time periods.

=== COMPARISON CONTEXT ===
Comparing: ${dateQuery.period1.label} vs ${dateQuery.period2.label}
Filters: ${filterInfo}

Period 1 (${dateQuery.period1.label}):
- Total Products: ${productData1.summary.totalProductsInSheet}
- Total Orders: ${productData1.summary.totalOrders}
- Total Revenue: ₹${productData1.summary.totalRevenue.toFixed(2)}
- Average Rating: ${productData1.summary.avgRating.toFixed(2)}
- Low Rated Orders: ${productData1.summary.totalLowRated} (${productData1.summary.avgLowRatedPercentage.toFixed(2)}%)

Period 2 (${dateQuery.period2.label}):
- Total Products: ${productData2.summary.totalProductsInSheet}
- Total Orders: ${productData2.summary.totalOrders}
- Total Revenue: ₹${productData2.summary.totalRevenue.toFixed(2)}
- Average Rating: ${productData2.summary.avgRating.toFixed(2)}
- Low Rated Orders: ${productData2.summary.totalLowRated} (${productData2.summary.avgLowRatedPercentage.toFixed(2)}%)

Overall Change:
- Orders: ${orderChange >= 0 ? '+' : ''}${orderChange} (${orderChangePercent >= 0 ? '+' : ''}${orderChangePercent}%)
- Revenue: ${(productData1.summary.totalRevenue - productData2.summary.totalRevenue) >= 0 ? '+' : ''}₹${(productData1.summary.totalRevenue - productData2.summary.totalRevenue).toFixed(2)} (${productData2.summary.totalRevenue > 0 ? ((((productData1.summary.totalRevenue - productData2.summary.totalRevenue) / productData2.summary.totalRevenue) * 100).toFixed(1)) : '0'}%)
- Average Rating: ${ratingChange >= 0 ? '+' : ''}${ratingChange.toFixed(2)}

Top 10 Products with Increased Sales:
${topGainers.length > 0 ? topGainers.map((p, idx) => `${idx + 1}. ${p.name}
   ${dateQuery.period1.label}: ${p.period1Orders} orders (Rating: ${p.period1Rating.toFixed(2)})
   ${dateQuery.period2.label}: ${p.period2Orders} orders (Rating: ${p.period2Rating.toFixed(2)})
   Change: +${p.orderChange} orders (+${p.orderChangePercent}%)`).join('\n') : 'No products with increased sales'}

Top 10 Products with Decreased Sales:
${topDecliners.length > 0 ? topDecliners.map((p, idx) => `${idx + 1}. ${p.name}
   ${dateQuery.period1.label}: ${p.period1Orders} orders (Rating: ${p.period1Rating.toFixed(2)})
   ${dateQuery.period2.label}: ${p.period2Orders} orders (Rating: ${p.period2Rating.toFixed(2)})
   Change: ${p.orderChange} orders (${p.orderChangePercent}%)`).join('\n') : 'No products with decreased sales'}
${stockComparisonInfo}

${conversationContext ? `Previous Conversation:\n${conversationContext}\n` : ''}

=== EXAMPLES OF GOOD COMPARISON RESPONSES ===

Example 1 - Sales Trend Comparison:
User: "How did sales change between these periods?"
Response: Comparing ${dateQuery.period1.label} to ${dateQuery.period2.label}, your overall sales ${orderChange >= 0 ? 'increased' : 'decreased'} by ${Math.abs(orderChange)} orders (${orderChangePercent >= 0 ? '+' : ''}${orderChangePercent}%).

BIGGEST WINNERS:
${topGainers.slice(0, 3).map((p, idx) => `${idx + 1}. ${p.name} surged from ${p.period2Orders} to ${p.period1Orders} orders (+${p.orderChangePercent}%)
   This represents an additional ${p.orderChange} orders - a strong performance gain.`).join('\n\n')}

${topDecliners.length > 0 ? `NOTABLE DECLINES:
${topDecliners.slice(0, 2).map((p, idx) => `${idx + 1}. ${p.name} dropped from ${p.period2Orders} to ${p.period1Orders} orders (${p.orderChangePercent}%)
   Lost ${Math.abs(p.orderChange)} orders - worth investigating why.`).join('\n\n')}` : ''}

${orderChange >= 0 ? 'The growth is primarily driven by the top gainers listed above.' : 'Focus on understanding what caused the declines in your previously strong products.'}

Example 2 - Change Drivers Analysis:
User: "What's driving the change?"
Response: Analyzing the shift from ${dateQuery.period2.label} to ${dateQuery.period1.label}, here's what's driving the changes:

KEY DRIVERS:
${orderChange >= 0 ? `
GROWTH FACTORS:
- ${topGainers[0]?.name} alone contributed +${topGainers[0]?.orderChange} orders (${topGainers[0]?.orderChangePercent}% increase)
- Rating ${topGainers[0]?.period1Rating > topGainers[0]?.period2Rating ? 'improved' : 'remained stable'} from ${topGainers[0]?.period2Rating.toFixed(1)} to ${topGainers[0]?.period1Rating.toFixed(1)} stars
${topGainers.length > 1 ? `- ${topGainers[1]?.name} added +${topGainers[1]?.orderChange} orders (up ${topGainers[1]?.orderChangePercent}%)` : ''}

Your top gainers maintained or improved quality while increasing volume - that's sustainable growth.` : `
DECLINE FACTORS:
- ${topDecliners[0]?.name} lost ${Math.abs(topDecliners[0]?.orderChange)} orders (${topDecliners[0]?.orderChangePercent}% drop)
- Rating ${topDecliners[0]?.period1Rating < topDecliners[0]?.period2Rating ? 'decreased' : 'stayed similar'}: ${topDecliners[0]?.period2Rating.toFixed(1)} to ${topDecliners[0]?.period1Rating.toFixed(1)} stars
${topDecliners.length > 1 ? `- ${topDecliners[1]?.name} down ${Math.abs(topDecliners[1]?.orderChange)} orders (${topDecliners[1]?.orderChangePercent}%)` : ''}

${topDecliners[0]?.period1Rating < topDecliners[0]?.period2Rating ? 'Quality issues may be contributing to reduced demand.' : 'Demand dropped despite stable quality - possibly due to competition or menu fatigue.'}`}

OVERALL QUALITY TREND:
Average rating ${ratingChange >= 0 ? 'improved' : 'declined'} by ${Math.abs(ratingChange).toFixed(2)} stars - ${ratingChange >= 0 ? 'customer satisfaction is trending up' : 'customer satisfaction needs attention'}.

Example 3 - Concern Assessment:
User: "Should I be concerned?"
Response: ${orderChange < -50 || (orderChangePercent < -10 && Math.abs(orderChange) > 20) ? `YES, there are concerning trends from ${dateQuery.period2.label} to ${dateQuery.period1.label}:

RED FLAGS:
- Overall orders down ${Math.abs(orderChange)} (${orderChangePercent}%) - this is a significant decline
${topDecliners.slice(0, 2).map(p => `- ${p.name}: Lost ${Math.abs(p.orderChange)} orders (${p.orderChangePercent}%) ${p.period1Rating < p.period2Rating ? `AND rating dropped from ${p.period2Rating.toFixed(1)} to ${p.period1Rating.toFixed(1)} stars` : ''}`).join('\n')}

IMMEDIATE ACTIONS NEEDED:
1. Review customer feedback for ${topDecliners[0]?.name} to identify quality issues
2. Assess if menu positioning or pricing changed for declining products
3. Check if ingredients or preparation methods were modified
${ratingChange < -0.2 ? '4. Overall rating decline suggests systemic quality concerns - conduct quality audit across all products' : ''}` : orderChange > 50 || (orderChangePercent > 10 && orderChange > 20) ? `GOOD NEWS - strong positive trends from ${dateQuery.period2.label} to ${dateQuery.period1.label}:

POSITIVE SIGNALS:
- Overall orders up ${orderChange} (${orderChangePercent}%) - excellent growth
${topGainers.slice(0, 2).map(p => `- ${p.name}: Gained ${p.orderChange} orders (+${p.orderChangePercent}%) ${p.period1Rating > p.period2Rating ? `WITH rating improvement from ${p.period2Rating.toFixed(1)} to ${p.period1Rating.toFixed(1)} stars` : ''}`).join('\n')}

${topDecliners.length > 0 && Math.abs(topDecliners[0].orderChange) > 20 ? `MINOR CONCERNS:
- ${topDecliners[0]?.name} lost ${Math.abs(topDecliners[0]?.orderChange)} orders (${topDecliners[0]?.orderChangePercent}%)
- Worth investigating but doesn't offset overall positive trend` : 'No significant concerns - growth is broad-based'}

RECOMMENDATIONS:
1. Maintain consistency on your top gainers - they're driving success
2. Consider promoting ${topGainers[0]?.name} more heavily given strong performance
${ratingChange > 0.2 ? '3. Quality improvements are paying off - maintain current standards' : ''}` : `STABLE PERFORMANCE from ${dateQuery.period2.label} to ${dateQuery.period1.label}:

ASSESSMENT:
- Minimal change in overall orders (${orderChangePercent}%) - relatively stable
- Average rating ${ratingChange >= 0 ? 'slightly improved' : 'slightly declined'} by ${Math.abs(ratingChange).toFixed(2)} stars
${topGainers.length > 0 && topDecliners.length > 0 ? `- Some products up, others down - normal variation` : ''}

No major concerns, but opportunities for improvement:
1. ${topGainers.length > 0 ? `Leverage success of ${topGainers[0]?.name} (+${topGainers[0]?.orderChangePercent}%) to drive more growth` : 'Consider promotional strategies to boost overall volume'}
2. ${topDecliners.length > 0 ? `Address declining trend of ${topDecliners[0]?.name} (${topDecliners[0]?.orderChangePercent}%)` : 'Maintain current quality standards'}
3. Stable is good, but look for growth opportunities`}

=== YOUR TASK ===
User Question: ${userMessage}

STEP 1 - ANALYZE THE COMPARISON:
Think about what changed between the two periods:
- Is overall performance improving or declining?
- Which specific products are driving changes?
- Are there quality trends (rating changes)?
- What's the magnitude of changes (small fluctuations vs significant shifts)?

STEP 2 - IDENTIFY KEY INSIGHTS:
What are the most important takeaways from this comparison?
- Use EXACT product names from the data
- Look at both volume (orders) and quality (ratings)
- Consider percentage changes AND absolute numbers

STEP 3 - PROVIDE ACTIONABLE RESPONSE:
- Start with the overall trend
- Highlight specific products by name with their actual numbers
- Explain WHY changes matter (not just WHAT changed)
- Provide concrete recommendations if asked
- Use plain text only (no markdown)
- Be direct and honest about concerns

Now provide your comparison analysis following the pattern above:

Response:`;

    // Call AI with automatic failover (Gemini → Groq)
    const aiMessage = await callAIWithFailover(prompt, {
      temperature: 0.7,
      maxOutputTokens: 2048
    });

    // Create structured comparison data
    const structuredData = {
      comparison: {
        period1: {
          label: dateQuery.period1.label,
          totalOrders: productData1.summary.totalOrders,
          avgRating: productData1.summary.avgRating
        },
        period2: {
          label: dateQuery.period2.label,
          totalOrders: productData2.summary.totalOrders,
          avgRating: productData2.summary.avgRating
        },
        changes: {
          orderChange: orderChange,
          orderChangePercent: parseFloat(orderChangePercent),
          ratingChange: parseFloat(ratingChange.toFixed(2))
        }
      },
      topGainers: topGainers.slice(0, 5),
      topDecliners: topDecliners.slice(0, 5)
    };

    return {
      message: aiMessage,
      structuredData: structuredData
    };

  } catch (error) {
    if (error.response) {
      console.error('Gemini API Error:', error.response.status, error.response.data);
    } else {
      console.error('Error calling Gemini API for comparison:', error.message);
    }

    return {
      message: `I encountered an error processing your comparison question. Here's a basic summary:\n\n` +
               `${dateQuery.period1.label}: ${productData1.summary.totalOrders} orders, Avg Rating: ${productData1.summary.avgRating.toFixed(2)}\n` +
               `${dateQuery.period2.label}: ${productData2.summary.totalOrders} orders, Avg Rating: ${productData2.summary.avgRating.toFixed(2)}\n\n` +
               `Please try rephrasing your question.`,
      structuredData: null
    };
  }
}

// === CHANNEL-WISE COMPARISON CHATBOT ===

async function generateChannelWiseComparisonResponse(userMessage, channelData, dateQuery, conversationHistory = [], filters = {}) {
  if (GEMINI_API_KEYS.length === 0 && groqClients.length === 0) {
    return {
      message: "AI service is not configured. Add GEMINI_API_KEY or GROQ_API_KEY to .env file.",
      structuredData: null
    };
  }

  try {
    // Build filter description
    const filterParts = [];
    if (filters.branch) filterParts.push(`Outlet: ${filters.branch}`);
    const filterInfo = filterParts.length > 0 ? filterParts.join(', ') : 'All outlets';

    // Build channel-wise comparison data for the prompt
    let channelSummaries = '';
    const channels = ['Swiggy', 'Zomato', 'Dine-in', 'Ownly', 'Magicpin'];

    for (const channel of channels) {
      const data = channelData[channel];
      if (!data || !data.period1 || !data.period2) continue;

      const period1 = data.period1;
      const period2 = data.period2;

      // Calculate top gainers for this channel
      const product1Map = new Map(period1.products.map(p => [p.name, p]));
      const product2Map = new Map(period2.products.map(p => [p.name, p]));

      const comparableProducts = [];
      period1.products.forEach(p1 => {
        const p2 = product2Map.get(p1.name);
        if (p2) {
          const orderDiff = p1.totalOrders - p2.totalOrders;
          const orderDiffPercent = p2.totalOrders > 0 ? ((orderDiff / p2.totalOrders) * 100).toFixed(1) : 0;
          comparableProducts.push({
            name: p1.name,
            period1Orders: p1.totalOrders,
            period2Orders: p2.totalOrders,
            orderChange: orderDiff,
            orderChangePercent: orderDiffPercent,
            period1Rating: p1.avgRating,
            period2Rating: p2.avgRating
          });
        }
      });

      // Sort by order change
      comparableProducts.sort((a, b) => b.orderChange - a.orderChange);
      const topGrowth = comparableProducts.filter(p => p.orderChange > 0).slice(0, 5);

      const orderChange = period1.summary.totalOrders - period2.summary.totalOrders;
      const orderChangePercent = period2.summary.totalOrders > 0
        ? ((orderChange / period2.summary.totalOrders) * 100).toFixed(1)
        : 0;

      channelSummaries += `\n=== ${channel.toUpperCase()} ===
${dateQuery.period1.label}: ${period1.summary.totalOrders} orders, Avg Rating: ${period1.summary.avgRating.toFixed(2)}
${dateQuery.period2.label}: ${period2.summary.totalOrders} orders, Avg Rating: ${period2.summary.avgRating.toFixed(2)}
Change: ${orderChange >= 0 ? '+' : ''}${orderChange} orders (${orderChangePercent >= 0 ? '+' : ''}${orderChangePercent}%)

Top 5 Growing Products on ${channel}:
${topGrowth.length > 0 ? topGrowth.map((p, idx) => `${idx + 1}. ${p.name}
   ${dateQuery.period1.label}: ${p.period1Orders} orders (Rating: ${p.period1Rating.toFixed(2)})
   ${dateQuery.period2.label}: ${p.period2Orders} orders (Rating: ${p.period2Rating.toFixed(2)})
   Growth: +${p.orderChange} orders (+${p.orderChangePercent}%)`).join('\n') : 'No products with increased sales'}

`;
    }

    // Prepare conversation context
    const conversationContext = conversationHistory
      .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
      .join('\n');

    // Create the prompt
    const prompt = `You are an AI assistant for a restaurant analytics dashboard. You help analyze product sales data across different channels (Swiggy, Zomato, Dine-in, Ownly, Magicpin).

=== CHANNEL-WISE COMPARISON CONTEXT ===
Comparing: ${dateQuery.period1.label} vs ${dateQuery.period2.label}
Filters: ${filterInfo}

${channelSummaries}

${conversationContext ? `Previous Conversation:\n${conversationContext}\n` : ''}

=== YOUR TASK ===
User Question: ${userMessage}

INSTRUCTIONS:
1. The user wants to see a CHANNEL-BY-CHANNEL breakdown
2. For EACH channel (Swiggy, Zomato, Dine-in, Ownly, Magicpin), show:
   - The top growing products with specific numbers
   - Growth percentages and absolute changes
   - Ratings for context
3. Use EXACT product names from the data above
4. Include specific numbers (orders, percentages, ratings)
5. Use plain text only (no markdown like ** or __)
6. Format clearly with channel headers
7. Skip channels with no data or no growth

Provide your channel-wise analysis in a clear, structured format:

Response:`;

    // Call AI with automatic failover
    const aiMessage = await callAIWithFailover(prompt, {
      temperature: 0.7,
      maxOutputTokens: 3072  // Increased for channel-wise breakdown
    });

    return {
      message: aiMessage,
      structuredData: { channelData }
    };

  } catch (error) {
    console.error('Error in channel-wise comparison:', error.message);
    return {
      message: `I encountered an error processing your channel-wise comparison. Please try rephrasing your question.`,
      structuredData: null
    };
  }
}

// === TICKET MANAGEMENT ENDPOINTS ===

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



// Transform function for ticket data - UPDATED WITH TYPE COLUMN
function transformTicketDataWithAutoAssignment(rawTickets) {
  if (!rawTickets || rawTickets.length <= 1) return [];
  
  const headers = rawTickets[0];
  const dataRows = rawTickets.slice(1);
  
  return dataRows.map((row, index) => {
    const safeRow = Array.isArray(row) ? row : [];
    
    // UPDATED: Read only from Category column (K) since subcategory is now stored there
    const categoryValue = getCellValue(safeRow, 10) || ''; // Column K - Category (contains subcategory if present)
    
    // UPDATED: Determine ticket type directly from the category value stored by bot
    let ticketType = TICKET_TYPES.OTHERS;
    let displayType = categoryValue;
    let mainCategory = '';
    let subcategory = '';
    
    // Map based on what the bot actually stores in the Category column
    if (categoryValue === 'Repair and Maintenance') {
      ticketType = TICKET_TYPES.REPAIR_MAINTENANCE;
      mainCategory = 'Repair and Maintenance';
      displayType = 'Repair and Maintenance';
    } else if (categoryValue === 'Difficulty in Order') {
      ticketType = TICKET_TYPES.DIFFICULTY_IN_ORDER;
      mainCategory = 'Difficulty in Order';
      displayType = 'Difficulty in Order';
    } else if (categoryValue === 'Stock Items') {
      // Bot stores "Stock Items" for "Place an Order - Stock Items"
      ticketType = TICKET_TYPES.STOCK_ITEMS;
      mainCategory = 'Place an Order';
      subcategory = 'Stock Items';
      displayType = 'Stock Items';
    } else if (categoryValue === 'Housekeeping') {
      // Bot stores "Housekeeping" for "Place an Order - Housekeeping"
      ticketType = TICKET_TYPES.HOUSEKEEPING;
      mainCategory = 'Place an Order';
      subcategory = 'Housekeeping';
      displayType = 'Housekeeping';
    } else if (categoryValue === 'Others') {
      // Bot stores "Others" for "Place an Order - Others"
      ticketType = TICKET_TYPES.OTHERS;
      mainCategory = 'Place an Order';
      subcategory = 'Others';
      displayType = 'Others';
    } else if (categoryValue === 'Place an Order') {
      // Fallback case if bot stored main category without subcategory
      ticketType = TICKET_TYPES.OTHERS;
      mainCategory = 'Place an Order';
      displayType = 'Place an Order';
    } else {
      // Unknown category
      ticketType = TICKET_TYPES.OTHERS;
      mainCategory = categoryValue;
      displayType = categoryValue;
    }
    
    const issueDescription = getCellValue(safeRow, 4) || '';
    const currentAssignedTo = getCellValue(safeRow, 8) || '';
    
    // Auto-assign if not already assigned
    const autoAssignee = currentAssignedTo || getAutoAssignee(ticketType, issueDescription);
    
    return {
      ticketId: getCellValue(safeRow, 0) || `TKT-${index + 1}`,
      date: formatDate(getCellValue(safeRow, 1)),
      outlet: getCellValue(safeRow, 2) || 'Unknown Outlet',
      submittedBy: getCellValue(safeRow, 3) || 'Unknown User',
      issueDescription: issueDescription,
      imageLink: getCellValue(safeRow, 5) || '',
      imageHash: getCellValue(safeRow, 6) || '',
      status: getCellValue(safeRow, 7) || 'Open',
      assignedTo: autoAssignee,
      actionTaken: getCellValue(safeRow, 9) || '',
      type: ticketType, // Normalized type for frontend
      displayType: displayType, // Display name (subcategory if present, else main category)
      category: mainCategory, // Main category (reconstructed)
      subcategory: subcategory, // Subcategory (if applicable)
      storedCategory: categoryValue, // What's actually stored in the sheet
      autoAssigned: !currentAssignedTo,
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

// Auto-assignment function
function getAutoAssignee(ticketType, issueDescription = '') {
  // First try explicit type matching
  if (AUTO_ASSIGNMENT_RULES[ticketType] && AUTO_ASSIGNMENT_RULES[ticketType].length > 0) {
    const assignees = AUTO_ASSIGNMENT_RULES[ticketType];
    if (assignees.length === 1) {
      return assignees[0];
    } else if (assignees.length > 1) {
      // Random selection for multiple assignees (like Stock Items -> Nishat/Ajay)
      return assignees[Math.floor(Math.random() * assignees.length)];
    }
  }

  // If type is not recognized or has no assignees, try keyword classification
  const description = issueDescription.toLowerCase();
  
  for (const [type, keywords] of Object.entries(TYPE_CLASSIFICATION_KEYWORDS)) {
    if (type === TICKET_TYPES.OTHERS || type === TICKET_TYPES.DIFFICULTY_IN_ORDER) continue;
    
    if (keywords.some(keyword => description.includes(keyword))) {
      const assignees = AUTO_ASSIGNMENT_RULES[type];
      if (assignees && assignees.length > 0) {
        return assignees.length === 1 ? assignees[0] : assignees[Math.floor(Math.random() * assignees.length)];
      }
    }
  }

  // Default fallback to Kim (Others category)
  return AUTO_ASSIGNMENT_RULES[TICKET_TYPES.OTHERS][0];
}

// Fetch tickets from Google Sheets Tickets tab
app.get('/api/ticket-data', async (req, res) => {
  try {
    console.log('Fetching ticket data...');

    if (!sheets) {
      const initialized = await initializeGoogleServices();
      if (!initialized) {
        throw new Error('Failed to initialize Google APIs');
      }
    }

    const TICKET_SPREADSHEET_ID = '1FYXr8Wz0ddN3mFi-0AQbI6J_noi2glPbJLh44CEMUnE';
    const TICKET_TAB = 'Tickets';

    console.log(`Fetching ${TICKET_TAB} from ${TICKET_SPREADSHEET_ID}...`);
    const ticketsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: TICKET_SPREADSHEET_ID,
      range: `${TICKET_TAB}!A:K`, // Extended to include Type column (K)
    });

    const ticketsData = ticketsResponse.data.values || [];
    console.log(`Found ${ticketsData.length} ticket rows`);

    const tickets = transformTicketDataWithAutoAssignment(ticketsData);
    console.log(`Processed ${tickets.length} tickets`);

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
    console.error('Error fetching ticket data:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

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

    console.log(`Assigning ticket ${ticketId} to ${assignedTo}`);

    if (!sheets) {
      const initialized = await initializeGoogleServices();
      if (!initialized) {
        throw new Error('Failed to initialize Google APIs');
      }
    }

    const TICKET_SPREADSHEET_ID = '1FYXr8Wz0ddN3mFi-0AQbI6J_noi2glPbJLh44CEMUnE';
    const TICKET_TAB = 'Tickets';

    // Get all ticket data to find the row
    const ticketsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: TICKET_SPREADSHEET_ID,
      range: `${TICKET_TAB}!A:K`, // Extended to include Type column
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

    console.log(`Successfully updated ticket ${ticketId}`);
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
    console.error('Error assigning ticket:', error.message);
    console.error('Full error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.data || 'No additional details',
      timestamp: new Date().toISOString()
    });
  }
});

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

    console.log(`Updating ticket ${ticketId} status to ${status} with action: ${actionTaken || 'none'}`);

    if (!sheets) {
      const initialized = await initializeGoogleServices();
      if (!initialized) {
        throw new Error('Failed to initialize Google APIs');
      }
    }

    const TICKET_SPREADSHEET_ID = '1FYXr8Wz0ddN3mFi-0AQbI6J_noi2glPbJLh44CEMUnE';
    const TICKET_TAB = 'Tickets';

    // Get all ticket data to find the row
    const ticketsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: TICKET_SPREADSHEET_ID,
      range: `${TICKET_TAB}!A:K`, // Extended to include Type column
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

    console.log(`Successfully updated ticket ${ticketId}`);
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
    console.error('Error updating ticket status:', error.message);
    console.error('Full error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.data || 'No additional details',
      timestamp: new Date().toISOString()
    });
  }
});

// Debug tickets endpoint - UPDATED WITH TYPE COLUMN
app.get('/api/debug-tickets', async (req, res) => {
  try {
    if (!sheets) {
      await initializeGoogleServices();
    }

    const TICKET_SPREADSHEET_ID = '1FYXr8Wz0ddN3mFi-0AQbI6J_noi2glPbJLh44CEMUnE';
    const TICKET_TAB = 'Tickets';

    console.log(`Debug: Checking ticket data from ${TICKET_SPREADSHEET_ID}`);
    
    const ticketsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: TICKET_SPREADSHEET_ID,
      range: `${TICKET_TAB}!A:K`, // Extended to include Type column
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
        'Status (H)', 'Assigned To (I)', 'Action Taken (J)', 'Type (K)' // Updated with Type column
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
        'J': 'Action Taken',
        'K': 'Type' // NEW: Type column
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Debug tickets error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      spreadsheetId: '1FYXr8Wz0ddN3mFi-0AQbI6J_noi2glPbJLh44CEMUnE',
      tab: 'Tickets'
    });
  }
});

// Add these new endpoints after the existing ticket endpoints:

// Enhanced ticket assignment with Telegram notification
app.post('/api/assign-ticket-with-notification', async (req, res) => {
  try {
    const { ticketId, assignedTo } = req.body;
    
    if (!ticketId || !assignedTo) {
      return res.status(400).json({
        success: false,
        error: 'Missing ticketId or assignedTo in request body'
      });
    }

    console.log(`Assigning ticket ${ticketId} to ${assignedTo} with Telegram notification`);

    if (!sheets) {
      const initialized = await initializeGoogleServices();
      if (!initialized) {
        throw new Error('Failed to initialize Google APIs');
      }
    }

    const TICKET_SPREADSHEET_ID = '1FYXr8Wz0ddN3mFi-0AQbI6J_noi2glPbJLh44CEMUnE';
    const TICKET_TAB = 'Tickets';

    // Get ticket details first
    const ticketsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: TICKET_SPREADSHEET_ID,
      range: `${TICKET_TAB}!A:K`,
    });

    const ticketsData = ticketsResponse.data.values || [];
    let targetRow = -1;
    let ticketDetails = null;

    for (let i = 1; i < ticketsData.length; i++) {
      if (ticketsData[i] && ticketsData[i][0] === ticketId) {
        targetRow = i + 1;
        ticketDetails = {
          ticketId: ticketsData[i][0],
          date: ticketsData[i][1],
          outlet: ticketsData[i][2],
          submittedBy: ticketsData[i][3],
          issueDescription: ticketsData[i][4],
          imageLink: ticketsData[i][5],
          type: ticketsData[i][10] || 'General'
        };
        break;
      }
    }

    if (targetRow === -1 || !ticketDetails) {
      return res.status(404).json({
        success: false,
        error: `Ticket ${ticketId} not found`
      });
    }

    // Update ticket in Google Sheets
    const batchUpdateResponse = await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: TICKET_SPREADSHEET_ID,
      resource: {
        data: [
          {
            range: `${TICKET_TAB}!H${targetRow}`, // Status column
            values: [['In Progress']]
          },
          {
            range: `${TICKET_TAB}!I${targetRow}`, // Assigned To column
            values: [[assignedTo]]
          }
        ],
        valueInputOption: 'RAW'
      }
    });

    let notificationSent = false;

    // Send Telegram notification to assignee
    if (ticketBot) {
      const assigneeChatId = await getUserChatId(assignedTo);
      
      if (assigneeChatId) {
        const message = `🎫 NEW TICKET ASSIGNED TO YOU

📋 Ticket ID: ${ticketDetails.ticketId}
🏪 Outlet: ${ticketDetails.outlet}
📅 Date: ${ticketDetails.date}
👤 Reported by: ${ticketDetails.submittedBy}
🏷️ Type: ${ticketDetails.type}

📝 Issue Description:
${ticketDetails.issueDescription}

⚡ Please investigate and resolve this issue. Update the status in the dashboard when completed.`;

        const keyboard = {
          inline_keyboard: [
            [
              {
                text: '✅ Acknowledge',
                callback_data: `ack_ticket_${ticketId}_${assigneeChatId}`
              },
              {
                text: '🔗 Open Dashboard',
                url: process.env.FRONTEND_URL || 'https://restaurant-dashboard-1-tlsa.onrender.com'
              }
            ]
          ]
        };

        try {
          await ticketBot.sendMessage(assigneeChatId, message, {
            reply_markup: keyboard,
            parse_mode: 'HTML'
          });
          
          notificationSent = true;
          console.log(`Telegram notification sent to ${assignedTo} (${assigneeChatId})`);
        } catch (telegramError) {
          console.error(`Failed to send Telegram notification: ${telegramError.message}`);
        }
      } else {
        console.warn(`No Telegram Chat ID found for ${assignedTo}`);
      }
    }

    res.json({
      success: true,
      ticketId,
      assignedTo,
      status: 'In Progress',
      updatedRow: targetRow,
      notificationSent,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error assigning ticket with notification:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Enhanced status update with notification to ticket creator
app.post('/api/update-ticket-status-with-notification', async (req, res) => {
  try {
    const { ticketId, status, actionTaken } = req.body;
    
    if (!ticketId || !status) {
      return res.status(400).json({
        success: false,
        error: 'Missing ticketId or status in request body'
      });
    }

    console.log(`Updating ticket ${ticketId} status to ${status} with notification`);

    if (!sheets) {
      const initialized = await initializeGoogleServices();
      if (!initialized) {
        throw new Error('Failed to initialize Google APIs');
      }
    }

    const TICKET_SPREADSHEET_ID = '1FYXr8Wz0ddN3mFi-0AQbI6J_noi2glPbJLh44CEMUnE';
    const TICKET_TAB = 'Tickets';

    // Get ticket details
    const ticketsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: TICKET_SPREADSHEET_ID,
      range: `${TICKET_TAB}!A:K`,
    });

    const ticketsData = ticketsResponse.data.values || [];
    let targetRow = -1;
    let ticketDetails = null;

    for (let i = 1; i < ticketsData.length; i++) {
      if (ticketsData[i] && ticketsData[i][0] === ticketId) {
        targetRow = i + 1;
        ticketDetails = {
          ticketId: ticketsData[i][0],
          date: ticketsData[i][1],
          outlet: ticketsData[i][2],
          submittedBy: ticketsData[i][3],
          issueDescription: ticketsData[i][4],
          assignedTo: ticketsData[i][8],
          type: ticketsData[i][10] || 'General'
        };
        break;
      }
    }

    if (targetRow === -1 || !ticketDetails) {
      return res.status(404).json({
        success: false,
        error: `Ticket ${ticketId} not found`
      });
    }

    // Update ticket status
    const updateData = [
      {
        range: `${TICKET_TAB}!H${targetRow}`, // Status column
        values: [[status]]
      }
    ];

    if (actionTaken !== undefined) {
      updateData.push({
        range: `${TICKET_TAB}!J${targetRow}`, // Action Taken column
        values: [[actionTaken]]
      });
    }

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: TICKET_SPREADSHEET_ID,
      resource: {
        data: updateData,
        valueInputOption: 'RAW'
      }
    });

    let notificationSent = false;

    // Send notification to ticket creator when resolved
    if (status === 'Resolved' && ticketBot) {
      const creatorChatId = await getUserChatId(ticketDetails.submittedBy);
      
      if (creatorChatId) {
        const message = `✅ TICKET RESOLVED - PLEASE REVIEW

📋 Ticket ID: ${ticketDetails.ticketId}
🏪 Outlet: ${ticketDetails.outlet}
👨‍🔧 Resolved by: ${ticketDetails.assignedTo}

📝 Original Issue:
${ticketDetails.issueDescription}

🔧 Action Taken:
${actionTaken || 'No action description provided'}

Please review the resolution and approve if the issue is fixed.`;

        const keyboard = {
          inline_keyboard: [
            [
              {
                text: '✅ Approve & Close',
                callback_data: `approve_ticket_${ticketId}_${creatorChatId}`
              },
              {
                text: '❌ Reject',
                callback_data: `reject_ticket_${ticketId}_${creatorChatId}`
              }
            ],

          ]
        };

        try {
          await ticketBot.sendMessage(creatorChatId, message, {
            reply_markup: keyboard,
            parse_mode: 'HTML'
          });
          
          notificationSent = true;
          console.log(`Resolution notification sent to ${ticketDetails.submittedBy} (${creatorChatId})`);
        } catch (telegramError) {
          console.error(`Failed to send resolution notification: ${telegramError.message}`);
        }
      }
    }

    res.json({
      success: true,
      ticketId,
      status,
      actionTaken: actionTaken || '',
      updatedRow: targetRow,
      notificationSent,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error updating ticket status with notification:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// API endpoint to register user Telegram mapping
app.post('/api/register-telegram-user', async (req, res) => {
  try {
    const { employeeName, chatId, username } = req.body;
    
    if (!employeeName || !chatId) {
      return res.status(400).json({
        success: false,
        error: 'Employee name and chat ID are required'
      });
    }

    await initializeUserMappingTab();
    
    // Check if user already exists
    const existingResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: CHECKLIST_SPREADSHEET_ID,
      range: `${USER_MAPPING_TAB}!A:C`
    });

    const rows = existingResponse.data.values || [];
    let userExists = false;
    let targetRow = -1;

    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] && rows[i][0].toLowerCase().trim() === employeeName.toLowerCase().trim()) {
        userExists = true;
        targetRow = i + 1;
        break;
      }
    }

    if (userExists) {
      // Update existing user
      await sheets.spreadsheets.values.update({
        spreadsheetId: CHECKLIST_SPREADSHEET_ID,
        range: `${USER_MAPPING_TAB}!B${targetRow}:C${targetRow}`,
        valueInputOption: 'RAW',
        resource: {
          values: [[chatId, username || '']]
        }
      });
    } else {
      // Add new user
      await sheets.spreadsheets.values.append({
        spreadsheetId: CHECKLIST_SPREADSHEET_ID,
        range: `${USER_MAPPING_TAB}!A:C`,
        valueInputOption: 'RAW',
        resource: {
          values: [[employeeName, chatId, username || '']]
        }
      });
    }

    res.json({
      success: true,
      message: userExists ? 'User mapping updated' : 'User mapping created',
      employeeName,
      chatId,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error registering Telegram user:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// API endpoint to get all user mappings
app.get('/api/telegram-user-mappings', async (req, res) => {
  try {
    await initializeUserMappingTab();
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: CHECKLIST_SPREADSHEET_ID,
      range: `${USER_MAPPING_TAB}!A:C`
    });

    const rows = response.data.values || [];
    const mappings = [];

    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0]) {
        mappings.push({
          employeeName: rows[i][0],
          chatId: rows[i][1] || '',
          username: rows[i][2] || ''
        });
      }
    }

    res.json({
      success: true,
      mappings,
      count: mappings.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching user mappings:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Add this enhanced debug endpoint to your server.js

app.post('/api/debug-assignment', async (req, res) => {
  try {
    const { assignedTo } = req.body;
    
    console.log(`🔍 DEBUGGING ASSIGNMENT FOR: "${assignedTo}"`);
    
    // Check bot status
    const botStatus = {
      originalBot: !!bot,
      ticketBot: !!ticketBot,
      coToken: !!CO_BOT_TOKEN,
      telegramEnabled: ENABLE_TELEGRAM_BOT
    };
    
    console.log('Bot Status:', botStatus);
    
    // Test getUserChatId function directly
    let chatIdResult = null;
    let getUserError = null;
    
    try {
      chatIdResult = await getUserChatId(assignedTo);
      console.log(`getUserChatId result: ${chatIdResult}`);
    } catch (error) {
      getUserError = error.message;
      console.error('getUserChatId error:', error);
    }
    
    // Test direct Google Sheets access
    let directSheetsResult = null;
    let sheetsError = null;
    
    try {
      await initializeUserMappingTab();
      
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: CHECKLIST_SPREADSHEET_ID,
        range: `${USER_MAPPING_TAB}!A:C`
      });

      const rows = response.data.values || [];
      directSheetsResult = {
        totalRows: rows.length,
        headers: rows[0] || [],
        dataRows: rows.slice(1).map(row => ({
          name: row[0] || '',
          chatId: row[1] || '',
          username: row[2] || '',
          matchesSearch: row[0] && row[0].toLowerCase().trim() === assignedTo.toLowerCase().trim()
        }))
      };
    } catch (error) {
      sheetsError = error.message;
      console.error('Direct sheets access error:', error);
    }
    
    res.json({
      success: true,
      debugInfo: {
        searchName: assignedTo,
        botStatus,
        getUserChatId: {
          result: chatIdResult,
          error: getUserError
        },
        directSheetsAccess: {
          result: directSheetsResult,
          error: sheetsError
        },
        environment: {
          checklistSpreadsheetId: CHECKLIST_SPREADSHEET_ID,
          userMappingTab: USER_MAPPING_TAB,
          coTokenSet: !!CO_BOT_TOKEN,
          telegramEnabled: ENABLE_TELEGRAM_BOT
        }
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Debug assignment error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// === RISTAAPPS JWT CREATION ===
// === RISTAAPPS JWT CREATION (CORRECTED) ===
function createRistaJWT(secretKey, apiKey, expiresInHours = 6) {
  const crypto = require('crypto');
  
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };

  const now = Math.floor(Date.now() / 1000);
  const expires = now + (expiresInHours * 60 * 60);

  // CRITICAL FIX: Use 'iss' (issuer) instead of 'apiKey'
  // This matches the Google Apps Script implementation
  const payload = {
    iss: apiKey,  // ← Changed from apiKey: apiKey
    iat: now,
    exp: expires,
    jti: 'server-' + Date.now()
  };

  const base64UrlEncode = (obj) => {
    return Buffer.from(JSON.stringify(obj))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  };

  const encodedHeader = base64UrlEncode(header);
  const encodedPayload = base64UrlEncode(payload);
  const toSign = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto
    .createHmac('sha256', secretKey)
    .update(toSign)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  const token = `${toSign}.${signature}`;
  
  console.log('JWT Token created:', {
    header: header,
    payload: payload,
    tokenLength: token.length
  });

  return token;
}
// === TELEGRAM BROADCAST ENDPOINTS ===

// Send broadcast message
app.post('/api/send-broadcast', async (req, res) => {
  try {
    if (!bot) {
      return res.status(503).json({
        success: false,
        error: 'Telegram bot is not available. Please check bot configuration.'
      });
    }

    const { message, image, imageName, recipients } = req.body;
    
    // Validate that either message or image is provided
    if (!message && !image) {
      return res.status(400).json({
        success: false,
        error: 'Either message or image is required'
      });
    }

    if (!recipients || recipients.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Recipients are required'
      });
    }

    console.log(`Sending broadcast to ${recipients.length} recipients`);
    
    // Log what type of content we're sending
    if (image && message) {
      console.log('📸 Sending IMAGE with CAPTION');
    } else if (image) {
      console.log('📸 Sending IMAGE ONLY');
    } else {
      console.log('💬 Sending TEXT ONLY');
    }
    
    // Initialize Google Services
    if (!sheets) {
      const initialized = await initializeGoogleServices();
      if (!initialized) {
        throw new Error('Failed to initialize Google APIs');
      }
    }

    await initializeBroadcastTab();

    const broadcastId = `BROADCAST-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = new Date().toISOString();
    
    const results = [];
    let successCount = 0;
    
    for (let i = 0; i < recipients.length; i++) {
      const recipient = recipients[i];
      
      try {
        console.log(`\n--- Sending to ${recipient.user} (${recipient.chatId}) ---`);
        
        const keyboard = {
          inline_keyboard: [[
            {
              text: 'Understood',
              callback_data: `ack_${broadcastId}_${recipient.chatId}`
            }
          ]]
        };
        
        if (image) {
          // DETAILED IMAGE LOGGING
          console.log('🔍 Processing image data...');
          console.log('Original image data length:', image ? image.length : 'null');
          console.log('Image starts with:', image ? image.substring(0, 50) : 'null');
          console.log('Image name:', imageName || 'no name provided');
          
          // Check if image data format is correct
          if (!image.startsWith('data:image/')) {
            throw new Error(`Invalid image format. Expected data:image/... but got: ${image.substring(0, 30)}`);
          }
          
          // Extract base64 data with better regex
          const base64Match = image.match(/^data:image\/([^;]+);base64,(.+)$/);
          if (!base64Match) {
            throw new Error(`Could not extract base64 data from image. Format: ${image.substring(0, 100)}`);
          }
          
          const imageType = base64Match[1];
          const base64Data = base64Match[2];
          
          console.log('Image type detected:', imageType);
          console.log('Base64 data length:', base64Data.length);
          console.log('Base64 data starts with:', base64Data.substring(0, 30));
          
          // Create buffer
          let imageBuffer;
          try {
            imageBuffer = Buffer.from(base64Data, 'base64');
            console.log('✅ Buffer created successfully, size:', imageBuffer.length, 'bytes');
            
            if (imageBuffer.length === 0) {
              throw new Error('Image buffer is empty');
            }
            
            if (imageBuffer.length > 20 * 1024 * 1024) {
              throw new Error(`Image too large: ${(imageBuffer.length / 1024 / 1024).toFixed(2)}MB (max 20MB)`);
            }
            
          } catch (bufferError) {
            console.error('❌ Buffer creation failed:', bufferError.message);
            throw new Error(`Failed to create image buffer: ${bufferError.message}`);
          }
          
          // Send photo with detailed logging
          console.log('📤 Sending photo to Telegram...');
          try {
            await bot.sendPhoto(recipient.chatId, imageBuffer, {
              caption: message || undefined,
              reply_markup: keyboard,
              parse_mode: 'HTML'
            });
            console.log('✅ Photo sent successfully!');
          } catch (telegramError) {
            console.error('❌ Telegram API error:', telegramError.message);
            console.error('Error details:', {
              description: telegramError.description,
              error_code: telegramError.error_code,
              parameters: telegramError.parameters
            });
            throw new Error(`Telegram API error: ${telegramError.message}`);
          }
          
        } else {
          // Handle text-only sending
          console.log('📤 Sending text message...');
          try {
            await bot.sendMessage(recipient.chatId, message, {
              reply_markup: keyboard,
              parse_mode: 'HTML'
            });
            console.log('✅ Text message sent successfully!');
          } catch (telegramError) {
            console.error('❌ Telegram text error:', telegramError.message);
            throw telegramError;
          }
        }
        
        results.push({
          user: recipient.user,
          chatId: recipient.chatId,
          success: true
        });
        successCount++;
        console.log(`✅ SUCCESS for ${recipient.user}`);
        
        // Log to Google Sheets
        try {
          await sheets.spreadsheets.values.append({
            spreadsheetId: BROADCAST_SPREADSHEET_ID,
            range: `${BROADCAST_TAB}!A:H`,
            valueInputOption: 'RAW',
            resource: {
              values: [[
                broadcastId,
                message || '[Image]',
                timestamp,
                recipient.user,
                recipient.chatId.toString(),
                'Sent',
                '',
                image ? imageName || 'image' : ''
              ]]
            }
          });
          console.log('📊 Logged to Google Sheets successfully');
        } catch (sheetError) {
          console.error(`⚠️ Warning: Failed to log to sheets for ${recipient.user}:`, sheetError.message);
        }
        
        // Rate limiting
        if (i < recipients.length - 1) {
          console.log('⏳ Waiting 100ms before next send...');
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
      } catch (error) {
        console.error(`\n❌ FAILED to send to ${recipient.user}:`);
        console.error('Error type:', error.constructor.name);
        console.error('Error message:', error.message);
        console.error('Full error:', error);
        
        results.push({
          user: recipient.user,
          chatId: recipient.chatId,
          success: false,
          error: error.message
        });
      }
    }
    
    console.log(`\n🎯 Broadcast complete: ${successCount}/${recipients.length} sent`);
    
    res.json({
      success: true,
      broadcastId,
      recipients: successCount,
      totalRecipients: recipients.length,
      results,
      timestamp,
      hasImage: !!image
    });
    
  } catch (error) {
    console.error('\n💥 BROADCAST ERROR:');
    console.error('Error type:', error.constructor.name);
    console.error('Error message:', error.message);
    console.error('Stack trace:', error.stack);
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
// Get broadcast history
app.get('/api/broadcast-history', async (req, res) => {
  try {
    console.log('Fetching broadcast history');
    
    if (!sheets) {
      const initialized = await initializeGoogleServices();
      if (!initialized) {
        throw new Error('Failed to initialize Google APIs');
      }
    }

    await initializeBroadcastTab();

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: BROADCAST_SPREADSHEET_ID,
      range: `${BROADCAST_TAB}!A:G`
    });

    const rows = response.data.values || [];
    
    if (rows.length <= 1) {
      return res.json({
        success: true,
        broadcasts: []
      });
    }

    const broadcastMap = new Map();
    
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row[0]) continue;
      
      const broadcastId = row[0];
      const message = row[1] || '';
      const timestamp = row[2] || '';
      const user = row[3] || '';
      const chatId = row[4] || '';
      const status = row[5] || 'Pending';
      const acknowledgedAt = row[6] || null;
      
      if (!broadcastMap.has(broadcastId)) {
        broadcastMap.set(broadcastId, {
          id: broadcastId,
          message,
          timestamp,
          recipients: [],
          totalRecipients: 0,
          acknowledgedCount: 0
        });
      }
      
      const broadcast = broadcastMap.get(broadcastId);
      broadcast.recipients.push({
        user,
        chatId,
        status,
        acknowledgedAt
      });
      broadcast.totalRecipients++;
      
      if (status === 'Acknowledged') {
        broadcast.acknowledgedCount++;
      }
    }
    
    const broadcasts = Array.from(broadcastMap.values()).sort((a, b) => 
      new Date(b.timestamp) - new Date(a.timestamp)
    );
    
    console.log(`Found ${broadcasts.length} broadcasts`);
    
    res.json({
      success: true,
      broadcasts
    });
    
  } catch (error) {
    console.error('Error fetching broadcast history:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
app.get('/api/bot-status', async (req, res) => {
  const botTests = {};
  
  // Test original bot
  if (bot) {
    try {
      const me = await bot.getMe();
      botTests.originalBot = { status: 'Connected', username: me.username };
    } catch (error) {
      botTests.originalBot = { status: 'Error', error: error.message };
    }
  } else {
    botTests.originalBot = { status: 'Not Initialized' };
  }
  
  // Test ticket bot  
  if (ticketBot) {
    try {
      const me = await ticketBot.getMe();
      botTests.ticketBot = { status: 'Connected', username: me.username };
    } catch (error) {
      botTests.ticketBot = { status: 'Error', error: error.message };
    }
  } else {
    botTests.ticketBot = { status: 'Not Initialized' };
  }
  
  // ADD THIS: Test critical stock bot
  if (criticalStockBot) {
    try {
      const me = await criticalStockBot.getMe();
      botTests.criticalStockBot = { status: 'Connected', username: me.username };
    } catch (error) {
      botTests.criticalStockBot = { status: 'Error', error: error.message };
    }
  } else {
    botTests.criticalStockBot = { status: 'Not Initialized' };
  }
  
  res.json({
    success: true,
    bots: botTests,
    environment: {
      telegramToken: !!TELEGRAM_BOT_TOKEN,
      coToken: !!CO_BOT_TOKEN,
      criticalStockToken: !!CRITICAL_STOCK_BOT_TOKEN, // Also add this
      telegramEnabled: ENABLE_TELEGRAM_BOT
    }
  });
});

// === TEST ENDPOINT FOR WEEKLY OOS EMAIL ===
app.post('/api/test-weekly-oos-email', async (req, res) => {
  try {
    console.log('🧪 Manual test of weekly OOS email triggered');

    // Check if email is configured
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
      return res.status(400).json({
        success: false,
        error: 'Email not configured. Please set EMAIL_USER and EMAIL_PASSWORD in .env file'
      });
    }

    // Send the report
    await sendWeeklyOOSReport();

    res.json({
      success: true,
      message: 'Weekly OOS report sent successfully. Check the console for details.',
      recipients: process.env.EMAIL_TO
    });
  } catch (error) {
    console.error('Error in test email:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/stock-data', async (req, res) => {
  try {
    const outlet = req.query.outlet;
    console.log(`Stock data requested for outlet: ${outlet || 'all'}`);

    if (!sheets) {
      const initialized = await initializeGoogleServices();
      if (!initialized) {
        throw new Error('Failed to initialize Google Sheets');
      }
    }

    const STOCK_SPREADSHEET_ID = '12kfAZX7gV0UszUHhTI9i9iy8OObJ0Uc_8fJC18O1ILg';
    
    // List of outlet names (tabs)
    const outlets = [
      'Sahakarnagar', 'Residency Road', 'Whitefield', 'Koramangala', 
      'Kalyan Nagar', 'Bellandur', 'Indiranagar', 'Arekere', 
      'Jayanagar', 'HSR Layout', 'Electronic City', 'Rajajinagar'
    ];

    if (outlet) {
      // Fetch data for specific outlet
      if (!outlets.includes(outlet)) {
        return res.status(400).json({
          success: false,
          error: `Invalid outlet. Must be one of: ${outlets.join(', ')}`
        });
      }

      console.log(`Fetching data for outlet: ${outlet}`);
      
      // First, fetch the MasterSheet to get valid skuCodes
      console.log('Fetching MasterSheet for reference...');
      const masterResponse = await sheets.spreadsheets.values.get({
        spreadsheetId: STOCK_SPREADSHEET_ID,
        range: `MasterSheet!A:B`, // Columns A (skuCode) and B (longName)
      });

      const masterData = masterResponse.data.values || [];
      console.log(`Found ${masterData.length} rows in MasterSheet`);

      // Create a Map of valid skuCodes from MasterSheet
      const masterItems = new Map();
      for (let i = 1; i < masterData.length; i++) { // Skip header row
        const row = masterData[i];
        if (row && row[0] && row[1]) { // Check if skuCode and longName exist
          masterItems.set(row[0].toString().trim(), {
            skuCode: row[0].toString().trim(),
            longName: row[1].toString().trim()
          });
        }
      }

      console.log(`Processed ${masterItems.size} master items for reference`);

      // Now fetch the outlet data
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: STOCK_SPREADSHEET_ID,
        range: `${outlet}!A:C`, // Columns A (skuCode), B (shortName), C (longName)
      });

      const rawData = response.data.values || [];
      
      if (rawData.length === 0) {
        return res.json({
          success: true,
          outlet: outlet,
          items: [],
          message: 'No data found for this outlet',
          masterItemsCount: masterItems.size
        });
      }

      // Process outlet data and filter against MasterSheet
      const items = [];
      let filteredCount = 0;
      
      for (let i = 1; i < rawData.length; i++) {
        const row = rawData[i];
        if (row && row[0]) { // Check if skuCode exists
          const skuCode = row[0].toString().trim();
          
          // Only include if skuCode exists in MasterSheet
          if (masterItems.has(skuCode)) {
            const masterItem = masterItems.get(skuCode);
            items.push({
              skuCode: skuCode,
              longName: masterItem.longName, // Use longName from MasterSheet for consistency
              shortName: row[1] ? row[1].toString().trim() : '' // Keep shortName from outlet
            });
          } else {
            filteredCount++;
            console.log(`Filtered out item with skuCode: ${skuCode} (not in MasterSheet)`);
          }
        }
      }

      console.log(`Processed ${items.length} items for ${outlet} (filtered out ${filteredCount} items not in MasterSheet)`);

      res.json({
        success: true,
        outlet: outlet,
        items: items,
        count: items.length,
        totalItemsInOutlet: rawData.length - 1, // Exclude header
        filteredOutCount: filteredCount,
        masterItemsCount: masterItems.size,
        timestamp: new Date().toISOString()
      });

    } else {
      // Return list of available outlets
      res.json({
        success: true,
        outlets: outlets,
        message: 'Available outlets. Use ?outlet=OutletName to get specific data',
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    console.error('Error fetching stock data:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.data || 'No additional details'
    });
  }
});

// Debug stock endpoint
app.get('/api/debug-stock', async (req, res) => {
  try {
    if (!sheets) {
      await initializeGoogleServices();
    }

    const STOCK_SPREADSHEET_ID = '12kfAZX7gV0UszUHhTI9i9iy8OObJ0Uc_8fJC18O1ILg';

    console.log(`Debug: Checking stock spreadsheet ${STOCK_SPREADSHEET_ID}`);

    // Fetch both Tracker and Live Inventory sheets
    const [trackerData, liveInventoryData] = await Promise.all([
      sheets.spreadsheets.values.get({
        spreadsheetId: STOCK_SPREADSHEET_ID,
        range: 'Tracker!A1:E20',
      }).catch(e => ({ data: { values: null }, error: e.message })),

      sheets.spreadsheets.values.get({
        spreadsheetId: STOCK_SPREADSHEET_ID,
        range: 'Live Inventory!A1:G20',
      }).catch(e => ({ data: { values: null }, error: e.message }))
    ]);

    res.json({
      success: true,
      spreadsheetId: STOCK_SPREADSHEET_ID,
      sheets: {
        tracker: {
          headers: trackerData.data.values?.[0] || null,
          sample: trackerData.data.values?.slice(1, 6) || null,
          error: trackerData.error || null
        },
        liveInventory: {
          headers: liveInventoryData.data.values?.[0] || null,
          sample: liveInventoryData.data.values?.slice(1, 6) || null,
          error: liveInventoryData.error || null
        }
      },
      note: "Tracker shows stock-out events. Live Inventory shows current status with last stock out/in dates.",
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error debugging stock data:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      spreadsheetId: '12kfAZX7gV0UszUHhTI9i9iy8OObJ0Uc_8fJC18O1ILg'
    });
  }
});

app.get('/api/debug-stock-connection', (req, res) => {
  console.log('🔧 Debug stock connection endpoint hit');
  
  res.json({
    success: true,
    message: 'Stock API connection test successful',
    timestamp: new Date().toISOString(),
    serverStatus: 'Running',
    stockEndpointStatus: 'Available',
    testUrls: {
      outlets: `${req.protocol}://${req.get('host')}/api/stock-data`,
      sampleOutlet: `${req.protocol}://${req.get('host')}/api/stock-data?outlet=Sahakarnagar`
    }
  });
});

// Stock Tracker data endpoint - GET tracker data with filtering
app.get('/api/stock-tracker-data', async (req, res) => {
  try {
    const { outlet, startDate, endDate } = req.query;
    console.log(`Stock tracker data requested - Outlet: ${outlet || 'all'}, Date range: ${startDate || 'any'} to ${endDate || 'any'}`);

    if (!sheets) {
      const initialized = await initializeGoogleServices();
      if (!initialized) {
        throw new Error('Failed to initialize Google Sheets');
      }
    }

    const STOCK_SPREADSHEET_ID = '12kfAZX7gV0UszUHhTI9i9iy8OObJ0Uc_8fJC18O1ILg';
    const TRACKER_TAB = 'Tracker';
    
    console.log(`Fetching tracker data from: ${STOCK_SPREADSHEET_ID}, Tab: ${TRACKER_TAB}`);
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: STOCK_SPREADSHEET_ID,
      range: `${TRACKER_TAB}!A:D`, // Columns A to D to include all data
    });

    const rawData = response.data.values || [];
    
    if (rawData.length <= 1) {
      return res.json({
        success: true,
        trackerData: [],
        message: 'No tracker data found',
        filters: { outlet, startDate, endDate }
      });
    }

    // Process tracker data (skip header row)
    const trackerData = [];
    for (let i = 1; i < rawData.length; i++) {
      const row = rawData[i];
      if (row && row[1] && row[2] && row[3]) { // Check if Time, Outlet, Items exist
        const entryTime = row[1].toString().trim();
        const entryOutlet = row[2].toString().trim();
        const entryItems = row[3].toString().trim();

        // Apply outlet filter
        if (outlet && entryOutlet.toLowerCase() !== outlet.toLowerCase()) {
          continue;
        }

        // Apply date filters
        if (startDate || endDate) {
          try {
            const entryDate = new Date(entryTime);
            if (startDate && entryDate < new Date(startDate)) continue;
            if (endDate && entryDate > new Date(endDate)) continue;
          } catch (dateError) {
            console.warn(`Invalid date format in row ${i + 1}: ${entryTime}`);
          }
        }

        trackerData.push({
          id: `TRACK-${i}`,
          time: entryTime,
          outlet: entryOutlet,
          items: entryItems,
          rowNumber: i + 1
        });
      }
    }

    console.log(`Processed ${trackerData.length} tracker entries (filtered from ${rawData.length - 1} total)`);

    res.json({
      success: true,
      trackerData: trackerData,
      count: trackerData.length,
      totalRows: rawData.length - 1,
      filters: { outlet, startDate, endDate },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching stock tracker data:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.data || 'No additional details'
    });
  }
});

// Add new tracker entry endpoint - POST to add tracker data
// Stock Summary API - Aggregates out-of-stock items across all outlets
// FIXED: Stock Summary API - Uses tracker data instead of current outlet sheets
// This should replace the existing /api/stock-summary endpoint
app.get('/api/stock-summary', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    console.log(`Stock summary requested using tracker data - Date filters: ${startDate || 'none'} to ${endDate || 'none'}`);

    if (!sheets) {
      const initialized = await initializeGoogleServices();
      if (!initialized) {
        throw new Error('Failed to initialize Google Sheets');
      }
    }

    const STOCK_SPREADSHEET_ID = '12kfAZX7gV0UszUHhTI9i9iy8OObJ0Uc_8fJC18O1ILg';

    // Step 1: Get all items from MasterSheet for reference
    console.log('Step 1: Loading MasterSheet for item reference...');
    const masterResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: STOCK_SPREADSHEET_ID,
      range: `MasterSheet!A:B`, // A=skuCode, B=longName
    });

    const masterData = masterResponse.data.values || [];
    const masterItems = new Map(); // Map: itemName -> skuCode

    for (let i = 1; i < masterData.length; i++) {
      const row = masterData[i];
      if (row && row[0] && row[1]) {
        const skuCode = row[0].toString().trim();
        const itemName = row[1].toString().trim();
        masterItems.set(itemName, skuCode);
      }
    }

    console.log(`Loaded ${masterItems.size} items from MasterSheet`);

    // Step 2: Get all tracker data
    console.log('Step 2: Loading tracker data...');
    const TRACKER_TAB = 'Copy of Tracker';
    const trackerResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: STOCK_SPREADSHEET_ID,
      range: `${TRACKER_TAB}!A:D`, // A=?, B=Time, C=Outlet, D=Items
    });

    const trackerRawData = trackerResponse.data.values || [];
    console.log(`Found ${trackerRawData.length} rows in tracker`);

    // Step 3: Process tracker data and aggregate by item
    const itemOutletMap = new Map(); // Map: itemName -> Set of outlets

    for (let i = 1; i < trackerRawData.length; i++) {
      const row = trackerRawData[i];
      if (row && row[1] && row[2] && row[3]) {
        const entryTime = row[1].toString().trim();
        const entryOutlet = row[2].toString().trim();
        const entryItems = row[3].toString().trim();

        // Apply date filters if provided
        let includeEntry = true;
        if (startDate || endDate) {
          try {
            const entryDate = parseTrackerDate(entryTime);
            if (startDate && entryDate < new Date(startDate)) includeEntry = false;
            if (endDate && entryDate > new Date(endDate)) includeEntry = false;
          } catch (dateError) {
            console.warn(`Invalid date format in tracker row ${i + 1}: ${entryTime}`);
          }
        }

        if (includeEntry) {
          // Parse items from this tracker entry
          const itemsInEntry = parseTrackerItems(entryItems);
          
          // For each item in this entry, track which outlet reported it
          itemsInEntry.forEach(itemName => {
            // Only include items that exist in MasterSheet
            if (masterItems.has(itemName)) {
              if (!itemOutletMap.has(itemName)) {
                itemOutletMap.set(itemName, new Set());
              }
              itemOutletMap.get(itemName).add(entryOutlet);
            }
          });
        }
      }
    }

    // Step 4: Convert to summary format
    const summaryArray = [];
    
    itemOutletMap.forEach((outletSet, itemName) => {
      const skuCode = masterItems.get(itemName);
      const outlets = Array.from(outletSet).sort();
      
      summaryArray.push({
        skuCode: skuCode,
        longName: itemName,
        shortName: itemName, // Use same as longName since we don't have shortName in tracker
        outletCount: outlets.length,
        outlets: outlets
      });
    });

    // Sort by outlet count (most affected items first)
    summaryArray.sort((a, b) => b.outletCount - a.outletCount);

    console.log(`Successfully processed ${summaryArray.length} unique items from tracker data`);

    res.json({
      success: true,
      summary: summaryArray,
      metadata: {
        totalItems: summaryArray.length,
        dataSource: 'tracker', // Indicate this comes from tracker, not current outlet sheets
        masterItemsCount: masterItems.size,
        trackerRowsProcessed: trackerRawData.length - 1,
        dateFiltersApplied: !!(startDate || endDate),
        dateRange: { startDate, endDate }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error generating tracker-based stock summary:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.data || 'No additional details'
    });
  }
});

// Helper functions (add these if they don't exist already)
function parseTrackerItems(itemsString) {
  if (!itemsString) return [];
  
  // Split by common delimiters used in tracker entries
  const delimiters = [',', ';', '|', '\n', ' and ', ' & ', ' + '];
  let items = [itemsString];
  
  delimiters.forEach(delimiter => {
    items = items.flatMap(item => item.split(delimiter));
  });
  
  // Clean and normalize each item
  return items
    .map(item => item.trim())
    .filter(item => item.length > 0)
    .map(item => item.replace(/^[-•*]\s*/, '')); // Remove bullet points
}

function parseTrackerDate(dateTimeString) {
  if (!dateTimeString) return new Date(0);
  
  try {
    // Handle format "01/09/2025 00:13"
    const parts = dateTimeString.split(' ');
    if (parts.length === 2) {
      const datePart = parts[0]; // "01/09/2025"
      const timePart = parts[1]; // "00:13"
      
      const [day, month, year] = datePart.split('/');
      const [hour, minute] = timePart.split(':');
      
      return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute));
    }
    
    // Fallback to direct parsing
    return new Date(dateTimeString);
  } catch (error) {
    console.warn(`Failed to parse date: ${dateTimeString}`);
    return new Date(0);
  }
}

// Get detailed outlet information for a specific item
// Updated Get detailed outlet information for a specific item
// Get detailed historical tracking information for a specific item
// Get detailed historical tracking information for a specific item
// WORKING FIX: Replace the existing /api/stock-item-details/:skuCode endpoint with this
app.get('/api/stock-item-details/:skuCode', async (req, res) => {
  try {
    const skuCode = req.params.skuCode;
    const { startDate, endDate } = req.query;
    console.log(`[POPUP] Item tracking history for SKU: ${skuCode}`);

    if (!sheets) {
      const initialized = await initializeGoogleServices();
      if (!initialized) {
        throw new Error('Failed to initialize Google Sheets');
      }
    }

    const STOCK_SPREADSHEET_ID = '12kfAZX7gV0UszUHhTI9i9iy8OObJ0Uc_8fJC18O1ILg';

    // Step 1: Get item name from MasterSheet
    console.log(`[POPUP] Getting item name for SKU: ${skuCode}`);
    const masterResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: STOCK_SPREADSHEET_ID,
      range: `MasterSheet!A:B`,
    });

    const masterData = masterResponse.data.values || [];
    let itemName = null;
    
    // Find SKU in MasterSheet
    for (let i = 1; i < masterData.length; i++) {
      const row = masterData[i];
      if (row && row[0] && row[0].toString().trim() === skuCode) {
        itemName = row[1] ? row[1].toString().trim() : skuCode;
        break;
      }
    }

    if (!itemName) {
      console.log(`[POPUP] SKU ${skuCode} not found in MasterSheet`);
      return res.status(404).json({
        success: false,
        error: `SKU "${skuCode}" not found in MasterSheet`
      });
    }

    console.log(`[POPUP] Found item: ${skuCode} = "${itemName}"`);

    // Step 2: Search tracker for this item name
    const TRACKER_TAB = 'Copy of Tracker';
    const trackerResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: STOCK_SPREADSHEET_ID,
      range: `${TRACKER_TAB}!A:D`,
    });

    const trackerData = trackerResponse.data.values || [];
    console.log(`[POPUP] Searching ${trackerData.length} tracker rows for "${itemName}"`);
    
    const matchingEntries = [];
    
    // Search tracker data
    for (let i = 1; i < trackerData.length; i++) {
      const row = trackerData[i];
      if (row && row[1] && row[2] && row[3]) {
        const time = row[1].toString().trim();
        const outlet = row[2].toString().trim();
        const items = row[3].toString().trim();

        // Check if this entry contains our item name
        if (containsExactItem(items, itemName)) {
          console.log(`[POPUP] Match found in row ${i}: "${items}"`);
          
          // Apply date filters
          let includeEntry = true;
          if (startDate || endDate) {
            try {
              const entryDate = parseTrackerDateSimple(time);
              if (startDate && entryDate < new Date(startDate)) includeEntry = false;
              if (endDate && entryDate > new Date(endDate)) includeEntry = false;
            } catch (err) {
              console.warn(`[POPUP] Date parse error: ${time}`);
            }
          }

          if (includeEntry) {
            matchingEntries.push({
              time: time,
              outlet: outlet,
              items: items,
              rowNumber: i + 1
            });
          }
        }
      }
    }

    console.log(`[POPUP] Found ${matchingEntries.length} matching entries`);

    // Group by outlet
    const byOutlet = {};
    matchingEntries.forEach(entry => {
      if (!byOutlet[entry.outlet]) {
        byOutlet[entry.outlet] = [];
      }
      byOutlet[entry.outlet].push(entry);
    });

    // Format response
    const outletDetails = Object.keys(byOutlet).map(outlet => ({
      outlet: outlet,
      trackerEntries: byOutlet[outlet].sort((a, b) => {
        try {
          return parseTrackerDateSimple(b.time) - parseTrackerDateSimple(a.time);
        } catch {
          return 0;
        }
      }),
      entryCount: byOutlet[outlet].length
    }));

    outletDetails.sort((a, b) => b.entryCount - a.entryCount);

    res.json({
      success: true,
      itemInfo: {
        skuCode: skuCode,
        longName: itemName
      },
      outletDetails: outletDetails,
      allTrackerEntries: matchingEntries.sort((a, b) => {
        try {
          return parseTrackerDateSimple(b.time) - parseTrackerDateSimple(a.time);
        } catch {
          return 0;
        }
      }),
      summary: {
        totalOutlets: outletDetails.length,
        totalHistoricalEntries: matchingEntries.length,
        searchedItemName: itemName,
        searchedSKU: skuCode
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[POPUP] Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Helper function - add this near your other helper functions
function containsExactItem(itemsString, targetItem) {
  if (!itemsString || !targetItem) return false;
  
  // Split items by common delimiters
  const delimiters = /[,;|&+\n]/;
  const items = itemsString.split(delimiters)
    .map(item => item.trim())
    .filter(item => item.length > 0);
  
  // Check for exact match
  return items.some(item => item === targetItem);
}

// Helper function - add this near your other helper functions
function parseTrackerDateSimple(dateString) {
  if (!dateString) return new Date(0);
  
  try {
    // Handle "01/09/2025 00:13" format
    if (dateString.includes('/') && dateString.includes(':')) {
      const [datePart, timePart] = dateString.split(' ');
      const [day, month, year] = datePart.split('/');
      const [hour, minute] = timePart.split(':');
      
      return new Date(
        parseInt(year), 
        parseInt(month) - 1, 
        parseInt(day), 
        parseInt(hour), 
        parseInt(minute)
      );
    }
    
    return new Date(dateString);
  } catch (error) {
    return new Date(0);
  }
}
// Debug stock summary endpoint
app.get('/api/debug-stock-summary', async (req, res) => {
  try {
    if (!sheets) {
      await initializeGoogleServices();
    }

    const STOCK_SPREADSHEET_ID = '12kfAZX7gV0UszUHhTI9i9iy8OObJ0Uc_8fJC18O1ILg';
    const testOutlets = ['Sahakarnagar', 'Residency Road'];
    
    console.log(`Debug: Testing stock summary with outlets: ${testOutlets.join(', ')}`);

    // Test MasterSheet access
    const masterResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: STOCK_SPREADSHEET_ID,
      range: `MasterSheet!A1:B10`,
    });

    // Test outlet access
    const outletTests = {};
    for (const outlet of testOutlets) {
      try {
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId: STOCK_SPREADSHEET_ID,
          range: `${outlet}!A1:C10`,
        });
        outletTests[outlet] = {
          success: true,
          rowCount: response.data.values ? response.data.values.length : 0,
          sampleData: response.data.values || []
        };
      } catch (error) {
        outletTests[outlet] = {
          success: false,
          error: error.message
        };
      }
    }

    res.json({
      success: true,
      spreadsheetId: STOCK_SPREADSHEET_ID,
      masterSheet: {
        rowCount: masterResponse.data.values ? masterResponse.data.values.length : 0,
        sampleData: masterResponse.data.values || []
      },
      outletTests: outletTests,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error debugging stock summary:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      spreadsheetId: '12kfAZX7gV0UszUHhTI9i9iy8OObJ0Uc_8fJC18O1ILg'
    });
  }
});


// ADD THESE TWO ENDPOINTS AT THE END OF YOUR server.js FILE 
// (with your other API endpoints, before the error handling middleware)

// Manual trigger for critical stock check
app.post('/api/check-critical-stock', async (req, res) => {
  try {
    console.log('Manual critical stock check requested');
    
    if (!criticalStockBot) {
      return res.status(503).json({
        success: false,
        error: 'Critical Stock Bot is not available. Please check bot configuration.'
      });
    }
    
    await sendCriticalStockAlerts();
    
    res.json({
      success: true,
      message: 'Critical stock check completed and alerts sent if needed',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in manual critical stock check:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Set up automatic scheduling for critical stock alerts
app.post('/api/schedule-critical-alerts', async (req, res) => {
  try {
    const { intervalHours = 0.5 } = req.body; // Default check every 6 hours
    
    if (!criticalStockBot) {
      return res.status(503).json({
        success: false,
        error: 'Critical Stock Bot is not available. Please check bot configuration.'
      });
    }
    
    // Validate interval
    if (intervalHours < 0 || intervalHours > 24) {
      return res.status(400).json({
        success: false,
        error: 'Interval must be between 1 and 24 hours'
      });
    }
    
    // Clear existing interval if any
    if (global.criticalStockInterval) {
      clearInterval(global.criticalStockInterval);
      console.log('Cleared existing critical stock schedule');
    }
    
    // Set up new interval
    global.criticalStockInterval = setInterval(async () => {
      console.log(`Scheduled critical stock check - every ${intervalHours} hours`);
      try {
        await sendCriticalStockAlerts();
      } catch (error) {
        console.error('Error in scheduled critical stock check:', error.message);
      }
    }, intervalHours  * 60 * 60 * 1000);
    
    console.log(`Critical stock alerts scheduled every ${intervalHours} hours`);
    
    res.json({
      success: true,
      message: `Critical stock alerts scheduled every ${intervalHours} hours`,
      intervalHours: intervalHours,
      nextCheckTime: new Date(Date.now() + (intervalHours * 60 * 60 * 1000)).toISOString(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error scheduling critical alerts:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get current critical stock schedule status
app.get('/api/critical-stock-status', (req, res) => {
  try {
    const hasSchedule = !!global.criticalStockInterval;
    
    res.json({
      success: true,
      botStatus: criticalStockBot ? 'Connected' : 'Not Connected',
      scheduledAlerts: hasSchedule ? 'Active' : 'Not Scheduled',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Stop scheduled critical stock alerts
app.post('/api/stop-critical-alerts', (req, res) => {
  try {
    if (global.criticalStockInterval) {
      clearInterval(global.criticalStockInterval);
      global.criticalStockInterval = null;
      console.log('Critical stock alerts schedule stopped');
      
      res.json({
        success: true,
        message: 'Critical stock alerts schedule stopped',
        timestamp: new Date().toISOString()
      });
    } else {
      res.json({
        success: true,
        message: 'No active schedule to stop',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/get-group-id', async (req, res) => {
  try {
    if (!criticalStockBot) {
      return res.status(503).json({
        success: false,
        error: 'Critical Stock Bot not available'
      });
    }

    // Get bot updates to find the group chat ID
    const updates = await criticalStockBot.getUpdates();
    
    const groups = [];
    updates.forEach(update => {
      if (update.message && update.message.chat.type === 'group') {
        groups.push({
          chatId: update.message.chat.id,
          title: update.message.chat.title,
          type: update.message.chat.type
        });
      }
    });

    res.json({
      success: true,
      message: 'Send any message in your group, then call this endpoint to get the group chat ID',
      groups: groups,
      instructions: [
        '1. Send any message in your Telegram group where the bot is added',
        '2. Call this endpoint again to get the group chat ID',
        '3. Add the chat ID to your .env file as CRITICAL_STOCK_GROUP_ID'
      ]
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/test-group-message', async (req, res) => {
  try {
    const { message = 'Test message from Critical Stock Bot' } = req.body;
    
    if (!criticalStockBot) {
      return res.status(503).json({
        success: false,
        error: 'Critical Stock Bot not available'
      });
    }

    if (!CRITICAL_STOCK_GROUP_ID) {
      return res.status(400).json({
        success: false,
        error: 'Group ID not configured. Please set CRITICAL_STOCK_GROUP_ID in .env'
      });
    }

    await criticalStockBot.sendMessage(CRITICAL_STOCK_GROUP_ID, message);
    
    res.json({
      success: true,
      message: 'Test message sent to group successfully',
      groupId: CRITICAL_STOCK_GROUP_ID
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      details: 'Make sure the bot is added to the group and has permission to send messages'
    });
  }
});

// New API endpoint for manual type reclassification
function getAutoAssignee(ticketType, issueDescription = '') {
  // First try explicit type matching
  if (AUTO_ASSIGNMENT_RULES[ticketType] && AUTO_ASSIGNMENT_RULES[ticketType].length > 0) {
    const assignees = AUTO_ASSIGNMENT_RULES[ticketType];
    if (assignees.length === 1) {
      return assignees[0];
    } else if (assignees.length > 1) {
      // Random selection for multiple assignees (like Stock Items -> Nishat/Ajay)
      return assignees[Math.floor(Math.random() * assignees.length)];
    }
  }

  // If type is not recognized or has no assignees, try keyword classification
  const description = issueDescription.toLowerCase();
  
  for (const [type, keywords] of Object.entries(TYPE_CLASSIFICATION_KEYWORDS)) {
    if (type === TICKET_TYPES.OTHERS || type === TICKET_TYPES.DIFFICULTY_IN_ORDER) continue;
    
    if (keywords.some(keyword => description.includes(keyword))) {
      const assignees = AUTO_ASSIGNMENT_RULES[type];
      if (assignees && assignees.length > 0) {
        return assignees.length === 1 ? assignees[0] : assignees[Math.floor(Math.random() * assignees.length)];
      }
    }
  }

  // Default fallback to Kim (Others category)
  return AUTO_ASSIGNMENT_RULES[TICKET_TYPES.OTHERS][0];
}

// Add endpoint to get ticket statistics by type
app.get('/api/ticket-type-stats', async (req, res) => {
  try {
    if (!sheets) {
      const initialized = await initializeGoogleServices();
      if (!initialized) {
        throw new Error('Failed to initialize Google APIs');
      }
    }

    const TICKET_SPREADSHEET_ID = '1FYXr8Wz0ddN3mFi-0AQbI6J_noi2glPbJLh44CEMUnE';
    const TICKET_TAB = 'Tickets';

    const ticketsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: TICKET_SPREADSHEET_ID,
      range: `${TICKET_TAB}!A:K`,
    });

    const ticketsData = ticketsResponse.data.values || [];
    const tickets = transformTicketDataWithAutoAssignment(ticketsData);
    
    // Calculate statistics by type
    const statsByType = {};
    
    Object.values(TICKET_TYPES).forEach(type => {
      statsByType[type] = {
        total: 0,
        open: 0,
        inProgress: 0,
        resolved: 0,
        closed: 0,
        autoAssigned: 0
      };
    });

    tickets.forEach(ticket => {
      const type = ticket.type || TICKET_TYPES.OTHERS;
      if (statsByType[type]) {
        statsByType[type].total++;
        const statusKey = ticket.status.toLowerCase().replace(' ', '').replace('inprogress', 'inProgress');
        if (statsByType[type][statusKey] !== undefined) {
          statsByType[type][statusKey]++;
        }
        if (ticket.autoAssigned) {
          statsByType[type].autoAssigned++;
        }
      }
    });

    res.json({
      success: true,
      statsByType,
      totalTickets: tickets.length,
      autoAssignmentRules: AUTO_ASSIGNMENT_RULES,
      availableTypes: Object.values(TICKET_TYPES),
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error getting ticket type stats:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
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
  const botConnected = !!bot;
  
  res.set('Content-Type', 'application/json');
  res.json({ 
    status: sheetsConnected && driveConnected ? 'OK' : 'Not Connected',
    services: {
      googleSheets: sheetsConnected ? 'Connected' : 'Disconnected',
      googleDrive: driveConnected ? 'Connected' : 'Disconnected',
      geminiApi: GEMINI_API_KEY ? 'Configured' : 'Not Configured',
      telegramBot: botConnected ? 'Connected' : 'Disconnected'
    },
    environment: {
      dashboardSpreadsheetId: DASHBOARD_SPREADSHEET_ID ? 'Set' : 'Missing',
      dashboardSheetName: DASHBOARD_SHEET_NAME ? 'Set' : 'Missing',
      checklistSpreadsheetId: CHECKLIST_SPREADSHEET_ID ? 'Set' : 'Missing',
      geminiApiKey: GEMINI_API_KEY ? 'Set' : 'Missing',
      telegramBotToken: TELEGRAM_BOT_TOKEN ? 'Set' : 'Missing',
      telegramBotEnabled: ENABLE_TELEGRAM_BOT ? 'Enabled' : 'Disabled'
    },
    telegram: {
      botStatus: botConnected ? 'Active' : 'Inactive',
      broadcastFunctionality: botConnected ? 'Available' : 'Unavailable'
    },
    timestamp: new Date().toISOString(),
  });
});

// === AUDIT ENDPOINTS ===

// Get audit data for specific outlet
app.get('/api/audit-data', async (req, res) => {
  try {
    const { outlet, day } = req.query;
    
    if (!outlet) {
      return res.status(400).json({
        success: false,
        error: 'Outlet parameter is required'
      });
    }

    const branchCode = BRANCH_CODES[outlet];
    if (!branchCode) {
      return res.status(400).json({
        success: false,
        error: `Invalid outlet: ${outlet}. Must be one of: ${Object.keys(BRANCH_CODES).join(', ')}`
      });
    }

    let targetDate = day;
    if (!targetDate) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      targetDate = yesterday.toISOString().split('T')[0];
    }

    console.log(`Fetching audit data for ${outlet} (${branchCode}) on ${targetDate}`);
    
    const accessToken = createRistaJWT(RISTA_SECRET_KEY, RISTA_API_KEY);
    
    const response = await axios.get(
      'https://api.ristaapps.com/v1/inventory/audit/page',
      {
        params: {
          branch: branchCode,
          day: targetDate
        },
        headers: {
          'x-api-key': RISTA_API_KEY,
          'x-api-token': accessToken,
          'content-type': 'application/json'
        },
        timeout: 15000
      }
    );
    
    const jsonResponse = response.data;
    console.log(`Received ${jsonResponse.data?.length || 0} audit records`);
    
    const processedData = [];
    
    if (jsonResponse.data && jsonResponse.data.length > 0) {
      jsonResponse.data.forEach(audit => {
        const auditDateTime = audit.auditDateTime;
        const auditBusinessDay = audit.auditBusinessDay;
        const auditOrderNumber = audit.auditOrderNumber;
        
        if (audit.items && audit.items.length > 0) {
          audit.items.forEach(item => {
            const categoryAllowed = ALLOWED_CATEGORIES.includes(item.categoryName);
            const skuAllowed = ALLOWED_SKUS.includes(item.skuCode);
            
            if (item.variance !== 0 && (categoryAllowed || (!categoryAllowed && skuAllowed))) {
              const variancePercent = item.auditQuantity > 0 
                ? (item.variance / item.auditQuantity * 100) 
                : 0;
              
              processedData.push({
                branchName: outlet,
                branchCode: branchCode,
                date: targetDate,
                auditTime: auditDateTime,
                categoryName: item.categoryName,
                sku: item.skuCode,
                itemName: item.itemName,
                auditQty: item.auditQuantity,
                variance: item.variance,
                auditDate: auditBusinessDay,
                auditNumber: auditOrderNumber,
                variancePercent: Math.abs(variancePercent),
                unitCost: item.unitCost || 0,
                hasVariance: true,
                isHighVariance: Math.abs(item.variance) >= 10,
                toleranceViolation: Math.abs(variancePercent) > 8,
                absVariance: Math.abs(item.variance),
                absVariancePercent: Math.abs(variancePercent)
              });
            }
          });
        }
      });
    }
    
    console.log(`Processed ${processedData.length} items with variance`);
    
    res.json({
      success: true,
      audits: processedData,
      count: processedData.length,
      metadata: {
        outlet: outlet,
        branchCode: branchCode,
        date: targetDate,
        source: 'ristaapps-api'
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error fetching audit data:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.data || 'No additional details'
    });
  }
});

// Get audit data for all outlets
app.get('/api/audit-data-all', async (req, res) => {
  try {
    const { day } = req.query;
    
    let targetDate = day;
    if (!targetDate) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      targetDate = yesterday.toISOString().split('T')[0];
    }

    console.log(`Fetching audit data for all outlets on ${targetDate}`);
    
    const accessToken = createRistaJWT(RISTA_SECRET_KEY, RISTA_API_KEY);
    const allAudits = [];
    
    for (const [outletName, branchCode] of Object.entries(BRANCH_CODES)) {
      try {
        console.log(`Fetching ${outletName} (${branchCode})...`);
        
        const response = await axios.get(
          'https://api.ristaapps.com/v1/inventory/audit/page',
          {
            params: {
              branch: branchCode,
              day: targetDate
            },
            headers: {
              'x-api-key': RISTA_API_KEY,
              'x-api-token': accessToken,
              'content-type': 'application/json'
            },
            timeout: 15000
          }
        );
        
        const jsonResponse = response.data;
        
        if (jsonResponse.data && jsonResponse.data.length > 0) {
          jsonResponse.data.forEach(audit => {
            const auditDateTime = audit.auditDateTime;
            const auditBusinessDay = audit.auditBusinessDay;
            const auditOrderNumber = audit.auditOrderNumber;
            
            if (audit.items && audit.items.length > 0) {
              audit.items.forEach(item => {
                const categoryAllowed = ALLOWED_CATEGORIES.includes(item.categoryName);
                const skuAllowed = ALLOWED_SKUS.includes(item.skuCode);
                
                if (item.variance !== 0 && (categoryAllowed || (!categoryAllowed && skuAllowed))) {
                  const variancePercent = item.auditQuantity > 0 
                    ? (item.variance / item.auditQuantity * 100) 
                    : 0;
                  
                  allAudits.push({
                    branchName: outletName,
                    branchCode: branchCode,
                    date: targetDate,
                    auditTime: auditDateTime,
                    categoryName: item.categoryName,
                    sku: item.skuCode,
                    itemName: item.itemName,
                    auditQty: item.auditQuantity,
                    variance: item.variance,
                    auditDate: auditBusinessDay,
                    auditNumber: auditOrderNumber,
                    variancePercent: Math.abs(variancePercent),
                    unitCost: item.unitCost || 0,
                    hasVariance: true,
                    isHighVariance: Math.abs(item.variance) >= 10,
                    toleranceViolation: Math.abs(variancePercent) > 8,
                    absVariance: Math.abs(item.variance),
                    absVariancePercent: Math.abs(variancePercent)
                  });
                }
              });
            }
          });
        }
        
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (error) {
        console.error(`Error fetching ${outletName}:`, error.message);
      }
    }
    
    console.log(`Total processed: ${allAudits.length} items across all outlets`);
    
    const summary = {
      totalAudits: allAudits.length,
      totalVarianceItems: allAudits.length,
      highVarianceItems: allAudits.filter(a => a.isHighVariance).length,
      toleranceViolations: allAudits.filter(a => a.toleranceViolation).length,
      byOutlet: {}
    };
    
    allAudits.forEach(audit => {
      if (!summary.byOutlet[audit.branchName]) {
        summary.byOutlet[audit.branchName] = { total: 0, variances: 0, violations: 0 };
      }
      summary.byOutlet[audit.branchName].total++;
      summary.byOutlet[audit.branchName].variances++;
      if (audit.toleranceViolation) {
        summary.byOutlet[audit.branchName].violations++;
      }
    });
    
    res.json({
      success: true,
      audits: allAudits,
      summary: summary,
      count: allAudits.length,
      metadata: {
        date: targetDate,
        outletsProcessed: Object.keys(BRANCH_CODES).length,
        source: 'ristaapps-api-all'
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error fetching all audit data:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Audit summary endpoint
app.get('/api/audit-summary', async (req, res) => {
  try {
    const { day, groupBy = 'outlet' } = req.query;
    
    let targetDate = day;
    if (!targetDate) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      targetDate = yesterday.toISOString().split('T')[0];
    }

    console.log(`Generating audit summary for ${targetDate}, grouped by: ${groupBy}`);
    
    const accessToken = createRistaJWT(RISTA_SECRET_KEY, RISTA_API_KEY);
    const allAudits = [];
    
    for (const [outletName, branchCode] of Object.entries(BRANCH_CODES)) {
      try {
        const response = await axios.get(
          'https://api.ristaapps.com/v1/inventory/audit/page',
          {
            params: {
              branch: branchCode,
              day: targetDate
            },
            headers: {
              'x-api-key': RISTA_API_KEY,
              'x-api-token': accessToken,
              'content-type': 'application/json'
            },
            timeout: 15000
          }
        );
        
        const jsonResponse = response.data;
        
        if (jsonResponse.data && Array.isArray(jsonResponse.data)) {
          jsonResponse.data.forEach(audit => {
            if (audit.items && Array.isArray(audit.items)) {
              audit.items.forEach(item => {
                const categoryAllowed = ALLOWED_CATEGORIES.includes(item.categoryName);
                const skuAllowed = ALLOWED_SKUS.includes(item.skuCode);
                
                if (item.variance !== 0 && (categoryAllowed || (!categoryAllowed && skuAllowed))) {
                  const variancePercent = item.auditQuantity > 0 
                    ? (item.variance / item.auditQuantity * 100) 
                    : 0;
                  
                  allAudits.push({
                    branchName: outletName,
                    branchCode: branchCode,
                    categoryName: item.categoryName || 'Unknown',
                    sku: item.skuCode || 'N/A',
                    itemName: item.itemName || 'Unknown Item',
                    variance: item.variance || 0,
                    absVariance: Math.abs(item.variance || 0),
                    variancePercent: Math.abs(variancePercent),
                    auditQty: item.auditQuantity || 0,
                    unitCost: item.unitCost || 0,
                    toleranceViolation: Math.abs(variancePercent) > 8
                  });
                }
              });
            }
          });
        }
        
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (error) {
        console.error(`Error fetching ${outletName}:`, error.message);
      }
    }
    
    let summary = {};
    
    if (groupBy === 'outlet') {
      allAudits.forEach(audit => {
        if (!summary[audit.branchName]) {
          summary[audit.branchName] = {
            outlet: audit.branchName,
            totalVariances: 0,
            highVariances: 0,
            toleranceViolations: 0,
            totalAbsVariance: 0,
            categories: new Set(),
            items: []
          };
        }
        const s = summary[audit.branchName];
        s.totalVariances++;
        if (audit.absVariance >= 10) s.highVariances++;
        if (audit.toleranceViolation) s.toleranceViolations++;
        s.totalAbsVariance += audit.absVariance;
        s.categories.add(audit.categoryName);
        s.items.push({
          itemName: audit.itemName,
          variance: audit.variance,
          variancePercent: audit.variancePercent
        });
      });
      
      Object.keys(summary).forEach(key => {
        summary[key].categories = Array.from(summary[key].categories);
        summary[key].avgVariance = summary[key].totalVariances > 0 
          ? (summary[key].totalAbsVariance / summary[key].totalVariances).toFixed(2)
          : '0';
      });
    }
    
    const overallStats = {
      totalAudits: allAudits.length,
      totalOutlets: Object.keys(BRANCH_CODES).length,
      highVarianceCount: allAudits.filter(a => a.absVariance >= 10).length,
      toleranceViolationCount: allAudits.filter(a => a.toleranceViolation).length,
      uniqueCategories: [...new Set(allAudits.map(a => a.categoryName))].length,
      uniqueItems: [...new Set(allAudits.map(a => a.itemName))].length,
      date: targetDate
    };
    
    res.json({
      success: true,
      summary: Object.values(summary),
      overallStats: overallStats,
      groupedBy: groupBy,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error generating audit summary:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Debug endpoint
app.get('/api/debug-rista-audit', async (req, res) => {
  try {
    const accessToken = createRistaJWT(RISTA_SECRET_KEY, RISTA_API_KEY);
    
    const testBranch = 'BLN';
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const testDate = yesterday.toISOString().split('T')[0];
    
    console.log(`Testing with branch: ${testBranch}, date: ${testDate}`);
    
    const response = await axios.get(
      'https://api.ristaapps.com/v1/inventory/audit/page',
      {
        params: {
          branch: testBranch,
          day: testDate
        },
        headers: {
          'x-api-key': RISTA_API_KEY,
          'x-api-token': accessToken,
          'content-type': 'application/json'
        }
      }
    );
    
    res.json({
      success: true,
      message: 'Ristaapps API connection successful',
      testParameters: {
        branch: testBranch,
        day: testDate
      },
      responseStatus: response.status,
      dataReceived: response.data.data?.length || 0,
      sampleAudit: response.data.data?.[0] || null,
      sampleItems: response.data.data?.[0]?.items?.slice(0, 3) || [],
      jwtAlgorithm: 'HS256',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.data || 'No additional details'
    });
  }
});

// Root endpoint
app.get('/', (req, res) => {
  res.set('Content-Type', 'application/json');
  res.json({
    message: 'AOD Dashboard API Server with Fixed Telegram Bot',
    version: '2.6.0',
    status: 'Running',
    telegramBotStatus: bot ? 'Connected' : 'Not Connected',
    features: [
      'Multi-period dashboard data (1/7/28 days)',
      'Enhanced ticket management with type classification',
      'AI-powered insights with Gemini',
      'Fixed Telegram broadcast with conflict resolution',
      'Proper bot shutdown and error handling',
      'Environment-based bot configuration',
      'Image proxy with improved error handling',
      'Comprehensive debugging endpoints',
      'Employee performance dashboard',
      'Swiggy-specific analytics',
      'High-rated order tracking',
      'Product analysis across Zomato and Swiggy platforms'
    ],
    endpoints: {
      dashboard: {
        data: '/api/dashboard-data?period=[28 Day|7 Day|1 Day]',
        insights: '/api/generate-insights (POST)',
        outletAnalysis: '/api/analyze-outlet (POST)',
        description: 'Restaurant performance analytics with AI insights'
      },
      telegram: {
        sendBroadcast: '/api/send-broadcast (POST)',
        broadcastHistory: '/api/broadcast-history',
        status: bot ? 'Active' : 'Inactive',
        description: 'Telegram broadcast management with acknowledgment tracking'
      },
      tickets: {
        data: '/api/ticket-data',
        assign: '/api/assign-ticket (POST)',
        updateStatus: '/api/update-ticket-status (POST)',
        debug: '/api/debug-tickets',
        description: 'Complete ticket management system with type classification'
      },
      checklist: {
        data: '/api/checklist-data',
        stats: '/api/checklist-stats',
        filter: '/api/checklist-filter (POST)',
        debug: '/api/debug-checklist',
        description: 'Checklist management and completion tracking'
      },
      swiggy: {
        data: '/api/swiggy-dashboard-data?period=[7 Day|1 Day]',
        insights: '/api/swiggy-generate-insights (POST)',
        outletAnalysis: '/api/swiggy-analyze-outlet (POST)',
        debug: '/api/debug-swiggy',
        description: 'Swiggy-specific analytics'
      },
      employee: {
        data: '/api/employee-data?period=[7 Days|28 Days]',
        debug: '/api/debug-employee',
        description: 'Employee performance dashboard with intelligent mapping'
      },
      product: {
        data: '/api/product-analysis-data',
        insights: '/api/product-generate-insights (POST)',
        chatbot: '/api/product-chat (POST)',
        productAnalysis: '/api/analyze-product (POST)',
        debug: '/api/debug-product-analysis',
        description: 'Product performance analysis across Zomato and Swiggy with AI insights and conversational chatbot'
      },
      highRated: {
        data: '/api/high-rated-data-gemini?period=[7 Days|28 Day]',
        debug: '/api/debug-high-rated',
        description: 'High-rated order tracking'
      },
      stock: {
        data: '/api/stock-data?outlet=[OutletName]',
        outlets: '/api/stock-data (GET all outlets)',
        debug: '/api/debug-stock',
        description: 'Stock management system showing out-of-stock items per outlet'
      },
      utilities: {
        imageProxy: '/api/image-proxy/:fileId',
        health: '/health',
        description: 'Utility endpoints for system monitoring and file access'
      }
    },
    telegramUpdates: {
      fixes: [
        '409 Conflict error resolution',
        'Proper bot shutdown handling',
        'Retry logic for polling failures',
        'Environment-based bot enabling/disabling',
        'Graceful error handling without server crashes'
      ],
      configuration: {
        enableBot: 'Set ENABLE_TELEGRAM_BOT=false to disable',
        development: 'Uses polling with conflict resolution',
        production: 'Consider using webhooks for better performance'
      }
    },
    timestamp: new Date().toISOString(),
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err.stack);
  res.set('Content-Type', 'application/json');
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    details: err.message,
    timestamp: new Date().toISOString(),
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    requestedPath: req.originalUrl,
    availableEndpoints: {
      dashboard: '/api/dashboard-data?period=[28 Day|7 Day|1 Day]',
      checklist: '/api/checklist-data',
      tickets: '/api/ticket-data',
      highRated: '/api/high-rated-data-gemini?period=[7 Days|28 Day]',
      swiggy: '/api/swiggy-dashboard-data?period=[7 Day|1 Day]',
      employee: '/api/employee-data?period=[7 Days|28 Days]',
      health: '/health',
      root: '/',
      sendBroadcast: '/api/send-broadcast',
      broadcastHistory: '/api/broadcast-history'
    },
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/critical-stock-status', (req, res) => {
  res.json({
    success: true,
    intervalActive: !!global.criticalStockInterval,
    intervalMs: global.criticalStockInterval ? global.criticalStockInterval._idleTimeout : null,
    lastRun: global.lastCriticalStockRun || null,
    timestamp: new Date().toISOString()
  });
});

// === EMAIL CONFIGURATION FOR WEEKLY OOS REPORTS ===

// Configure email transporter
const emailTransporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.EMAIL_PORT || '587'),
  secure: process.env.EMAIL_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

// Function to format OOS data into HTML email
function formatOOSEmailHTML(oosData) {
  const date = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  let html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .header { background-color: #d32f2f; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; }
    .summary { background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th { background-color: #d32f2f; color: white; padding: 12px; text-align: left; font-weight: bold; }
    td { padding: 10px; border-bottom: 1px solid #dee2e6; }
    tr:hover { background-color: #f8f9fa; }
    .critical { color: #d32f2f; font-weight: bold; }
    .warning { color: #ff9800; font-weight: bold; }
    .normal { color: #666; }
    .outlets-cell { font-size: 12px; color: #666; max-width: 300px; }
    .footer { background-color: #f1f1f1; padding: 15px; text-align: center; font-size: 12px; color: #666; margin-top: 30px; }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
  </style>
</head>
<body>
  <div class="header">
    <h1>📊 Weekly Out-of-Stock Report</h1>
    <p>${date}</p>
  </div>

  <div class="content">
    <div class="summary">
      <h2>📋 Summary</h2>
      <p><strong>Analysis Period:</strong> Last 7 Days</p>
      <p><strong>Total Products Analyzed:</strong> ${oosData.length}</p>
      <p><strong>Products with Stock Issues:</strong> ${oosData.filter(p => p.oosPercentage > 0).length}</p>
      <p><strong>Critical Products (>30% OOS):</strong> ${oosData.filter(p => p.oosPercentage > 30).length}</p>
    </div>

    <h2>🔴 Products by Out-of-Stock Percentage</h2>
    <p style="color: #666; font-size: 14px;">Showing all products that went out of stock in the last 7 days, sorted by severity.</p>

    <table>
      <thead>
        <tr>
          <th style="width: 5%;">#</th>
          <th style="width: 25%;">Product Name</th>
          <th class="text-center" style="width: 10%;">OOS %</th>
          <th class="text-center" style="width: 10%;">OOS Hours</th>
          <th class="text-center" style="width: 10%;">Operating Hours</th>
          <th class="text-center" style="width: 8%;">Outlets</th>
          <th class="text-center" style="width: 8%;">Events</th>
          <th style="width: 24%;">Affected Outlets</th>
        </tr>
      </thead>
      <tbody>
`;

  // Add each product as a table row
  oosData.forEach((product, index) => {
    // Safe defaults for undefined values - using correct property names
    const percentage = product.oosPercentage || 0;
    const totalOOSHours = product.totalOOSHours || 0;
    const totalOperatingHours = product.totalOperatingHours || 0;
    const outletCount = product.outletsAffected || 0;
    const stockOutEvents = product.eventsCount || 0;
    const outlets = product.outlets || [];
    const itemName = product.productName || 'Unknown Product';

    const severityClass = percentage > 30 ? 'critical' : percentage > 15 ? 'warning' : 'normal';
    const emoji = percentage > 30 ? '🔴' : percentage > 15 ? '🟠' : '🟡';

    html += `
        <tr>
          <td class="text-center">${emoji}</td>
          <td><strong>${itemName}</strong></td>
          <td class="text-center ${severityClass}"><strong>${percentage.toFixed(2)}%</strong></td>
          <td class="text-center">${totalOOSHours.toFixed(1)}</td>
          <td class="text-center">${totalOperatingHours.toFixed(0)}</td>
          <td class="text-center">${outletCount}</td>
          <td class="text-center">${stockOutEvents}</td>
          <td class="outlets-cell">${outlets.length > 0 ? outlets.join(', ') : 'N/A'}</td>
        </tr>
`;
  });

  html += `
      </tbody>
    </table>
`;

  html += `
  </div>

  <div class="footer">
    <p><strong>Action Required:</strong> Please review products with high out-of-stock percentages and take necessary action to improve inventory management.</p>
    <p>This is an automated weekly report generated every Tuesday.</p>
    <p>Art of Delight - Restaurant Dashboard System</p>
  </div>
</body>
</html>
`;

  return html;
}

// Function to send weekly OOS report
async function sendWeeklyOOSReport() {
  try {
    console.log('📧 Starting weekly OOS report generation...');

    // Get OOS data for all products in the last 7 days across all outlets
    const oosData = await getAllProductsStockOutPercentages(7, null);

    if (!oosData || oosData.products.length === 0) {
      console.log('ℹ️ No out-of-stock data found for the last 7 days. Email not sent.');
      return;
    }

    // Sort products by OOS percentage (highest first)
    const sortedProducts = oosData.products.sort((a, b) => b.oosPercentage - a.oosPercentage);

    // Format email
    const htmlContent = formatOOSEmailHTML(sortedProducts);

    // Email options
    const mailOptions = {
      from: `"Art of Delight Dashboard" <${process.env.EMAIL_FROM}>`,
      to: process.env.EMAIL_TO,
      subject: `Weekly Out-of-Stock Report - ${new Date().toLocaleDateString('en-IN')}`,
      html: htmlContent
    };

    // Send email
    const info = await emailTransporter.sendMail(mailOptions);
    console.log('✅ Weekly OOS report sent successfully!');
    console.log(`   Message ID: ${info.messageId}`);
    console.log(`   Recipients: ${process.env.EMAIL_TO}`);
    console.log(`   Products included: ${sortedProducts.length}`);

  } catch (error) {
    console.error('❌ Error sending weekly OOS report:', error.message);
    console.error(error);
  }
}

// Schedule weekly OOS report - Every Tuesday at 9:00 AM
// Cron format: second minute hour day month weekday
// 0 9 * * 2 = At 9:00 AM on Tuesday
cron.schedule('0 9 * * 2', async () => {
  console.log('🕐 Scheduled weekly OOS report triggered (Tuesday 9:00 AM)');
  await sendWeeklyOOSReport();
}, {
  scheduled: true,
  timezone: "Asia/Kolkata"
});

console.log('✅ Weekly OOS report scheduler initialized (Every Tuesday at 9:00 AM IST)');

// Start server
// Start server with bot initialization
app.listen(PORT, async () => {
  console.log(`AOD Dashboard API Server running on http://localhost:${PORT}`);
  
  // Initialize all services including bots
  console.log('');
  console.log('🚀 Initializing services...');
  await initializeServicesWithTickets();

  // --- AUTO START CRITICAL STOCK SCHEDULER EVERY 1 HOUR ---
  if (criticalStockBot) {
    if (global.criticalStockInterval) {
      clearInterval(global.criticalStockInterval);
    }
    global.criticalStockInterval = setInterval(async () => {
      console.log('Scheduled critical stock check (every 1 hour)');
      try {
        await sendCriticalStockAlerts();
        global.lastCriticalStockRun = new Date().toISOString();
      } catch (error) {
        console.error('Error in scheduled critical stock check:', error.message);
      }
    }, 6 * 60 * 60 * 1000); // 1 hour in milliseconds
    console.log('✅ Critical stock alert scheduler started (every 1 hour)');
  }

  console.log('✅ Service initialization complete');
  console.log('');
  
  console.log('Dashboard endpoints:');
  console.log(`   GET  /api/dashboard-data?period=[28 Day|7 Day|1 Day] - Fetch performance data`);
  console.log(`   POST /api/generate-insights                           - Generate AI insights`);
  console.log(`   POST /api/analyze-outlet                              - Analyze specific outlet`);
  console.log('');
  console.log('Telegram endpoints (FIXED):');
  console.log(`   POST /api/send-broadcast                             - Send Telegram broadcast`);
  console.log(`   GET  /api/broadcast-history                          - Fetch broadcast history`);
  console.log('');
  console.log('Ticket Management endpoints:');
  console.log(`   GET  /api/ticket-data                               - Fetch all tickets with type classification`);
  console.log(`   POST /api/assign-ticket                             - Assign tickets to team members`);
  console.log(`   POST /api/update-ticket-status                      - Update status and action taken`);
  console.log(`   POST /api/assign-ticket-with-notification           - Assign with Telegram notification`);
  console.log(`   POST /api/update-ticket-status-with-notification    - Update with Telegram notification`);
  console.log(`   GET  /api/debug-tickets                             - Debug ticket structure`);
  console.log('');
  console.log('Checklist endpoints:');
  console.log(`   GET  /api/checklist-data                            - Fetch all checklist data`);
  console.log(`   GET  /api/checklist-stats                           - Get statistics`);
  console.log(`   POST /api/checklist-filter                          - Filter data`);
  console.log(`   GET  /api/debug-checklist                           - Debug checklist data`);
  console.log('');
  console.log('Employee endpoints:');
  console.log(`   GET  /api/employee-data?period=[7 Days|28 Days]      - Fetch employee performance data`);
  console.log(`   GET  /api/debug-employee                             - Debug employee data structure`);
  console.log('');
  console.log('Swiggy endpoints:');
  console.log(`   GET  /api/swiggy-dashboard-data?period=[7 Day|1 Day] - Fetch Swiggy performance data`);
  console.log(`   POST /api/swiggy-generate-insights                   - Generate Swiggy AI insights`);
  console.log(`   POST /api/swiggy-analyze-outlet                      - Analyze Swiggy outlet`);
  console.log(`   GET  /api/debug-swiggy                              - Debug Swiggy data structure`);
  console.log('');
  console.log('High Rated endpoints:');
  console.log(`   GET  /api/high-rated-data-gemini?period=[7 Days|28 Day] - Fetch high rated data`);
  console.log(`   GET  /api/debug-high-rated                          - Debug high rated data structure`);
  console.log('');
  console.log('Telegram User Management endpoints:');
  console.log(`   POST /api/register-telegram-user                    - Register employee Telegram mapping`);
  console.log(`   GET  /api/telegram-user-mappings                    - Get all user mappings`);
  console.log(`   POST /api/debug-assignment                          - Debug ticket assignment process`);
  console.log(`   POST /api/restart-bots                              - Manually restart Telegram bots`);
  console.log(`   GET  /api/bot-status                                - Check bot connection status`);
  console.log('');
  console.log('Utility endpoints:');
  console.log(`   GET  /health                                        - Health check`);
  console.log(`   GET  /                                              - API info`);
  console.log(`   GET  /api/image-proxy/:fileId                       - Image proxy`);
  console.log('');
  console.log('Email & Reporting endpoints:');
  console.log(`   POST /api/test-weekly-oos-email                     - Test weekly OOS report email`);
  console.log('');
  console.log('Environment:');
  console.log(`   Dashboard Sheet: ${DASHBOARD_SPREADSHEET_ID ? 'Configured' : 'Missing'}`);
  console.log(`   Checklist Sheet: ${CHECKLIST_SPREADSHEET_ID ? 'Configured' : 'Missing'}`);
  console.log(`   Gemini 1.5 Flash API: ${GEMINI_API_KEY ? 'Configured' : 'Missing'}`);
  console.log(`   Telegram Bot: ${TELEGRAM_BOT_TOKEN ? 'Configured' : 'Missing'}`);
  console.log(`   CO Bot Token: ${CO_BOT_TOKEN ? 'Configured' : 'Missing'}`);
  console.log(`   Telegram Bot Enabled: ${ENABLE_TELEGRAM_BOT ? 'Yes' : 'No'}`);
  console.log(`   Bot Status: ${bot ? 'Connected' : 'Not Connected'}`);
  console.log(`   Ticket Bot Status: ${ticketBot ? 'Connected' : 'Not Connected'}`);
  console.log(`   Service Account: ${authClient ? 'Connected' : 'Not Connected'}`);
  console.log(`   Email Service: ${process.env.EMAIL_USER && process.env.EMAIL_PASSWORD ? 'Configured' : 'Not Configured'}`);
  console.log(`   Weekly OOS Report: ${process.env.EMAIL_USER && process.env.EMAIL_PASSWORD ? 'Enabled (Every Tuesday 9:00 AM IST)' : 'Disabled (Email not configured)'}`);
  console.log('');
  console.log('Telegram Bot Updates (FIXED):');
  console.log('   FIXED: 409 Conflict error with proper shutdown');
  console.log('   FIXED: Polling error handling without server crashes');
  console.log('   NEW: Environment-based bot enabling/disabling');
  console.log('   NEW: Automatic conflict recovery mechanism');
  console.log('   NEW: Proper graceful shutdown for all processes');
  console.log('   NEW: Enhanced ticket workflow with notifications');
  console.log('   NEW: User mapping and Chat ID management');
  console.log('   NEW: Critical stock alert scheduler (every 1 hour)');
  console.log('');
  console.log('Ticket Notification Workflow:');
  console.log('   1. Assign ticket → Employee gets instant Telegram notification');
  console.log('   2. Mark as "Resolved" → Ticket creator gets approval request');
  console.log('   3. Approve/Reject directly from Telegram → Auto close/reopen');
  console.log('');
  console.log('Critical Stock Monitoring:');
  console.log('   - Automated hourly checks for items below reorder level');
  console.log('   - Instant Telegram alerts to management group');
  console.log('   - Last run time tracked for debugging');
  console.log('');
  console.log('Ready to serve requests with full Telegram functionality!');
});