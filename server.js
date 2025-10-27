const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs');
const zlib = require('zlib');
const app = express();

// Simple flag to prevent concurrent uploads
let isProcessing = false;

const { downloadFile, ensureTempDir } = require('./upload-helpers');

const executeUpload = async (req, res) => {
  // Extract only 'urls' from body - ignore any other fields
  const { urls } = req.body;
  
  // Validate that urls array exists and has at least one URL
  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    isProcessing = false;
    return res.status(400).json({ 
      error: 'URLs array required',
      example: { urls: ["https://example.com/image.jpg"] }
    });
  }

  console.log(`\n📦 Downloading ${urls.length} file(s)...`);
  
  // Download files first
  const tempDir = ensureTempDir();
  const localPaths = [];
  
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    console.log(`📥 Downloading ${i + 1}/${urls.length}: ${url}`);
    
    try {
      const localPath = await downloadFile(url, tempDir);
      const stats = require('fs').statSync(localPath);
      
      if (stats.size === 0) {
        console.error(`❌ Downloaded file is empty (0 bytes). URL may be invalid or redirect may have failed.`);
        isProcessing = false;
        return res.status(400).json({ error: `Download failed for file ${i + 1}` });
      }
      
      console.log(`✅ Download ${i + 1}/${urls.length} successful: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);
      localPaths.push(localPath);
    } catch (error) {
      console.error(`❌ Failed to download ${i + 1}/${urls.length}: ${error.message}`);
      isProcessing = false;
      return res.status(400).json({ error: `Download failed for file ${i + 1}`, details: error.message });
    }
  }
  
  console.log(`✅ All files downloaded successfully! Returning response to Make.com...`);
  
  // Return success to Make.com immediately
  res.json({ 
    success: true,
    message: 'Files downloaded, uploading to Strava in background',
    filesDownloaded: urls.length
  });
  
  // Now continue browser automation in background
  console.log(`🔄 Continuing upload to Strava in background...`);
  
  const child = spawn('node', ['upload.js', ...localPaths], {
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  
  // Forward output to Railway logs
  child.stdout.on('data', (data) => {
    process.stdout.write(data.toString());
  });
  
  child.stderr.on('data', (data) => {
    process.stderr.write(data.toString());
  });
  
  child.on('close', (code) => {
    isProcessing = false;
    if (code === 0) {
      console.log('✅ Strava upload complete');
    } else {
      console.error('❌ Strava upload failed');
    }
  });
};

// Use Express JSON parser
app.use(express.json({
  limit: '50mb'
}));

// Error handler for JSON parse errors  
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    console.error('❌ JSON Parse Error:', err.message);
    console.error('Error object:', JSON.stringify(err, Object.getOwnPropertyNames(err)));
    return res.status(400).json({ 
      error: 'Invalid JSON format',
      details: err.message
    });
  }
  next();
});

// Health check
app.get('/', (req, res) => {
  res.json({ 
    status: 'online', 
    service: 'Strava Media Uploader',
    endpoints: {
      upload: '/upload',
      health: '/health'
    }
  });
});

// Health check with more details
app.get('/health', (req, res) => {
  const hasBrowserless = !!process.env.BROWSERLESS_WS_ENDPOINT;
  const hasSession = fs.existsSync('/sessions/state.json') || fs.existsSync('./sessions/state.json');
  
  res.json({ 
    status: 'healthy',
    session_file_exists: hasSession,
    browserless_configured: hasBrowserless,
    environment: process.env.NODE_ENV || 'development'
  });
});

// Upload endpoint for Make.com webhooks
app.post('/upload', (req, res) => {
  const { urls } = req.body;
  
  // If processing, reject immediately (don't queue)
  if (isProcessing) {
    console.log(`❌ Request rejected - already processing another upload`);
    return res.status(409).json({ 
      error: 'Server busy - another upload is in progress',
      details: 'Please wait for the current upload to complete before sending another request'
    });
  }
  
  console.log(`📥 Received request for ${urls.length} media file(s)`);
  
  // Process immediately
  executeUpload(req, res);
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Make.com webhook: http://your-url/upload`);
  console.log(`🔑 Make.com should POST: { "urls": ["https://example.com/image.jpg"] }`);
});

