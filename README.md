# Strava Media Uploader

An automated tool to upload media (photos/videos) from URLs to your latest Strava activity using Playwright and Browserless.io.

## 🚀 Quick Deploy to Railway

### 1. Connect GitHub to Railway
1. Go to [railway.app](https://railway.app)
2. Click "New Project" → "Deploy from GitHub repo"
3. Select: `https://github.com/Rooshosh/Strava-Media-Uploader`

### 2. Add Environment Variables
In Railway dashboard → Variables tab:
```
BROWSERLESS_WS_ENDPOINT=wss://production-sfo.browserless.io/chromium/playwright?token=YOUR_TOKEN
```

### 3. Upload Session File
**Option A: Via Railway Dashboard**
1. Go to your deployment → Settings → Volumes
2. Create `sessions` directory
3. Upload `sessions/state.json` from your local project

**Option B: Via CLI** (after `railway login`)
```bash
railway link
railway run mkdir -p sessions
scp sessions/state.json railway:/sessions/state.json
```

### 4. Get Your Webhook URL
Railway will deploy and give you a URL like: `https://your-app.railway.app`

Your webhook endpoint is: `https://your-app.railway.app/upload`

## Make.com Integration

### Setup Webhook in Make.com
1. Create new scenario
2. Add "Webhooks" → "Custom webhook"
3. Copy webhook URL
4. Add "HTTP" module:
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

## Local Testing

### First Time Setup
```bash
node upload.js https://example.com/photo.jpg
# Log in when browser opens
# Session saved to sessions/state.json
```

### Manual Testing
```bash
# With local browser
node upload.js "https://example.com/image.jpg"

# With Browserless.io
BROWSERLESS_WS_ENDPOINT="wss://..." node upload.js "https://example.com/image.jpg"
```

## How It Works

1. Make.com sends URLs to your Railway server
2. Server downloads the media files
3. Server connects to Browserless.io
4. Browserless.io runs the browser and uploads to Strava
5. Response sent back to Make.com

## Features

- ✅ **URL Support**: Downloads from any public URL
- ✅ **Session Persistence**: Login once, stay logged in
- ✅ **Multiple Files**: Upload multiple images/videos at once
- ✅ **Browserless.io**: Scalable browser automation
- ✅ **Error Handling**: Robust retry logic
- ✅ **Auto Cleanup**: Removes temporary files

## Architecture

```
Make.com → Railway Server → Browserless.io → Strava
```

- **Make.com**: Triggers with media URLs
- **Railway**: Runs your Node.js server and script
- **Browserless.io**: Provides the remote browser
- **Strava**: Receives the upload

## Cost Estimate

- Railway: Free tier or $5/month
- Browserless.io: Pay per minute (~$0.01/min)
- Make.com: Free tier or paid plans
- **Total**: ~$5-10/month

## Troubleshooting

### "Session expired" error
1. Run locally: `node upload.js https://example.com/test.jpg`
2. Log in fresh
3. Upload new `sessions/state.json` to Railway

### Upload fails
- Check URLs are accessible
- Verify Browserless.io token is valid
- Check Railway logs

## Development

```bash
# Install dependencies
npm install

# Run locally
node upload.js "https://example.com/image.jpg"

# Run server
npm start
```

## License

ISC
