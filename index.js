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
  .then(() => {
    console.log('✅ Google Sheets authentication successful');
  })
  .catch((err) => {
    console.error('❌ Google Sheets authentication failed:', err.message);
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

// Log all incoming requests
app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.path} - ${new Date().toISOString()}`);
  next();
});

// Slack Events Endpoint
app.post('/slack/events', async (req, res) => {
  console.log('📨 Received Slack event:', JSON.stringify(req.body, null, 2));
  
  const { type, challenge, event } = req.body;

  // Slack URL verification
  if (type === 'url_verification') {
    console.log('🔐 Slack URL verification challenge received');
    return res.status(200).json({ challenge });
  }

  // Log oncall messages
  if (event && event.type === 'message' && !event.bot_id) {
    console.log('💬 Processing message event:', {
      user: event.user,
      channel: event.channel,
      text: event.text,
      timestamp: event.ts
    });
    
    const message = (event.text || '').toLowerCase();
    if (message.includes('oncall') || message.includes('on-call')) {
      console.log('🚨 On-call keyword detected in message');
      
      const timestamp = new Date().toISOString();
      const user = event.user;
      const channel = event.channel;

      console.log('📊 Preparing to log to Google Sheets:', {
        timestamp,
        user,
        message: event.text,
        channel
      });

      try {
        await sheets.spreadsheets.values.append({
          spreadsheetId: process.env.GOOGLE_SHEET_ID,
          range: 'onCallLog!A:D',
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: [[timestamp, user, event.text, channel]],
          },
        });

        console.log('✅ On-call message successfully logged to Google Sheets');
      } catch (err) {
        console.error('❌ Google Sheets error:', {
          message: err.message,
          code: err.code,
          details: err.errors || err.details,
          stack: err.stack
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
  console.log(`📊 Google Sheets integration: ${process.env.GOOGLE_SHEET_ID ? 'Configured' : 'Missing GOOGLE_SHEET_ID'}`);
  console.log(`🔑 Service Account: ${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ? 'Configured' : 'Missing GOOGLE_SERVICE_ACCOUNT_EMAIL'}`);
});
