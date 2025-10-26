# Quick Start Guide

## Setup

1. **Install dependencies:**
```bash
npm install
```

2. **First run - Login:**
```bash
node upload.js https://example.com/photo.jpg
```

- The browser will open
- **Log in to Strava when prompted**
- The session will be saved automatically
- Close the browser when done

3. **Future runs:**
```bash
node upload.js https://example.com/photo1.jpg https://example.com/photo2.jpg
```

No need to log in again! The session is remembered.

## How It Works

The script accepts URLs to media files. It will automatically:
1. Download the files from the URLs to a temporary directory
2. Upload them to your latest Strava activity
3. Clean up the temporary files

## Example Commands

### Upload single photo from URL:
```bash
node upload.js https://example.com/photo.jpg
```

### Upload multiple photos:
```bash
node upload.js https://example.com/photo1.jpg https://example.com/photo2.jpg https://example.com/photo3.jpg
```

### Upload video:
```bash
node upload.js https://cdn.example.com/video.mp4
```

### Upload mix of photos and videos:
```bash
node upload.js https://example.com/photo1.jpg https://example.com/photo2.jpg https://example.com/video.mp4
```

## Troubleshooting

### "Failed to download" error
- Check that the URL is accessible
- Verify the URL is a direct link to the file (not a redirect page)
- Check your internet connection
- Some servers may block automated downloads

### Session not saving
- Make sure you're logged in to Strava in the browser
- Check that the `sessions/` directory was created
- Check that `sessions/state.json` exists

### Automation not working
- The script will try multiple selectors but may need manual intervention
- If it can't find buttons automatically, it will prompt you to click them manually
- This is a safety feature

### Need to re-login
Delete the `sessions/state.json` file and run the script again to log in fresh.

## Customization

You can modify these settings in `upload.js`:

- `ACTIVITY_DELAY`: Time to wait before clicking activity (default: 2000ms)
- `UPLOAD_TIMEOUT`: Maximum time to wait for upload (default: 60000ms)
- `headless`: Set to `true` in `chromium.launch()` for headless mode
- `slowMo`: Speed of actions (default: 500ms, set to 0 to disable)

