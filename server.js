const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const zlib = require('zlib');
const app = express();

// Simple queue to process uploads one at a time
let isProcessing = false;
let requestQueue = [];

const processNextInQueue = () => {
  if (isProcessing || requestQueue.length === 0) {
    return;
  }

  isProcessing = true;
  const { req, res } = requestQueue.shift();
  
  console.log(`📥 Processing queued request (${requestQueue.length} in queue)`);
  executeUpload(req, res);
};

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

  console.log(`📥 Received ${urls.length} media URLs from Make.com`);
  
  // Build command with URL args
  const urlArgs = urls.map(url => `"${url}"`).join(' ');
  const cmd = `node upload.js ${urlArgs}`;
  
  console.log(`🚀 Executing: ${cmd}`);
  
  exec(cmd, { 
    env: process.env,
    maxBuffer: 10 * 1024 * 1024 // 10MB buffer for large files
  }, (error, stdout, stderr) => {
    isProcessing = false; // Mark as done
    
    if (error) {
      console.error('❌ Error:', error);
      return res.status(500).json({ 
        error: error.message, 
        stderr,
        stdout
      });
    }
    
    console.log('✅ Upload successful');
    res.json({ 
      success: true, 
      output: stdout,
      urls: urls.length
    });
    
    // Process next in queue
    processNextInQueue();
  });
};

// Use Express JSON parser (handles compression automatically)
app.use(express.json({
  limit: '50mb'
}));

// Error handler for JSON parse errors
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    console.error('❌ JSON Parse Error:', err.message);
    console.error('Request body preview:', req.body?.toString().substring(0, 500));
    return res.status(400).json({ 
      error: 'Invalid JSON format',
      details: err.message,
      hint: 'Check for special characters or malformed JSON'
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
  console.log('📥 Received request body:', JSON.stringify(req.body, null, 2));
  
  // If processing, add to queue
  if (isProcessing) {
    console.log(`⏳ Request queued (position: ${requestQueue.length + 1})`);
    requestQueue.push({ req, res });
    return;
  }
  
  // Process immediately
  executeUpload(req, res);
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Make.com webhook: http://your-url/upload`);
  console.log(`🔑 Make.com should POST: { "urls": ["https://example.com/image.jpg"] }`);
});

