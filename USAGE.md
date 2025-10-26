# Quick Start Guide

## Setup

1. **Install dependencies:**
```bash
npm install
```

2. **Prepare your media files:**
Add your photo or video files to the project directory (or any location you prefer).

Example structure:
```
project/
├── photos/
│   ├── photo1.jpg
│   ├── photo2.jpg
│   └── photo3.jpg
└── upload.js
```

3. **First run - Login:**
```bash
node upload.js ./photos/photo1.jpg
```

- The browser will open
- **Log in to Strava when prompted**
- The session will be saved automatically
- Close the browser when done

4. **Future runs:**
```bash
node upload.js ./photos/photo1.jpg ./photos/photo2.jpg
```

No need to log in again! The session is remembered.

## Example Commands

### Upload single photo:
```bash
npm start ./photo.jpg
```

### Upload multiple photos:
```bash
npm start ./photos/photo1.jpg ./photos/photo2.jpg ./photos/photo3.jpg
```

### Upload video:
```bash
npm start ./video.mp4
```

### Upload mix of photos and videos:
```bash
npm start ./photo1.jpg ./photo2.jpg ./video.mp4
```

## Troubleshooting

### "File not found" error
Make sure your file paths are correct and the files exist.

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

