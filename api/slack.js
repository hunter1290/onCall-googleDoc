const { google } = require('googleapis');

const auth = new google.auth.JWT(
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  null,
  process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  ['https://www.googleapis.com/auth/spreadsheets']
);

const sheets = google.sheets({ version: 'v4', auth });

module.exports = async (req, res) => {
  if (req.method === 'POST') {
    const { type, challenge, event } = req.body;

    // Slack verification
    if (type === 'url_verification') {
      return res.status(200).json({ challenge });
    }

    // Message event
    if (event && event.type === 'message' && !event.bot_id) {
      const messageText = event.text.toLowerCase();

      // Filter oncall messages
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

          console.log("✅ On-call message logged");
        } catch (err) {
          console.error("❌ Google Sheets error:", err);
        }
      }
    }

    return res.status(200).end();
  }

  res.status(405).send('Method Not Allowed');
};
