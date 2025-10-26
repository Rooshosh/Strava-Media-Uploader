# Example Project Structure

Your project should look like this:

```
Strava Media Uploader/
├── node_modules/           # Dependencies (created by npm install)
├── sessions/               # Session storage (created automatically)
│   └── state.json         # Your Strava login session
├── upload.js              # Main upload script
├── package.json            # Project configuration
├── .gitignore             # Git ignore rules
├── README.md              # Full documentation
├── USAGE.md               # Quick start guide
└── photos/                # Your media files (you create this)
    ├── photo1.jpg
    ├── photo2.jpg
    └── video.mp4
```

## Creating Your Media Files

1. Create a `photos/` directory in the project root
2. Add your photos or videos there
3. Run the upload script with those file paths

## First Time Setup Checklist

- [ ] Run `npm install` (✓ Done)
- [ ] Create `photos/` directory
- [ ] Add at least one test photo
- [ ] Run `node upload.js ./photos/your-photo.jpg`
- [ ] Log in to Strava in the browser window
- [ ] Let it complete or close browser manually

## Next Steps After First Run

- [ ] Verify session was saved in `sessions/state.json`
- [ ] Try running again without logging in
- [ ] Test with multiple files
- [ ] Integrate with webhook when ready

