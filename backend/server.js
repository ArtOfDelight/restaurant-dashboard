require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');
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


let bot = null;
let isShuttingDown = false;

if (!DASHBOARD_SPREADSHEET_ID || !DASHBOARD_SHEET_NAME) {
  console.error('Missing environment variables: SPREADSHEET_ID and SHEET_NAME are required for dashboard endpoints');
}
if (!GEMINI_API_KEY) {
  console.error('Missing environment variable: GEMINI_API_KEY is required for Gemini API integration');
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
    minStart: '06:00',
    maxStart: '12:00',
    minEnd: '12:00',
    maxEnd: '16:00'
  },
  'Mid Day': {
    minStart: '11:00',
    maxStart: '15:00',
    minEnd: '15:00',
    maxEnd: '20:00'
  },
  'Closing': {
    minStart: '18:00',
    maxStart: '23:59',
    minEnd: '22:00',
    maxEnd: '02:00'
  }
};

/**
 * Helper function to determine time slot from shift start/end times
 */
function determineTimeSlotFromShift(startTime, endTime) {
  if (!startTime) return null;
  
  const start = startTime.substring(0, 5); // Get HH:MM format
  
  // Check if shift falls within Morning time slot
  if (start >= TIME_SLOT_MAPPINGS['Morning'].minStart && 
      start <= TIME_SLOT_MAPPINGS['Morning'].maxStart) {
    return 'Morning';
  }
  
  // Check if shift falls within Mid Day time slot
  if (start >= TIME_SLOT_MAPPINGS['Mid Day'].minStart && 
      start <= TIME_SLOT_MAPPINGS['Mid Day'].maxStart) {
    return 'Mid Day';
  }
  
  // Check if shift falls within Closing time slot
  if (start >= TIME_SLOT_MAPPINGS['Closing'].minStart) {
    return 'Closing';
  }
  
  return null;
}

/**
 * Get employees scheduled for a specific outlet and time slot on a given date
 */
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const rosterCache = {
  employees: { data: null, timestamp: null },
  roster: { data: null, timestamp: null }
};

function isCacheValid(cacheEntry) {
  if (!cacheEntry.data || !cacheEntry.timestamp) return false;
  return (Date.now() - cacheEntry.timestamp) < CACHE_DURATION;
}

// ===== STEP 2: REPLACE YOUR EXISTING getScheduledEmployees() FUNCTION =====
// Find your current getScheduledEmployees() and replace it with this:

