# Deployment Guide

## Step 1: Push to GitHub

### A. Create a new repository on GitHub
1. Go to https://github.com/new
2. Create a new repo (e.g., `strava-media-uploader`)
3. **Do NOT initialize with README** (since you already have one)
4. Click "Create repository"

### B. Push your code
```bash
# Add the remote (replace with your username)
git remote add origin https://github.com/YOUR_USERNAME/strava-media-uploader.git

# Push to GitHub
git push -u origin main
```

## Step 2: Deploy to Cloud Environment

### For Browserless.io + Make.com

#### Option A: Deploy to Your Own Server (Recommended)

1. **Set up a server/container** (e.g., Docker, Railway, Render, etc.)

2. **Clone your repo:**
```bash
git clone https://github.com/YOUR_USERNAME/strava-media-uploader.git
cd strava-media-uploader
npm install
```

3. **Upload your session file:**
```bash
# Create sessions directory
mkdir -p sessions/

# Upload your local session file
# Option 1: Using scp
scp ~/local/path/to/sessions/state.json user@server:/path/to/app/sessions/

# Option 2: Use your cloud provider's file upload feature
```

4. **Set up environment variable:**
```bash
export BROWSERLESS_WS_ENDPOINT="wss://chrome.browserless.io/?token=YOUR_TOKEN"
```

5. **Test it:**
```bash
node upload.js "https://example.com/image.jpg"
```

#### Option B: Deploy to a Cloud Platform

**Railway.app:**
1. Connect your GitHub repo
2. Add environment variable: `BROWSERLESS_WS_ENDPOINT`
3. Upload `sessions/state.json` via Railway dashboard or CLI
4. Deploy

**Render.com:**
1. Connect your GitHub repo
2. Add environment variable: `BROWSERLESS_WS_ENDPOINT`
3. Add `sessions/state.json` as a secret file
4. Deploy

## Step 3: Set up Make.com Integration

### Create a Webhook Scenario

1. **In Make.com:**
   - Create new scenario
   - Trigger: Webhook (get a webhook URL)

2. **Add a HTTP module** that calls your server:
   ```
   Method: POST
   URL: https://your-server.com/webhook
   Body: { "urls": ["https://example.com/image.jpg"] }
   ```

3. **Your server should:**
   - Receive webhook with URLs
   - Call: `node upload.js "url1" "url2" "url3"`
   - Return success/failure

### Simple Express Server Example

Create `server.js`:

```javascript
const express = require('express');
const { exec } = require('child_process');
const app = express();

app.use(express.json());

app.post('/webhook', (req, res) => {
  const { urls } = req.body;
  
  if (!urls || !Array.isArray(urls)) {
    return res.status(400).json({ error: 'URLs array required' });
  }

  // Build command
  const cmd = `node upload.js ${urls.map(url => `"${url}"`).join(' ')}`;
  
  exec(cmd, (error, stdout, stderr) => {
    if (error) {
      res.status(500).json({ error: error.message, stderr });
      return;
    }
    res.json({ success: true, output: stdout });
  });
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
```

## Step 4: Important Security Notes

⚠️ **Keep Session File Secret:**
- Never commit `sessions/state.json` to Git (already in `.gitignore`)
- Upload it separately to your server
- Store in secure environment variables or encrypted storage

⚠️ **If Session Expires:**
1. Run locally: `node upload.js https://example.com/image.jpg`
2. Log in fresh
3. Copy new `sessions/state.json` to server
4. Restart your service

## Quick Start Checklist

- [ ] Create GitHub repository
- [ ] Push code: `git push origin main`
- [ ] Set up cloud environment (Railway/Render/etc.)
- [ ] Upload `sessions/state.json` to server
- [ ] Set `BROWSERLESS_WS_ENDPOINT` environment variable
- [ ] Test deployment
- [ ] Set up Make.com webhook
- [ ] Test end-to-end

## Testing

### Local Test:
```bash
node upload.js "https://example.com/image.jpg"
```

### Cloud Test (with Browserless):
```bash
BROWSERLESS_WS_ENDPOINT="wss://chrome.browserless.io/?token=XXX" \
node upload.js "https://example.com/image.jpg"
```

### Make.com Test:
Send POST request to your webhook with JSON body:
```json
{
  "urls": [
    "https://example.com/image1.jpg",
    "https://example.com/image2.jpg"
  ]
}
```

