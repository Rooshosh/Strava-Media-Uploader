# Browserless.io Deployment Guide

This guide shows you how to deploy the Strava uploader to Browserless.io and trigger it from Make.com (formerly Integromat).

## Overview

- **Local mode**: Run with visible browser for testing
- **Browserless mode**: Run on Browserless.io for automation
- **Make.com trigger**: Can trigger via webhook or API

## Setup

### 1. Prerequisites

1. Browserless.io account
2. Make.com account  
3. Session file (`sessions/state.json`) already created locally

### 2. Environment Variables

For **Local Testing:**
```bash
# Visible browser (default)
node upload.js ./photos/image.jpg

# Headless browser
HEADLESS=true node upload.js ./photos/image.jpg
```

For **Browserless.io:**
```bash
# Set the Browserless WebSocket endpoint (get from Browserless.io dashboard)
BROWSERLESS_WS_ENDPOINT=wss://production-sfo.browserless.io/chromium/playwright?token=YOUR_TOKEN node upload.js https://example.com/image.jpg
```

### 3. Deploy to Browserless.io

#### Step 1: Get Your Browserless Token
1. Log into [browserless.io](https://www.browserless.io)
2. Go to "Tools" → "Browserless Snippets" 
3. Select "Playwright" framework and "JavaScript"
4. Toggle "Use actual token" to ON
5. Copy the WebSocket URL (looks like: `wss://production-REGION.browserless.io/chromium/playwright?token=abc123...`)

#### Step 2: Upload Session File
You need to upload your `sessions/state.json` to your server/container:

```bash
# Option 1: Using Docker
# Copy the session file into your container
docker cp sessions/state.json my-container:/app/sessions/

# Option 2: Using scp/rsync to cloud server
scp sessions/state.json user@server:/path/to/app/sessions/

# Option 3: Upload via Browserless.io file storage (if available)
```

#### Step 3: Deploy the Script
```bash
# Clone your repo
git clone your-repo-url

# Install dependencies
npm install

# Ensure session directory exists
mkdir -p sessions/

# Copy your session file to this directory
cp /path/to/state.json sessions/state.json
```

### 4. Test with Browserless.io

```bash
# Set environment variable and run
export BROWSERLESS_WS_ENDPOINT="wss://production-sfo.browserless.io/chromium/playwright?token=YOUR_TOKEN"
node upload.js https://example.com/test-image.jpg
```

## Make.com Integration

### Option 1: HTTP Webhook (Recommended)

Create a simple Express server to receive webhooks and run the script:

```javascript
// server.js
const express = require('express');
const { exec } = require('child_process');
const app = express();

app.use(express.json());

app.post('/webhook/upload', async (req, res) => {
  const { mediaUrls } = req.body;
  
  // Download media files temporarily
  // ... download logic ...
  
  // Run upload script
  exec(`node upload.js ./temp/images/*.jpg`, (error, stdout, stderr) => {
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ success: true, output: stdout });
  });
});

app.listen(3000);
```

In Make.com:
1. Create webhook trigger
2. When media is ready, POST to your server
3. Server runs the upload script
4. Return success/failure

### Option 2: Direct Make → Browserless.io

You can also run the script directly from Make.com using HTTP module:

1. **Make.com scenario:**
   - Trigger: Manual or webhook
   - HTTP module: POST request to your server
   - Body: Media URLs

2. **Your server responds by:**
   - Downloading media files
   - Running `node upload.js` with Browserless.io env var
   - Returning result

## Security Considerations

⚠️ **Important:**
- **Never commit** `sessions/state.json` to Git (already in .gitignore)
- Store session file securely on your server
- Use environment variables for Browserless token
- Rotate session if it expires

## Session Management

### Creating Initial Session (One-time)

```bash
# 1. Run locally with visible browser
node upload.js ./photos/test.jpg

# 2. Log in manually when browser opens

# 3. Session is saved to sessions/state.json

# 4. Upload this file to your deployment environment
```

### Refreshing Expired Session

If session expires in production:
1. Run the script locally again
2. Log in fresh
3. Copy new `sessions/state.json` to server
4. Redeploy or upload new session file

## Troubleshooting

### "Session expired" error
- Run locally to create fresh session
- Upload new session file to server

### Browserless connection fails
- Check your Browserless token is valid
- Verify WebSocket endpoint format
- Ensure your IP/container has network access

### Make.com webhook timing out
- Add longer timeout in Make scenario
- Consider async processing (webhook + background job)

## Cost Considerations

**Browserless.io:**
- Free tier: Limited usage
- Paid tier: Per-minute billing (~$0.01/minute)
- Large uploads = more time = more cost

**Make.com:**
- Free tier: Limited operations
- Paid tier: Per operation

**Optimizations:**
- Use smaller images when possible
- Batch uploads together
- Cache session aggressively

## Testing Checklist

- [ ] Local test with visible browser works
- [ ] Session file created successfully
- [ ] Browserless.io connection works
- [ ] Headless mode uploads succeed
- [ ] Make.com webhook triggers successfully
- [ ] Error handling works (session expiration, etc.)

## Example Deployment Script

Save this as `deploy.sh`:

```bash
#!/bin/bash

# Deploy to server with Browserless.io
echo "Deploying Strava uploader..."

# Set Browserless endpoint
export BROWSERLESS_WS_ENDPOINT="wss://production-sfo.browserless.io/chromium/playwright?token=$BROWSERLESS_TOKEN"

# Run the uploader
node upload.js "$@"
```

Usage:
```bash
chmod +x deploy.sh
./deploy.sh ./photos/image.jpg
```

