# Strava Media Uploader

Automated tool to upload media (photos/videos) to a **specific Strava activity** using Playwright and Browserless.io.

> ✅ Target activity is now required on both CLI and server/webhook usage.

---

## Quick Deploy to Railway

### 1) Connect GitHub to Railway
1. Go to [railway.app](https://railway.app)
2. Click **New Project** → **Deploy from GitHub repo**
3. Select: `https://github.com/Rooshosh/Strava-Media-Uploader`

### 2) Add environment variables
In Railway dashboard → **Variables**:

```bash
BROWSERLESS_WS_ENDPOINT=wss://production-sfo.browserless.io/chromium/playwright?token=YOUR_TOKEN
```

### 3) Upload session file
**Option A: Railway dashboard**
1. Deployment → Settings → Volumes
2. Create `sessions` directory
3. Upload `sessions/state.json`

**Option B: CLI**
```bash
railway link
railway run mkdir -p sessions
scp sessions/state.json railway:/sessions/state.json
```

### 4) Webhook URL
Railway gives a URL like:
`https://your-app.railway.app`

Upload endpoint:
`https://your-app.railway.app/upload`

---

## CLI Usage (local)

### Required arguments
- `--activity` (or `-a`): Strava activity ID or full Strava activity URL
- One or more media inputs (URL and/or local file paths)

```bash
node upload.js --activity <activity-id-or-url> <media1> [media2] [media3] ...
```

### Examples

```bash
# Activity ID + remote image URL
node upload.js --activity 123456789 https://example.com/photo.jpg

# Full activity URL + local image
node upload.js --activity https://www.strava.com/activities/123456789 ./photo.jpg

# Multiple files
node upload.js --activity 123456789 ./photo1.jpg ./photo2.jpg
```

If `--activity` is missing or invalid, the script exits with a validation error.

---

## Make.com / Webhook usage

### Required JSON body

```json
{
  "activity": "https://www.strava.com/activities/123456789",
  "urls": [
    "https://example.com/image1.jpg",
    "https://example.com/image2.jpg"
  ]
}
```

You can also send an activity ID:

```json
{
  "activity": "123456789",
  "urls": ["https://example.com/image.jpg"]
}
```

Server also accepts `activityId` or `activityUrl` fields for compatibility.

---

## Behavior

1. Media files are downloaded (if remote URLs)
2. Browser automation opens the **specified activity directly**
3. Edit flow uploads media
4. Save flow is unchanged

> The uploader no longer auto-selects your latest activity.

---

## Local setup and testing

```bash
npm install

# Local browser
node upload.js --activity 123456789 ./test.jpg

# Browserless.io
BROWSERLESS_WS_ENDPOINT="wss://..." node upload.js --activity 123456789 ./test.jpg

# Run server
npm start
```

---

## Troubleshooting

### "Authentication required - session expired or invalid"
1. Run locally with a valid activity target and media file
2. Log in when prompted
3. Re-upload `sessions/state.json` to Railway

### "Missing required --activity"
Pass `--activity <id-or-url>` before media inputs.

### Upload failures
- Verify URLs are accessible
- Verify activity ID/URL is correct and belongs to an editable activity
- Verify Browserless token/session validity

---

## Features

- ✅ Required explicit target activity (ID or URL)
- ✅ Single and multiple media uploads
- ✅ URL download + local path support
- ✅ Session persistence
- ✅ Browserless support
- ✅ Error handling and retry logic

## License

ISC
