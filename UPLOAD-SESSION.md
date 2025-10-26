# How to Upload Session File to Railway

## Method 1: Using Railway CLI (Easiest)

### Step 1: Login to Railway CLI
```bash
railway login
```

### Step 2: Link your project
```bash
railway link
# Select your Strava-Media-Uploader project
```

### Step 3: Create sessions directory and upload file
```bash
# Create the directory
railway run mkdir -p sessions

# Upload your session file
railway run bash -c "cat > sessions/state.json << 'EOF'
$(cat sessions/state.json)
EOF"
```

Or simpler:
```bash
# Copy file content and paste into Railway
railway run bash
# Then in the Railway bash:
mkdir -p sessions
# Copy and paste your sessions/state.json content
nano sessions/state.json
# Paste, save, exit
```

## Method 2: Manual Upload via Railway Dashboard

1. Go to your Railway project
2. Click on your service
3. Go to Settings → "Volume"
4. Click "New Volume"
5. Mount path: `/app/sessions`
6. Save
7. Deploy

Then use Railway's file upload or SSH feature.

## Method 3: Environment Variable (Alternative)

If Railway CLI doesn't work, we can store the session in an env var temporarily:

1. In Railway → Variables → New
2. Name: `SESSION_DATA`  
3. Value: (Base64 encode your sessions/state.json)
4. Then modify server.js to decode and save it

## Quick Test: Manual Session Creation

For testing, you can make the app log in fresh on first run:

1. The app will detect no session exists
2. It will fail with "session expired" error
3. This is expected - it means the browser automation part isn't working without a session

## Recommended: Use Method 1

Railway CLI is the most straightforward way to get your session file into the deployment.

