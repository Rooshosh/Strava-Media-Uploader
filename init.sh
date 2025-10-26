#!/bin/bash

# Create sessions directory if it doesn't exist
mkdir -p sessions

# Check if sessions/state.json exists
if [ ! -f "sessions/state.json" ]; then
    echo "⚠️  Session file not found at sessions/state.json"
    echo "Please upload it via Railway dashboard or CLI"
fi

# Start the server
node server.js

