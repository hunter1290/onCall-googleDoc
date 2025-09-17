const express = require('express');
const bodyParser = require('body-parser');
const { google } = require('googleapis');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

const auth = new google.auth.JWT(
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  null,
  process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  ['https://www.googleapis.com/auth/spreadsheets']
);

const sheets = google.sheets({ version: 'v4', auth });

app.post('/slack/events', async (req, res) => {
  const { type, challenge, event } = req.body;

  // URL verification for Slack setup
  if (type === 'url_verification') {
    return res.send({ challenge });
  }

  if (event && event.type === 'message' && !event.bot_id) {
    const messageText = event.text.toLowerCase();

    // Filter messages related to on-call (customize this logic)
    if (messageText.includes('oncall') || messageText.includes('on-call')) {
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

        console.log('Logged message to Google Sheets');
      } catch (error) {
        console.error('Google Sheets error:', error);
      }
    }
  }

  res.status(200).send();
});

app.listen(process.env.PORT, () => {
  console.log(`Slack listener running on port ${process.env.PORT}`);
});
