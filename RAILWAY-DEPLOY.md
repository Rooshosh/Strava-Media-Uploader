# Railway Deployment - Complete Guide

## Current Status
✅ Code pushed to GitHub  
✅ Railway configured  
❌ **Action Required**: Upload session file  

## What Just Happened

Railway was trying to run `upload.js` directly, but it should run `server.js` (the webhook server). I just fixed this - it should auto-redeploy.

## Next Steps

### Step 1: Wait for Auto-Redeploy
Railway should automatically redeploy with the fix. Check your Railway dashboard - the service should restart and show "No errors" or start running the server.

### Step 2: Get Your Deployment URL
Once running, Railway will give you a URL like:
- `https://strava-media-uploader-production-xxxx.up.railway.app`

Your webhook endpoint will be:
- `https://your-url.up.railway.app/upload`

### Step 3: Upload Session File

**Simplest method:**

1. **Install Railway CLI:**
```bash
npm install -g @railway/cli
```

2. **Login:**
```bash
railway login
```

3. **Link your project:**
```bash
cd "/Users/henrikreusch/Developer/Strava Media Uploader"
railway link
# Select your project when prompted
```

4. **Open Railway shell and upload:**
```bash
railway shell

# Create directory
mkdir -p sessions

# Open a text editor to paste your session file
nano sessions/state.json
# Paste your session file content (copy from local sessions/state.json)
# Press Ctrl+X, then Y, then Enter to save

# Exit shell
exit
```

### Step 4: Test the Webhook

Once the session file is uploaded, test your webhook:

```bash
curl -X POST https://your-url.up.railway.app/upload \
  -H "Content-Type: application/json" \
  -d '{"urls": ["https://cdn.shopify.com/s/files/1/0475/8513/2708/files/sebastien-gabriel--imlv9jlb24-unsplash-1.jpg?v=1734059829"]}'
```

## If Railway CLI Doesn't Work

Alternative: **SSH into Railway deployment**

Railway provides SSH access. Check your service settings for SSH credentials, then:

```bash
# SSH into your Railway deployment
railway shell

# Then follow the same steps as above
```

## Troubleshooting

### Service still crashing?
- Check Railway logs
- Make sure `BROWSERLESS_WS_ENDPOINT` environment variable is set
- Verify the session file was uploaded

### Can't find session file upload option?
Railway's UI doesn't have a direct "upload file" button. Use the CLI method above.

### Session expires?
Re-upload a fresh `sessions/state.json` file using the same method.

