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
    
    if (process.env.GOOGLE_SHEET_ID) {
      console.log('🔍 Attempting to access Google Sheet with ID:', process.env.GOOGLE_SHEET_ID);
      try {
        const response = await sheets.spreadsheets.get({
          spreadsheetId: process.env.GOOGLE_SHEET_ID,
        });
        console.log('✅ Google Sheet access confirmed:', response.data.properties.title);
        console.log('📊 Sheet URL:', `https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_SHEET_ID}`);
        
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

// Middleware
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

// Test endpoint for Google Sheets
app.post('/test-sheets', async (req, res) => {
  console.log('🧪 Testing Google Sheets functionality');

  try {
    if (!process.env.GOOGLE_SHEET_ID) {
      return res.status(400).json({ error: 'GOOGLE_SHEET_ID not configured' });
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
      requestBody: { values: [testData] },
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

// Slack Events Endpoint
// app.post('/slack/events', async (req, res) => {
//   console.log('📨 Received Slack event');

//   const { type, challenge, event } = req.body;

//   // Handle Slack verification
//   if (type === 'url_verification') {
//     console.log('🔐 Slack URL verification challenge received');
//     return res.status(200).json({ challenge });
//   }

//   // Only proceed if it's a message event
//   if (event && event.type === 'message') {
//     let messageText = '';

//     // Support both regular and edited messages
//     if (event.subtype === 'message_changed') {
//       messageText = event.message?.text || '';
//     } else {
//       messageText = event.text || '';
//     }

//     // Skip empty messages
//     if (!messageText.trim()) {
//       console.log('⚠️ Skipping empty message');
//       return res.sendStatus(200);
//     }

//     // Check for "oncall" or "on-call"
//     const lowerMessage = messageText.toLowerCase();
//     if (lowerMessage.includes('oncall') || lowerMessage.includes('on-call')||lowerMessage.includes('firing')||lowerMessage.includes('critical')) {
//       console.log('🚨 On-call keyword detected in message');

//       const timestamp = new Date().toISOString();
//       const user = event.user || event.message?.user || 'unknown';
//       const channel = event.channel || 'unknown';

//       console.log('📊 Preparing to log to Google Sheets:', {
//         timestamp,
//         user,
//         message: messageText,
//         channel
//       });

//       try {
//         if (!process.env.GOOGLE_SHEET_ID) {
//           throw new Error('GOOGLE_SHEET_ID environment variable is not set');
//         }

//         await sheets.spreadsheets.values.append({
//           spreadsheetId: process.env.GOOGLE_SHEET_ID,
//           range: 'onCallLog!A:D',
//           valueInputOption: 'USER_ENTERED',
//           requestBody: {
//             values: [[timestamp, user, messageText, channel]],
//           },
//         });

//         console.log('✅ On-call message successfully logged to Google Sheets');
//       } catch (err) {
//         console.error('❌ Google Sheets error:', {
//           message: err.message,
//           code: err.code,
//           status: err.status,
//           details: err.errors || err.details,
//           response: err.response?.data
//         });

//         return res.status(500).json({
//           error: 'Failed to log to Google Sheets',
//           details: err.message
//         });
//       }
//     } else {
//       console.log('ℹ️ Message does not contain on-call keywords, skipping');
//     }
//   } else {
//     console.log('ℹ️ Event is not a message type, skipping');
//   }

//   res.sendStatus(200);
// });


app.post('/slack/events', async (req, res) => {
  // console.log('📨 Received Slack event');

  const { type, challenge, event } = req.body;
  console.log('📨 Received Slack event', req.body);

  // Handle Slack verification
  if (type === 'url_verification') {
    return res.status(200).json({ challenge });
  }

  if (event && event.type === 'message') {
    let messageText = '';
    if (event.subtype === 'message_changed') {
      messageText = event.message?.text || event.previous_message?.text || '';
    } else {
      messageText = event.text || '';
    }

    if (!messageText.trim()) {
      console.log('⚠️ No message text found (even in previous_message), skipping');
      return res.sendStatus(200);
    }

    const lowerMessage = messageText.toLowerCase();
    if (lowerMessage.includes('oncall') || lowerMessage.includes('on-call')||lowerMessage.includes('firing')||lowerMessage.includes('critical')|| 
    lowerMessage.includes('incident') || lowerMessage.includes('status') ) {
      console.log('🚨 On-call related message detected');

      const now = new Date();
      const date = now.toISOString().split('T')[0]; // YYYY-MM-DD
      const time = now.toTimeString().split(' ')[0]; // HH:MM:SS

      const user = event.user || event.message?.user || 'unknown';
      const channel = event.channel || 'unknown';

      // Extract Title from alert (e.g., between the "|" and ">*")
      const titleMatch = messageText.match(/\|\s?#?\d*\s?\[.*?\](.*?)\>\*/);
      const title = titleMatch ? titleMatch[1].trim() : 'Unknown Title';

      // Extract Description
      const descriptionMatch = messageText.match(/description:\s*(.*?)\\n/i);
      const description = descriptionMatch ? descriptionMatch[1].trim() : 'No description';

      // Extract Alert ID from the link
      const alertIdMatch = messageText.match(/alert-groups\/(.*?)\|/);
      const alertId = alertIdMatch ? alertIdMatch[1].trim() : 'Unknown Alert ID';
    
      const sourceUrlMatch = messageText.match(/<([^|>]+)\|source>/);
      const sourceUrl = sourceUrlMatch ? sourceUrlMatch[1] : 'N/A';
    
      const atsCustomerNameMatch = messageText.match(/atsCustomerName:\s*(.+)/i);
      const atsCustomerName = atsCustomerNameMatch ? atsCustomerNameMatch[1].trim() : 'N/A';
  
      const atsNameMatch = messageText.match(/atsName:\s*(.+)/i);
      const atsName = atsNameMatch ? atsNameMatch[1].trim() : 'N/A';
  
      const customerIdMatch = messageText.match(/customerId:\s*([a-z0-9-]+)/i);
      const customerId = customerIdMatch ? customerIdMatch[1].trim() : 'N/A';
  
      const summaryMatch = messageText.match(/summary:\s*(.+)/i);
      const summary = summaryMatch ? summaryMatch[1].trim() : 'N/A';

      // Extract important bullet points like `- Batch Run ID: ...`
    const importantPoints = [];
    const lines = messageText.split(/\n|\\n/);
    for (const line of lines) {
      if (line.trim().startsWith('-')) {
        importantPoints.push(line.trim());
      }
    }
    const importantSummary = importantPoints.join('; ');

      console.log('📊 Logging to Google Sheets:', {
        date,
        time,
        user,
        title,
        description,
        alertId,
        channel,
        sourceUrl,
        atsCustomerName,
        atsName,
        customerId,
        summary,
        importantSummary
      });
      try {
        if (!process.env.GOOGLE_SHEET_ID) {
          throw new Error('GOOGLE_SHEET_ID environment variable is not set');
        }

        await sheets.spreadsheets.values.append({
          spreadsheetId: process.env.GOOGLE_SHEET_ID,
          range: 'onCallLogUpdated!A:G', // 7 columns
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: [[date, time, user, title, messageText, alertId, channel, sourceUrl, atsCustomerName,
              atsName,
              customerId,
              summary,
              importantSummary]],
          },
        });

        console.log('✅ Alert successfully logged to Google Sheets');
      } catch (err) {
        console.error('❌ Google Sheets error:', {
          message: err.message,
          code: err.code,
          status: err.status,
          details: err.errors || err.details,
          response: err.response?.data
        });

        return res.status(500).json({
          error: 'Failed to log to Google Sheets',
          details: err.message
        });
      }
    } else {
      console.log('ℹ️ Message does not contain on-call keywords, skipping');
    }
  } else {
    console.log('ℹ️ Event is not a message type, skipping');
  }

  res.sendStatus(200);
});


// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server started on port ${PORT}`);
  console.log(`📡 Slack events endpoint: http://localhost:${PORT}/slack/events`);
  console.log(`🧪 Test endpoint: http://localhost:${PORT}/test-sheets`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
  console.log(`📊 Google Sheets integration: ${process.env.GOOGLE_SHEET_ID ? 'Configured' : 'Missing GOOGLE_SHEET_ID'}`);
  console.log(`🔑 Service Account: ${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ? 'Configured' : 'Missing GOOGLE_SERVICE_ACCOUNT_EMAIL'}`);
});
