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

  // Build command with URL args
  const urlArgs = urls.map(url => `"${url}"`).join(' ');
  const cmd = `node upload.js ${urlArgs}`;
  
  console.log(`🚀 Starting upload (${urls.length} file(s))...`);
  
  exec(cmd, { 
    env: process.env,
    maxBuffer: 10 * 1024 * 1024 // 10MB buffer for large files
  }, (error, stdout, stderr) => {
    isProcessing = false; // Mark as done
    
    if (error) {
      console.error('❌ Upload failed');
      console.error(stderr);
      return res.status(500).json({ 
        error: error.message, 
        stderr,
        stdout
      });
    }
    
    console.log('✅ Upload complete');
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
  limit: '50mb',
  verify: (req, res, buf, encoding) => {
    // Store raw body for error debugging
    req.rawBody = buf.toString(encoding || 'utf8');
  }
}));

// Error handler for JSON parse errors
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    console.error('❌ JSON Parse Error:', err.message);
    if (req.rawBody) {
      const bodyStr = req.rawBody.toString('utf8');
      console.error('Raw request body length:', bodyStr.length);
      console.error('First 500 chars:', bodyStr.substring(0, 500));
      
      // Try to find where the error is
      const posMatch = err.message.match(/position (\d+)/);
      if (posMatch) {
        const pos = parseInt(posMatch[1]);
        console.error(`Char at position ${pos}:`, JSON.stringify(bodyStr.charAt(pos)));
        console.error('Context:', bodyStr.substring(Math.max(0, pos - 30), pos + 30));
      }
    }
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
  
  // If processing, add to queue
  if (isProcessing) {
    console.log(`⏳ Request queued (${requestQueue.length + 1} waiting, ${urls.length} URL(s))`);
    requestQueue.push({ req, res });
    return;
  }
  
  console.log(`📥 New request (${urls.length} URL(s))`);
  
  // Process immediately
  executeUpload(req, res);
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Make.com webhook: http://your-url/upload`);
  console.log(`🔑 Make.com should POST: { "urls": ["https://example.com/image.jpg"] }`);
});

