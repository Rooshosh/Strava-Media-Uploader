# Simple Deployment Guide

## Architecture Overview

```
Make.com Webhook → Your Server → Browserless.io → Strava
                    (railway.app)
```

**Browserless.io** is NOT a hosting service - it's a remote browser service. You need to host your Node.js code elsewhere.

## Option 1: Railway.app (Easiest - Recommended)

### Step 1: Deploy to Railway
1. Go to https://railway.app
2. Click "New Project" → "Deploy from GitHub repo"
3. Connect: `https://github.com/Rooshosh/Strava-Media-Uploader`
4. Railway automatically deploys your code

### Step 2: Add Environment Variables
In Railway dashboard, add:
- **Name:** `BROWSERLESS_WS_ENDPOINT`
- **Value:** `wss://production-sfo.browserless.io/chromium/playwright?token=2TJBfCs8xPkfgl1be1511bd42b5fc450d657afdd379da8954`

### Step 3: Upload Session File
1. In Railway, go to your deployment
2. Upload `sessions/state.json` file (from your local project)
3. Place it in the `sessions/` directory

### Step 4: Get Your Webhook URL
Railway will give you a URL like: `https://your-app.railway.app`

Your webhook endpoint will be: `https://your-app.railway.app/upload`

## Make.com Integration

### Create Make.com Scenario
1. **Trigger:** Webhook (create new webhook)
2. **Action:** HTTP module
   - Method: POST
   - URL: `https://your-app.railway.app/upload`
   - Body:
     ```json
     {
       "urls": [
         "https://example.com/image1.jpg",
         "https://example.com/image2.jpg"
       ]
     }
     ```

### Test It
Send a test POST request to your Railway URL:
```bash
curl -X POST https://your-app.railway.app/upload \
  -H "Content-Type: application/json" \
  -d '{"urls": ["https://cdn.shopify.com/s/files/1/0475/8513/2708/files/sebastien-gabriel--imlv9jlb24-unsplash-1.jpg?v=1734059829"]}'
```

## What Happens

1. Make.com sends URLs to your Railway server
2. Railway server downloads the images
3. Railway server calls Browserless.io to run the browser
4. Browserless.io navigates to Strava and uploads
5. Response sent back to Make.com

## Cost

- **Railway:** Free tier available, ~$5/month for production
- **Browserless.io:** Free tier available, ~$0.01/minute usage
- **Make.com:** Free tier or paid plans

**Total estimated cost:** $5-10/month

## Troubleshooting

### Session expired
Upload a fresh `sessions/state.json` file to Railway

### Browserless.io errors
Check your token is still valid in Browserless.io dashboard

### Make.com timeout
Make.com has a 4-minute timeout. If uploads take longer:
- Use smaller images
- Or switch to async processing

