# Strava Media Uploader

An automated tool to upload media (photos/videos) to your latest Strava activity using Playwright.

## Features

- 🔐 **Session Persistence**: Login once, stay logged in
- 🚀 **Automated Upload**: Finds your latest activity and uploads media
- 📸 **Photo & Video Support**: Supports multiple file types
- 🔄 **Retry & Error Handling**: Robust error handling and retry logic
- 🛠️ **Manual Fallback**: Will prompt you if automated steps fail

## Installation

```bash
npm install
```

## Usage

### First Time Setup

1. Run the script with your media files:
```bash
npm start
```

2. The browser will open. You need to log in to Strava the first time.

3. After logging in, close the browser (or wait) and the session will be saved.

4. For future runs, you won't need to log in again.

### Upload Media

```bash
npm start <file1> [file2] [file3] ...
```

Example:
```bash
npm start ./photos/photo1.jpg ./photos/photo2.jpg
npm start ./media/video.mp4
```

### With Node

```bash
node upload.js ./photos/photo1.jpg ./photos/photo2.jpg
```

## How It Works

1. **Login Check**: Checks if you're logged in using saved session data
2. **Navigate**: Goes to your activity feed
3. **Find Activity**: Finds your latest activity
4. **Edit**: Clicks edit button
5. **Upload**: Uploads the provided media files
6. **Wait**: Waits for upload to complete
7. **Save**: Clicks save button
8. **Store Session**: Saves the session for future use

## Session Storage

Sessions are stored in the `sessions/` directory:
- `state.json`: Contains cookies and session data

## Troubleshooting

### Browser stays open
- This is intentional for debugging
- Close the browser manually when done

### Automation fails
- The script will prompt you to complete steps manually if it can't find elements
- This is a safety feature to prevent errors

### First time login
- Run the script
- Log in manually when prompted
- The session will be saved for future runs

## Future Enhancements

- [ ] Webhook integration for external triggers
- [ ] Support for direct URL downloads
- [ ] Batch processing of multiple activities
- [ ] Config file for customization
- [ ] Headless mode option

## License

ISC

