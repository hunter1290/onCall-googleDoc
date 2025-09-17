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

// Parse JSON body
app.use(bodyParser.json());

// Slack Events Endpoint
app.post('/slack/events', async (req, res) => {
  const { type, challenge, event } = req.body;

  // Slack URL verification
  if (type === 'url_verification') {
    return res.status(200).json({ challenge });
  }

  // Log oncall messages
  if (event && event.type === 'message' && !event.bot_id) {
    const message = event.text.toLowerCase();
    if (message.includes('oncall') || message.includes('on-call')) {
      const timestamp = new Date().toISOString();
      const user = event.user;
      const channel = event.channel;

      try {
        await sheets.spreadsheets.values.append({
          spreadsheetId: process.env.GOOGLE_SHEET_ID,
          range: 'Sheet1!A:D',
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: [[timestamp, user, event.text, channel]],
          },
        });

        console.log('✅ On-call message logged');
      } catch (err) {
        console.error('❌ Google Sheets error:', err);
      }
    }
  }

  res.sendStatus(200);
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
