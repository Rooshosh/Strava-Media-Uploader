# How to Upload Session File to Railway

## The Problem
Railway doesn't have a UI file upload button. You need to SSH into your deployment.

## Method: SSH into Railway

### Step 1: SSH into your service
```bash
railway ssh
```

This opens a shell in your running Railway container.

### Step 2: Create sessions directory
```bash
mkdir -p sessions
cd sessions
```

### Step 3: Create the session file
```bash
cat > state.json << 'EOF'
# Paste your entire sessions/state.json content here
# Copy everything from your local sessions/state.json file
EOF
```

**OR** use nano:
```bash
nano state.json
# Paste content, Ctrl+X, Y, Enter to save
```

### Step 4: Exit
```bash
exit
```

### Step 5: Restart your service
Go to Railway dashboard → Redeploy

## Alternative: Store in Environment Variable

If SSH is difficult, we can store the session as a base64-encoded environment variable:

```bash
# On your local machine, encode the file:
base64 -i sessions/state.json > session_b64.txt
```

Then add to Railway as environment variable `SESSION_DATA` and decode it on startup.

## Recommended: Use SSH Method
This is the most straightforward and secure method.