async function getScheduledEmployees(outlet, timeSlot, date) {
  try {
    if (!sheets) {
      const initialized = await initializeGoogleServices();
      if (!initialized) {
        console.error('Failed to initialize Google APIs for roster fetch');
        return [];
      }
    }

    // ================================
    // FETCH EMPLOYEE REGISTER (WITH CACHE)
    // ================================
    const EMPLOYEE_REGISTER_SHEET_ID = '1FYXr8Wz0ddN3mFi-0AQbI6J_noi2glPbJLh44CEMUnE';
    const EMPLOYEE_REGISTER_SHEET_NAME = 'EmployeeRegister';

    let empMap;

    // Check cache first
    if (isCacheValid(rosterCache.employees)) {
      console.log('✅ Using cached employee register');
      empMap = rosterCache.employees.data;
    } else {
      console.log('📥 Fetching employee register from Google Sheets...');
      
      const empResponse = await sheets.spreadsheets.values.get({
        spreadsheetId: EMPLOYEE_REGISTER_SHEET_ID,
        range: `${EMPLOYEE_REGISTER_SHEET_NAME}!A:C`,
      });

      const empData = empResponse.data.values || [];
      empMap = new Map();

      // Skip header row and build map
      for (let i = 1; i < empData.length; i++) {
        const [empId, fullName, shortName] = empData[i];
        if (empId && shortName) {
          empMap.set(empId.trim().toUpperCase(), shortName.trim());
        }
      }

      // Cache the result
      rosterCache.employees = {
        data: empMap,
        timestamp: Date.now()
      };

      console.log(`✅ Cached ${empMap.size} employees`);
    }

    // ================================
    // FETCH ROSTER DATA (WITH CACHE)
    // ================================
    let rosterData;

    // Check cache first
    if (isCacheValid(rosterCache.roster)) {
      console.log('✅ Using cached roster data');
      rosterData = rosterCache.roster.data;
    } else {
      console.log('📥 Fetching roster from Google Sheets...');
      
      const rosterResponse = await sheets.spreadsheets.values.get({
        spreadsheetId: ROSTER_SPREADSHEET_ID,
        range: `${ROSTER_TAB}!A:Z`,
      });

      rosterData = rosterResponse.data.values || [];

      // Cache the result
      rosterCache.roster = {
        data: rosterData,
        timestamp: Date.now()
      };

      console.log(`✅ Cached ${rosterData.length - 1} roster rows`);
    }

    if (rosterData.length <= 1) {
      console.log('No roster data found');
      return [];
    }

    // ================================
    // PROCESS ROSTER DATA (Same as before)
    // ================================
    const headers = rosterData[0].map(h => h.toString().trim());

    const rosterIdIndex = headers.findIndex(h => h.toLowerCase().includes('roster id'));
    const employeeIdIndex = headers.findIndex(h => h.toLowerCase().includes('employee id'));
    const dateColIndex = headers.findIndex(h => h.toLowerCase() === 'date');
    const outletColIndex = headers.findIndex(h => h.toLowerCase() === 'outlet');
    const shiftColIndex = headers.findIndex(h => h.toLowerCase() === 'shift');
    const startTimeIndex = headers.findIndex(h => h.toLowerCase() === 'start time');
    const endTimeIndex = headers.findIndex(h => h.toLowerCase() === 'end time');
    const commentsIndex = headers.findIndex(h => h.toLowerCase() === 'comments');

    if (dateColIndex === -1 || outletColIndex === -1 || startTimeIndex === -1) {
      console.error('Could not find required columns in roster. Headers:', headers);
      return [];
    }

    // Filter matching employees
    const scheduledEmployees = [];
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

      // Determine time slot from shift times
      const derivedTimeSlot = determineTimeSlotFromShift(startTime, endTime);

      // Match outlet, time slot, and date
      if (rosterDate === targetDate &&
          rosterOutlet === outlet.toUpperCase() &&
          derivedTimeSlot === timeSlot) {
        
        // Lookup short name from Employee Register
        const shortName = empMap.get(employeeId?.toUpperCase()) || employeeId || 'Unknown';

        scheduledEmployees.push({
          employeeId: employeeId,
          name: shortName,
          outlet: rosterOutlet,
          timeSlot: derivedTimeSlot,
          shift: shift,
          startTime: startTime,
          endTime: endTime,
          date: rosterDate
        });
      }
    }

    return scheduledEmployees;
  } catch (error) {
    console.error('Error fetching scheduled employees:', error.message);
    return [];
  }
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

    const STOCK_SPREADSHEET_ID = '16ut6A_7EHEjVbzEne23dhoQtPtDvoMt8P478huFaGS8';

    // Step 1: Get critical items from MasterSheet
    const masterResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: STOCK_SPREADSHEET_ID,
      range: `MasterSheet!A:C`, // A=skuCode, B=longName, C=Critical
    });

    const masterData = masterResponse.data.values || [];
    const criticalItems = [];

    // Find items where Critical column = "yes"
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
    const yesterday = new Date(now.getTime() - 15 * 60 * 1000);

    // Step 3: Find critical items that are recently out of stock
    const alertsToSend = [];

    for (const criticalItem of criticalItems) {
      const affectedOutlets = new Set();

      // Search tracker for recent mentions of this critical item
      for (let i = 1; i < trackerData.length; i++) {
        const row = trackerData[i];
        if (row && row[1] && row[2] && row[3]) {
          const time = row[1].toString().trim();
          const outlet = row[2].toString().trim();
          const items = row[3].toString().trim();

          // Check if this is recent (last 24 hours)
          try {
            const entryDate = parseTrackerDateSimple(time);
            if (entryDate >= yesterday) {
              // Check if this entry contains our critical item
              if (containsExactItem(items, criticalItem.longName)) {
                affectedOutlets.add(outlet);
              }
            }
          } catch (dateError) {
            // Skip entries with bad dates
          }
        }
      }

      // If this critical item is out of stock in any outlets, add to alerts
      if (affectedOutlets.size > 0) {
        alertsToSend.push({
          item: criticalItem,
          outlets: Array.from(affectedOutlets)
        });
      }
    }

    console.log(`Preparing ${alertsToSend.length} critical stock alerts`);

    // Step 4: Send alerts to all users
    if (alertsToSend.length > 0) {
      await sendAlertsToAllUsers(alertsToSend);
    }

  } catch (error) {
    console.error('Error checking critical stock:', error.message);
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
    
    
    
    // ADD THESE LINES
    if (criticalStockBot) {
      console.log('Stopping critical stock Telegram bot...');
      await criticalStockBot.stopPolling();
      console.log('Critical stock Telegram bot stopped');
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
// Process signal handlers
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGUSR2', () => gracefulShutdown('SIGUSR2')); // For nodemon

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
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
    
    if (!['7 Day', '1 Day'].includes(period)) {
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

// === ENHANCED PRODUCT ANALYSIS FUNCTIONS WITH CORRECT COLUMN MAPPING ===

// Process Zomato orders data with correct column mapping

// Main function to process product data from multiple sheets - ADD THIS
async function processProductAnalysisData(spreadsheetId) {
  console.log('Processing product analysis data from multiple sheets');
  
  try {
    // Fetch all four sheets in parallel
    const [zomatoOrdersResponse, swiggyReviewResponse, zomatoComplaintsResponse, swiggyComplaintsResponse] = await Promise.all([
      sheets.spreadsheets.values.get({
        spreadsheetId: spreadsheetId,
        range: `zomato_orders!A:Z`,
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId: spreadsheetId,
        range: `Copy of swiggy_review!A:Z`,
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId: spreadsheetId,
        range: `zomato complaints!A:Z`,
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId: spreadsheetId,
        range: `swiggy complaints!A:Z`,
      })
    ]);

    // Process each sheet using the enhanced functions
    console.log('Processing Zomato orders...');
    const zomatoOrders = processZomatoOrdersData(zomatoOrdersResponse.data.values);
    
    console.log('Processing Swiggy reviews...');
    const swiggyOrders = processSwiggyReviewData(swiggyReviewResponse.data.values);
    
    console.log('Processing Zomato complaints...');
    const zomatoComplaints = processZomatoComplaintsData(zomatoComplaintsResponse.data.values);
    
    console.log('Processing Swiggy complaints with Gemini...');
    const swiggyComplaints = await processSwiggyComplaintsData(swiggyComplaintsResponse.data.values);

    // Combine data by product name using fuzzy matching
    const productMap = new Map();

    // Helper function to normalize product names for better matching
    const normalizeProductName = (name) => {
      return name.toLowerCase()
        .replace(/[^\w\s]/g, '') // Remove special characters
        .replace(/\s+/g, ' ') // Normalize spaces
        .trim();
    };

    // Helper function to find matching product or create new one
    const findOrCreateProduct = (productName) => {
      const normalized = normalizeProductName(productName);
      
      // First try exact match
      if (productMap.has(normalized)) {
        return productMap.get(normalized);
      }
      
      // Try fuzzy matching with existing products
      for (let [key, product] of productMap.entries()) {
        const similarity = calculateSimilarity(normalized, key);
        if (similarity > 0.8) { // 80% similarity threshold
          console.log(`Matched "${productName}" with existing "${product.name}" (${(similarity * 100).toFixed(1)}% similarity)`);
          return product;
        }
      }
      
      // Create new product
      const newProduct = {
        name: capitalizeWords(productName),
        normalizedName: normalized,
        zomatoOrders: 0,
        swiggyOrders: 0,
        zomatoComplaints: 0,
        swiggyComplaints: 0,
        avgRating: 0,
        platform: 'Both'
      };
      productMap.set(normalized, newProduct);
      return newProduct;
    };

    // Add Zomato orders
    console.log(`Adding ${zomatoOrders.length} Zomato order items...`);
    zomatoOrders.forEach(product => {
      const existingProduct = findOrCreateProduct(product.name);
      existingProduct.zomatoOrders = product.orders || 0;
      existingProduct.avgRating = Math.max(existingProduct.avgRating, product.rating || 0);
    });

    // Add Swiggy orders
    console.log(`Adding ${swiggyOrders.length} Swiggy order items...`);
    swiggyOrders.forEach(product => {
      const existingProduct = findOrCreateProduct(product.name);
      existingProduct.swiggyOrders = product.orders || 0;
      existingProduct.avgRating = Math.max(existingProduct.avgRating, product.rating || 0);
    });

    // Add Zomato complaints
    console.log(`Adding ${zomatoComplaints.length} Zomato complaint items...`);
    zomatoComplaints.forEach(complaint => {
      const existingProduct = findOrCreateProduct(complaint.productName);
      existingProduct.zomatoComplaints = complaint.count || 0;
    });

    // Add Swiggy complaints
    console.log(`Adding ${swiggyComplaints.length} Swiggy complaint items...`);
    swiggyComplaints.forEach(complaint => {
      const existingProduct = findOrCreateProduct(complaint.productName);
      existingProduct.swiggyComplaints = complaint.count || 0;
    });

    // Convert to array and calculate summary
    const products = Array.from(productMap.values());
    
    // Filter out products with very low order counts (likely parsing errors)
    const filteredProducts = products.filter(p => 
      (p.zomatoOrders + p.swiggyOrders) >= 1
    );
    
    const summary = {
      totalProducts: filteredProducts.length,
      totalZomatoOrders: filteredProducts.reduce((sum, p) => sum + (p.zomatoOrders || 0), 0),
      totalSwiggyOrders: filteredProducts.reduce((sum, p) => sum + (p.swiggyOrders || 0), 0),
      totalZomatoComplaints: filteredProducts.reduce((sum, p) => sum + (p.zomatoComplaints || 0), 0),
      totalSwiggyComplaints: filteredProducts.reduce((sum, p) => sum + (p.swiggyComplaints || 0), 0),
      avgComplaintRate: 0
    };

    const totalOrders = summary.totalZomatoOrders + summary.totalSwiggyOrders;
    const totalComplaints = summary.totalZomatoComplaints + summary.totalSwiggyComplaints;
    summary.avgComplaintRate = totalOrders > 0 ? (totalComplaints / totalOrders * 100) : 0;

    console.log(`Successfully processed ${filteredProducts.length} products:`);
    console.log(`- Total Orders: ${totalOrders}`);
    console.log(`- Total Complaints: ${totalComplaints}`);
    console.log(`- Average Complaint Rate: ${summary.avgComplaintRate.toFixed(2)}%`);

    return { products: filteredProducts, summary };

  } catch (error) {
    console.error('Error processing product analysis data:', error);
    return createEmptyProductDataStructure();
  }
}

// Helper function to calculate string similarity
function calculateSimilarity(str1, str2) {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  if (longer.length === 0) return 1.0;
  
  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

// Helper function to calculate Levenshtein distance
function levenshteinDistance(str1, str2) {
  const matrix = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}

function processZomatoOrdersData(rawData) {
  if (!rawData || rawData.length <= 1) return [];
  
  const headers = rawData[0];
  const dataRows = rawData.slice(1);
  
  console.log('Zomato Orders Headers:', headers);
  
  // Find correct column indices based on actual headers
  const itemsIndex = headers.findIndex(h => h && h.toLowerCase().includes('items in order'));
  const ratingIndex = headers.findIndex(h => h && h.toLowerCase().includes('rating'));
  const restaurantNameIndex = headers.findIndex(h => h && h.toLowerCase().includes('restaurant name'));
  
  console.log(`Zomato Orders - Items column: ${itemsIndex}, Rating column: ${ratingIndex}, Restaurant column: ${restaurantNameIndex}`);
  
  // Count orders per item
  const itemCounts = new Map();
  const itemRatings = new Map();
  
  let totalOrders = 0;
  let ordersWithRatings = 0;
  let ordersWithoutRatings = 0;
  
  dataRows.forEach(row => {
    const itemsCell = getCellValue(row, itemsIndex);
    const rating = parseFloat(getCellValue(row, ratingIndex)) || 0;
    
    totalOrders++;
    
    // MODIFIED: Only process orders with valid ratings (rating > 0)
    if (!itemsCell || !itemsCell.trim() || rating <= 0) {
      if (rating <= 0) ordersWithoutRatings++;
      return; // Skip this order if no items or no valid rating
    }
    
    ordersWithRatings++;
    
    // Parse multiple items from the cell (they might be separated by commas, semicolons, etc.)
    const items = parseItemsFromCell(itemsCell);
    
    items.forEach(item => {
      if (item && item.trim()) {
        const cleanItem = item.trim().toLowerCase();
        itemCounts.set(cleanItem, (itemCounts.get(cleanItem) || 0) + 1);
        
        // Store ratings for averaging
        if (!itemRatings.has(cleanItem)) {
          itemRatings.set(cleanItem, []);
        }
        itemRatings.get(cleanItem).push(rating);
      }
    });
  });
  
  // Convert to array format
  const result = [];
  itemCounts.forEach((count, item) => {
    const ratings = itemRatings.get(item) || [];
    const avgRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
    
    result.push({
      name: capitalizeWords(item),
      orders: count,
      rating: avgRating
    });
  });
  
  console.log(`Processed ${result.length} unique items from Zomato orders`);
  console.log(`Total orders: ${totalOrders}, With ratings: ${ordersWithRatings}, Without ratings: ${ordersWithoutRatings}`);
  
  return result;
}

// Process Swiggy review data with correct column mapping
function processSwiggyReviewData(rawData) {
  if (!rawData || rawData.length <= 1) return [];
  
  const headers = rawData[0];
  const dataRows = rawData.slice(1);
  
  console.log('Swiggy Review Headers:', headers);
  
  // Find correct column indices
  const itemOrderedIndex = headers.findIndex(h => h && h.toLowerCase().includes('item ordered'));
  const ratingIndex = headers.findIndex(h => h && h.toLowerCase().includes('rating'));
  
  console.log(`Swiggy Review - Item column: ${itemOrderedIndex}, Rating column: ${ratingIndex}`);
  
  // Count orders per item
  const itemCounts = new Map();
  const itemRatings = new Map();
  
  dataRows.forEach(row => {
    const itemCell = getCellValue(row, itemOrderedIndex);
    const rating = parseFloat(getCellValue(row, ratingIndex)) || 0;
    
    if (itemCell && itemCell.trim()) {
      const items = parseItemsFromCell(itemCell);
      
      items.forEach(item => {
        if (item && item.trim()) {
          const cleanItem = item.trim().toLowerCase();
          itemCounts.set(cleanItem, (itemCounts.get(cleanItem) || 0) + 1);
          
          if (!itemRatings.has(cleanItem)) {
            itemRatings.set(cleanItem, []);
          }
          if (rating > 0) {
            itemRatings.get(cleanItem).push(rating);
          }
        }
      });
    }
  });
  
  // Convert to array format
  const result = [];
  itemCounts.forEach((count, item) => {
    const ratings = itemRatings.get(item) || [];
    const avgRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
    
    result.push({
      name: capitalizeWords(item),
      orders: count,
      rating: avgRating
    });
  });
  
  console.log(`Processed ${result.length} unique items from Swiggy reviews`);
  return result;
}

// Process Zomato complaints data with correct column mapping
function processZomatoComplaintsData(rawData) {
  if (!rawData || rawData.length <= 1) return [];
  
  const headers = rawData[0];
  const dataRows = rawData.slice(1);
  
  console.log('Zomato Complaints Headers:', headers);
  
  // Find correct column indices
  const descriptionIndex = headers.findIndex(h => h && h.toLowerCase().includes('description'));
  
  console.log(`Zomato Complaints - Description column: ${descriptionIndex}`);
  
  // Count complaints per item extracted from description
  const itemComplaints = new Map();
  
  dataRows.forEach(row => {
    const description = getCellValue(row, descriptionIndex);
    
    if (description && description.trim()) {
      // Extract product names from description using simple keyword matching
      const items = extractItemsFromDescription(description);
      
      items.forEach(item => {
        if (item && item.trim()) {
          const cleanItem = item.trim().toLowerCase();
          itemComplaints.set(cleanItem, (itemComplaints.get(cleanItem) || 0) + 1);
        }
      });
    }
  });
  
  // Convert to array format
  const result = [];
  itemComplaints.forEach((count, item) => {
    result.push({
      productName: capitalizeWords(item),
      count: count
    });
  });
  
  console.log(`Processed ${result.length} unique items from Zomato complaints`);
  return result;
}

// Process Swiggy complaints data with Gemini parsing for reason field
async function processSwiggyComplaintsData(rawData) {
  if (!rawData || rawData.length <= 1) return [];
  
  const headers = rawData[0];
  const dataRows = rawData.slice(1);
  
  console.log('Swiggy Complaints Headers:', headers);
  
  // Find correct column indices
  const reasonIndex = headers.findIndex(h => h && h.toLowerCase().includes('reason'));
  
  console.log(`Swiggy Complaints - Reason column: ${reasonIndex}`);
  
  // Extract unique reason texts for batch processing with Gemini
  const reasonTexts = [];
  dataRows.forEach(row => {
    const reason = getCellValue(row, reasonIndex);
    if (reason && reason.trim()) {
      reasonTexts.push(reason.trim());
    }
  });
  
  // Use Gemini to parse product names from reason texts
  const parsedItems = await parseProductNamesWithGemini(reasonTexts);
  
  // Count complaints per item
  const itemComplaints = new Map();
  
  parsedItems.forEach(item => {
    if (item && item.trim()) {
      const cleanItem = item.trim().toLowerCase();
      itemComplaints.set(cleanItem, (itemComplaints.get(cleanItem) || 0) + 1);
    }
  });
  
  // Convert to array format
  const result = [];
  itemComplaints.forEach((count, item) => {
    result.push({
      productName: capitalizeWords(item),
      count: count
    });
  });
  
  console.log(`Processed ${result.length} unique items from Swiggy complaints using Gemini parsing`);
  return result;
}

// Helper function to parse items from a cell (handles multiple items separated by various delimiters)
function parseItemsFromCell(cellValue) {
  if (!cellValue) return [];
  
  // Common separators in food order data
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

// Helper function to clean item names
function cleanItemName(itemName) {
  if (!itemName) return '';
  
  // Remove common prefixes, quantities, and formatting
  let cleaned = itemName
    .replace(/^\d+[\sx]?\s*/i, '') // Remove leading numbers like "2x ", "1 "
    .replace(/\(.*?\)/g, '') // Remove content in parentheses
    .replace(/\[.*?\]/g, '') // Remove content in square brackets
    .replace(/qty\s*:?\s*\d+/gi, '') // Remove quantity indicators
    .replace(/quantity\s*:?\s*\d+/gi, '') // Remove quantity indicators
    .replace(/size\s*:?\s*(small|medium|large|s|m|l)/gi, '') // Remove size indicators
    .replace(/₹\s*\d+/g, '') // Remove price indicators
    .trim();
  
  return cleaned;
}

// Extract items from complaint descriptions using keyword matching
function extractItemsFromDescription(description) {
  if (!description) return [];
  
  // Common food-related keywords to help identify menu items
  const foodKeywords = [
    'pizza', 'burger', 'sandwich', 'pasta', 'rice', 'chicken', 'biryani',
    'curry', 'dal', 'bread', 'roti', 'naan', 'dosa', 'idli', 'vada',
    'samosa', 'pakora', 'roll', 'wrap', 'salad', 'soup', 'dessert',
    'ice cream', 'cake', 'coffee', 'tea', 'juice', 'lassi', 'shake'
  ];
  
  const words = description.toLowerCase().split(/\s+/);
  const foundItems = [];
  
  // Look for food keywords and surrounding context
  words.forEach((word, index) => {
    foodKeywords.forEach(keyword => {
      if (word.includes(keyword)) {
        // Try to capture 1-3 words around the keyword for context
        const start = Math.max(0, index - 1);
        const end = Math.min(words.length, index + 2);
        const context = words.slice(start, end).join(' ');
        foundItems.push(context);
      }
    });
  });
  
  return foundItems.length > 0 ? foundItems : [description]; // Fallback to full description
}

// Use Gemini AI to parse product names from Swiggy complaint reasons
async function parseProductNamesWithGemini(reasonTexts) {
  if (!GEMINI_API_KEY || reasonTexts.length === 0) {
    console.log('Gemini API not available or no reason texts, using fallback parsing');
    return reasonTexts.flatMap(text => extractItemsFromDescription(text));
  }

  try {
    // Process in batches to avoid token limits
    const batchSize = 10;
    const allParsedItems = [];
    
    for (let i = 0; i < reasonTexts.length; i += batchSize) {
      const batch = reasonTexts.slice(i, i + batchSize);
      
      const prompt = `Extract food/menu item names from these Swiggy complaint reasons. Each reason may contain a product name along with complaint details. Extract only the food item names.

COMPLAINT REASONS:
${batch.map((reason, idx) => `${idx + 1}. ${reason}`).join('\n')}

Return a JSON array with the extracted food item names. If multiple items are mentioned in one reason, include all. If no clear food item is found, try to infer from context. Example:
["Pizza Margherita", "Chicken Biryani", "Chocolate Cake"]

Focus only on the actual menu items, not complaint details.`;

      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`,
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
          timeout: 30000
        }
      );

      if (response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
        const aiResponse = response.data.candidates[0].content.parts[0].text;
        
        try {
          const jsonMatch = aiResponse.match(/\[[\s\S]*?\]/);
          if (jsonMatch) {
            const parsedItems = JSON.parse(jsonMatch[0]);
            if (Array.isArray(parsedItems)) {
              allParsedItems.push(...parsedItems);
            }
          }
        } catch (parseError) {
          console.log('Failed to parse Gemini response for batch, using fallback');
          allParsedItems.push(...batch.flatMap(text => extractItemsFromDescription(text)));
        }
      }
      
      // Small delay between batches
      if (i + batchSize < reasonTexts.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    console.log(`Gemini parsed ${allParsedItems.length} items from ${reasonTexts.length} complaint reasons`);
    return allParsedItems;
    
  } catch (error) {
    console.error('Gemini parsing error:', error.message);
    // Fallback to simple extraction
    return reasonTexts.flatMap(text => extractItemsFromDescription(text));
  }
}

// Helper function to capitalize words
function capitalizeWords(str) {
  if (!str) return '';
  return str.replace(/\b\w+/g, word => 
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  );
}

// Enhanced product insights generation with better analysis
async function generateEnhancedProductInsightsWithGemini(data) {
  if (!GEMINI_API_KEY) {
    return generateProductFallbackInsights(data);
  }

  try {
    console.log(`Generating enhanced product AI insights for ${data.products.length} products`);
    
    // Create detailed analysis data
    const productAnalysis = data.products
      .map(p => ({
        ...p,
        totalOrders: (p.zomatoOrders || 0) + (p.swiggyOrders || 0),
        totalComplaints: (p.zomatoComplaints || 0) + (p.swiggyComplaints || 0),
        complaintRate: ((p.zomatoComplaints || 0) + (p.swiggyComplaints || 0)) / 
                      Math.max((p.zomatoOrders || 0) + (p.swiggyOrders || 0), 1) * 100,
        platformPreference: (p.zomatoOrders || 0) > (p.swiggyOrders || 0) ? 'Zomato' : 'Swiggy',
        ratingCategory: p.avgRating > 4.5 ? 'Excellent' : p.avgRating > 4 ? 'Good' : p.avgRating > 3 ? 'Average' : 'Poor'
      }))
      .filter(p => p.totalOrders > 0)
      .sort((a, b) => b.totalOrders - a.totalOrders);

    const topPerformers = productAnalysis.slice(0, 5);
    const highComplaintItems = productAnalysis
      .filter(p => p.complaintRate > 3 && p.totalOrders > 5)
      .sort((a, b) => b.complaintRate - a.complaintRate)
      .slice(0, 5);

    const prompt = `Analyze this comprehensive restaurant menu performance data extracted from real order and complaint records:

BUSINESS METRICS:
- Total Products Analyzed: ${data.summary.totalProducts}
- Total Orders Processed: ${data.summary.totalZomatoOrders + data.summary.totalSwiggyOrders}
- Total Complaints Logged: ${data.summary.totalZomatoComplaints + data.summary.totalSwiggyComplaints}
- Overall Complaint Rate: ${data.summary.avgComplaintRate.toFixed(2)}%

TOP 5 PERFORMING ITEMS (by volume):
${topPerformers.map(p => `• ${p.name}: ${p.totalOrders} orders, ${p.avgRating.toFixed(1)}⭐, ${p.complaintRate.toFixed(1)}% complaints, Popular on ${p.platformPreference}`).join('\n')}

HIGH-COMPLAINT ITEMS (>3% complaint rate):
${highComplaintItems.map(p => `• ${p.name}: ${p.complaintRate.toFixed(1)}% complaint rate (${p.totalComplaints}/${p.totalOrders}), ${p.avgRating.toFixed(1)}⭐`).join('\n')}

PLATFORM COMPARISON:
- Zomato: ${data.summary.totalZomatoOrders} orders, ${data.summary.totalZomatoComplaints} complaints (${(data.summary.totalZomatoComplaints/Math.max(data.summary.totalZomatoOrders,1)*100).toFixed(2)}% rate)
- Swiggy: ${data.summary.totalSwiggyOrders} orders, ${data.summary.totalSwiggyComplaints} complaints (${(data.summary.totalSwiggyComplaints/Math.max(data.summary.totalSwiggyOrders,1)*100).toFixed(2)}% rate)

Provide strategic business insights in JSON format:
{
  "keyFindings": ["4-6 critical insights about menu performance and customer satisfaction patterns"],
  "recommendations": ["4-6 specific actionable recommendations for menu optimization and quality control"],
  "riskAlerts": ["2-4 immediate concerns requiring attention"],
  "opportunities": ["3-4 growth opportunities based on successful items"],
  "platformInsights": ["3-4 insights comparing Zomato vs Swiggy performance patterns"],
  "qualityControl": ["3-4 specific quality control recommendations based on complaint patterns"]
}

Focus on business-critical insights that can drive revenue growth and customer satisfaction.`;

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.2,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 1200,
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
            topPerformers: topPerformers,
            problemProducts: highComplaintItems,
            confidence: 0.9,
            generatedAt: new Date().toISOString(),
            dataQuality: 'High - Real order and complaint data'
          };
        }
      } catch (parseError) {
        console.log('JSON parsing failed for enhanced insights, using fallback');
      }
    }

    throw new Error('No valid AI response');

  } catch (error) {
    console.error('Enhanced product AI insight generation error:', error.message);
    return generateProductFallbackInsights(data);
  }
}
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
    if (!['7 Day', '1 Day'].includes(period)) {
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
app.get('/api/product-analysis-data', async (req, res) => {
  try {
    console.log('Product analysis data requested');
    
    if (!sheets) {
      const initialized = await initializeGoogleServices();
      if (!initialized) {
        throw new Error('Failed to initialize Google Sheets');
      }
    }

    const PRODUCT_SPREADSHEET_ID = '1XmKondedSs_c6PZflanfB8OFUsGxVoqi5pUPvscT8cs';

    console.log(`Fetching product data from: ${PRODUCT_SPREADSHEET_ID}`);
    
    const processedData = await processProductAnalysisData(PRODUCT_SPREADSHEET_ID);
    
    console.log(`Successfully processed product data:`, {
      products: processedData.products.length,
      totalOrders: processedData.summary.totalZomatoOrders + processedData.summary.totalSwiggyOrders,
      totalComplaints: processedData.summary.totalZomatoComplaints + processedData.summary.totalSwiggyComplaints
    });
    
    res.set('Content-Type', 'application/json');
    res.json({
      success: true,
      data: processedData,
      aiEnabled: !!GEMINI_API_KEY,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching product analysis data:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.data || 'No additional details',
    });
  }
});

// Product-specific AI insights endpoint
// Enhanced product-specific AI insights endpoint
app.post('/api/product-generate-insights', async (req, res) => {
  try {
    const { data, analysisType } = req.body;
    
    console.log(`Generating enhanced product AI insights for ${data.products.length} products`);
    
    // Use the enhanced insights function
    const insights = await generateEnhancedProductInsightsWithGemini(data, analysisType);
    
    res.set('Content-Type', 'application/json');
    res.json({
      success: true,
      insights,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error generating enhanced product insights:', error.message);
    res.set('Content-Type', 'application/json');
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Debug product data endpoint
app.get('/api/debug-product-analysis', async (req, res) => {
  try {
    if (!sheets) {
      await initializeGoogleServices();
    }

    const PRODUCT_SPREADSHEET_ID = '1XmKondedSs_c6PZflanfB8OFUsGxVoqi5pUPvscT8cs';

    console.log(`Debug: Fetching raw product data from ${PRODUCT_SPREADSHEET_ID}`);

    // Fetch all sheets to debug
    const [zomatoOrders, swiggyReview, zomatoComplaints, swiggyComplaints] = await Promise.all([
      sheets.spreadsheets.values.get({
        spreadsheetId: PRODUCT_SPREADSHEET_ID,
        range: `zomato_orders!A1:Z20`,
      }).catch(e => ({ data: { values: null }, error: e.message })),
      sheets.spreadsheets.values.get({
        spreadsheetId: PRODUCT_SPREADSHEET_ID,
        range: `swiggy_review!A1:Z20`,
      }).catch(e => ({ data: { values: null }, error: e.message })),
      sheets.spreadsheets.values.get({
        spreadsheetId: PRODUCT_SPREADSHEET_ID,
        range: `zomato complaints!A1:Z20`,
      }).catch(e => ({ data: { values: null }, error: e.message })),
      sheets.spreadsheets.values.get({
        spreadsheetId: PRODUCT_SPREADSHEET_ID,
        range: `swiggy complaints!A1:Z20`,
      }).catch(e => ({ data: { values: null }, error: e.message }))
    ]);

    res.set('Content-Type', 'application/json');
    res.json({
      success: true,
      spreadsheetId: PRODUCT_SPREADSHEET_ID,
      sheets: {
        zomato_orders: {
          data: zomatoOrders.data.values?.slice(0, 10) || null,
          error: zomatoOrders.error || null,
          headers: zomatoOrders.data.values?.[0] || null
        },
        swiggy_review: {
          data: swiggyReview.data.values?.slice(0, 10) || null,
          error: swiggyReview.error || null,
          headers: swiggyReview.data.values?.[0] || null
        },
        zomato_complaints: {
          data: zomatoComplaints.data.values?.slice(0, 10) || null,
          error: zomatoComplaints.error || null,
          headers: zomatoComplaints.data.values?.[0] || null
        },
        swiggy_complaints: {
          data: swiggyComplaints.data.values?.slice(0, 10) || null,
          error: swiggyComplaints.error || null,
          headers: swiggyComplaints.data.values?.[0] || null
        }
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching debug product data:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      spreadsheetId: '1XmKondedSs_c6PZflanfB8OFUsGxVoqi5pUPvscT8cs',
    });
  }
});

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

    const STOCK_SPREADSHEET_ID = '16ut6A_7EHEjVbzEne23dhoQtPtDvoMt8P478huFaGS8';
    
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

    const STOCK_SPREADSHEET_ID = '16ut6A_7EHEjVbzEne23dhoQtPtDvoMt8P478huFaGS8';
    
    console.log(`Debug: Checking stock spreadsheet ${STOCK_SPREADSHEET_ID}`);

    // Test with first outlet
    const testOutlet = 'Sahakarnagar';
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: STOCK_SPREADSHEET_ID,
      range: `${testOutlet}!A1:C10`, // Get first 10 rows for debugging
    });

    const rawData = response.data.values || [];

    res.json({
      success: true,
      spreadsheetId: STOCK_SPREADSHEET_ID,
      testOutlet: testOutlet,
      rawData: rawData,
      rowCount: rawData.length,
      headers: rawData[0] || null,
      sampleData: rawData.slice(1, 4), // Show 3 sample rows
      expectedStructure: {
        'A': 'skuCode',
        'B': 'shortName',
        'C': 'longName'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error debugging stock data:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      spreadsheetId: '16ut6A_7EHEjVbzEne23dhoQtPtDvoMt8P478huFaGS8'
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

    const STOCK_SPREADSHEET_ID = '16ut6A_7EHEjVbzEne23dhoQtPtDvoMt8P478huFaGS8';
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

    const STOCK_SPREADSHEET_ID = '16ut6A_7EHEjVbzEne23dhoQtPtDvoMt8P478huFaGS8';

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

    const STOCK_SPREADSHEET_ID = '16ut6A_7EHEjVbzEne23dhoQtPtDvoMt8P478huFaGS8';

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

    const STOCK_SPREADSHEET_ID = '16ut6A_7EHEjVbzEne23dhoQtPtDvoMt8P478huFaGS8';
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
      spreadsheetId: '16ut6A_7EHEjVbzEne23dhoQtPtDvoMt8P478huFaGS8'
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
        productAnalysis: '/api/analyze-product (POST)',
        debug: '/api/debug-product-analysis',
        description: 'Product performance analysis across Zomato and Swiggy with AI insights'
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
    }, 60 * 60 * 1000); // 1 hour in milliseconds
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