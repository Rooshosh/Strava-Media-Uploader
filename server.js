const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs');
const zlib = require('zlib');
const app = express();

// Simple flag to prevent concurrent uploads
let isProcessing = false;

const executeUpload = (req, res) => {
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

  // Build command with URL args
  const urlArgs = urls.map(url => `"${url}"`).join(' ');
  
  console.log(`\n🚀 Starting media upload for ${urls.length} file(s)...`);
  
  // Use spawn to stream output in real-time to Railway logs
  const child = spawn('node', ['upload.js', ...urls], {
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'] // stdin: ignore, stdout: pipe, stderr: pipe
  });
  
  let stdout = '';
  let stderr = '';
  
  // Forward stdout to parent (visible in Railway logs)
  child.stdout.on('data', (data) => {
    const output = data.toString();
    stdout += output;
    process.stdout.write(output); // Write to Railway logs
  });
  
  // Forward stderr to parent (visible in Railway logs)
  child.stderr.on('data', (data) => {
    const output = data.toString();
    stderr += output;
    process.stderr.write(output); // Write to Railway logs
  });
  
  child.on('close', (code) => {
    isProcessing = false; // Mark as done
    
    if (code !== 0) {
      console.error('❌ Upload failed');
      res.status(500).json({ 
        error: `Process exited with code ${code}`, 
        stderr,
        stdout
      });
    } else {
      console.log('✅ Upload complete');
      res.json({ 
        success: true, 
        output: stdout,
        urls: urls.length
      });
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

