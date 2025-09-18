const express = require('express');
const bodyParser = require('body-parser');
const { google } = require('googleapis');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Google Sheets Auth
const auth = new google.auth.JWT(
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  null,
  process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  ['https://www.googleapis.com/auth/spreadsheets']
);

const sheets = google.sheets({ version: 'v4', auth });

// Test Google Sheets connection on startup
auth.authorize()
  .then(async () => {
    console.log('✅ Google Sheets authentication successful');
    
    // Test if we can access the sheet
    if (process.env.GOOGLE_SHEET_ID) {
      console.log('🔍 Attempting to access Google Sheet with ID:', process.env.GOOGLE_SHEET_ID);
      try {
        const response = await sheets.spreadsheets.get({
          spreadsheetId: process.env.GOOGLE_SHEET_ID,
        });
        console.log('✅ Google Sheet access confirmed:', response.data.properties.title);
        console.log('📊 Sheet URL:', `https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_SHEET_ID}`);
        
        // Check if the onCallLog sheet exists
        const sheetExists = response.data.sheets.some(sheet => 
          sheet.properties.title === 'onCallLog'
        );
        
        if (!sheetExists) {
          console.warn('⚠️ Warning: onCallLog sheet not found. Please create it or the data will not be logged.');
        } else {
          console.log('✅ onCallLog sheet found');
        }
      } catch (err) {
        console.error('❌ Cannot access Google Sheet:', err.message);
        console.error('📋 Error details:', {
          code: err.code,
          status: err.status,
          details: err.response?.data
        });
        
        if (err.message.includes('permission')) {
          console.error('🔐 PERMISSION ISSUE:');
          console.error('1. Make sure your service account email has access to the sheet');
          console.error('2. Service account email:', process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL);
          console.error('3. Share the sheet with this email and give it "Editor" permissions');
          console.error('4. Sheet URL:', `https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_SHEET_ID}`);
        } else if (err.message.includes('not found')) {
          console.error('📄 SHEET NOT FOUND:');
          console.error('1. Check that your GOOGLE_SHEET_ID is correct');
          console.error('2. The ID should be the long string in the URL after /d/');
          console.error('3. Current ID:', process.env.GOOGLE_SHEET_ID);
        }
      }
    } else {
      console.warn('⚠️ GOOGLE_SHEET_ID not configured');
    }
  })
  .catch((err) => {
    console.error('❌ Google Sheets authentication failed:', err.message);
    console.error('Check your service account credentials');
  });

// Parse JSON body
app.use(bodyParser.json());

// Health check endpoint
app.get('/health', (req, res) => {
  console.log('🏥 Health check requested');
  res.status(200).json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    googleSheetsConfigured: !!process.env.GOOGLE_SHEET_ID,
    serviceAccountConfigured: !!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  });
});

// Test endpoint to manually test Google Sheets functionality
app.post('/test-sheets', async (req, res) => {
  console.log('🧪 Testing Google Sheets functionality');
  
  try {
    if (!process.env.GOOGLE_SHEET_ID) {
      return res.status(400).json({ 
        error: 'GOOGLE_SHEET_ID not configured' 
      });
    }

    const testData = [
      new Date().toISOString(),
      'test-user',
      'Test message for Google Sheets',
      'test-channel'
    ];

    const result = await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: 'onCallLog!A:D',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [testData],
      },
    });

    console.log('✅ Test data successfully appended to Google Sheets');
    res.status(200).json({
      success: true,
      message: 'Test data appended successfully',
      result: {
        updatedRows: result.data.updates?.updatedRows,
        updatedColumns: result.data.updates?.updatedColumns,
        updatedCells: result.data.updates?.updatedCells
      }
    });
  } catch (err) {
    console.error('❌ Test failed:', err.message);
    res.status(500).json({
      success: false,
      error: err.message,
      details: err.response?.data || err.details
    });
  }
});

// Log all incoming requests
app.use((req, res, next) => {
//   console.log(`📥 ${req.method} ${req.path} - ${new Date().toISOString()}`);
  next();
});

// Slack Events Endpoint
app.post('/slack/events', async (req, res) => {
  console.log('📨 Received Slack event:');
  
  console.log('req.body=====>',req.body);//we need to comment this out later
  
  const { type, challenge, event } = req.body;

  // Slack URL verification
  if (type === 'url_verification') {
    console.log('🔐 Slack URL verification challenge received');
    return res.status(200).json({ challenge });
  }

  // Log oncall messages
  if ((event && event.type === 'message' && !event.bot_id )|| event.message.text!== undefined) { // skingpping if to capture all
    console.log('💬 Processing message event:', {
      user: event.user,
      channel: event.channel,
    //   text: event.text,
      timestamp: event.ts
    });
    
    const message = (event.text || '').toLowerCase();
    if (message.includes('oncall') || message.includes('on-call') || event.message.text!== undefined) { //skipping if to capture all
      console.log('🚨 On-call keyword detected in message');
      
      const timestamp = new Date().toISOString();
      const user = event.user;
      const channel = event.channel;

      console.log('📊 Preparing to log to Google Sheets:', {
        timestamp,
        user,
        message: event.message.text,
        channel
      });

      try {
        // Validate required environment variables
        if (!process.env.GOOGLE_SHEET_ID) {
          throw new Error('GOOGLE_SHEET_ID environment variable is not set');
        }

        const result = await sheets.spreadsheets.values.append({
          spreadsheetId: process.env.GOOGLE_SHEET_ID,
          range: 'onCallLog!A:D',
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: [[timestamp, user, event.message.text, channel]],
          },
        });

        console.log('✅ On-call message successfully logged to Google Sheets');
        // console.log('📊 Append result:', {
        //   updatedRows: result.data.updates?.updatedRows,
        //   updatedColumns: result.data.updates?.updatedColumns,
        //   updatedCells: result.data.updates?.updatedCells
        // });
      } catch (err) {
        console.error('❌ Google Sheets error:', {
          message: err.message,
          code: err.code,
          status: err.status,
          details: err.errors || err.details,
          response: err.response?.data
        });
        
        // Return error response to Slack
        return res.status(500).json({ 
          error: 'Failed to log to Google Sheets',
          details: err.message 
        });
      }
    } else {
      console.log('ℹ️ Message does not contain on-call keywords, skipping');
    }
  } else {
    console.log('ℹ️ Event is not a user message or is from bot, skipping');
  }

  res.sendStatus(200);
});

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 Server started successfully on port ${PORT}`);
  console.log(`📡 Slack events endpoint: http://localhost:${PORT}/slack/events`);
  console.log(`🧪 Test endpoint: http://localhost:${PORT}/test-sheets`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
  console.log(`📊 Google Sheets integration: ${process.env.GOOGLE_SHEET_ID ? 'Configured' : 'Missing GOOGLE_SHEET_ID'}`);
  console.log(`🔑 Service Account: ${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ? 'Configured' : 'Missing GOOGLE_SERVICE_ACCOUNT_EMAIL'}`);
});
