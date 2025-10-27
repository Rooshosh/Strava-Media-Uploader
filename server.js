const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const app = express();

// Handle compressed requests from Make.com
app.use(express.raw({
  type: 'application/json',
  limit: '50mb',
  inflate: true
}));

// Custom JSON parser with error handling
app.use((req, res, next) => {
  // If body is buffer (from raw), parse it as JSON
  if (Buffer.isBuffer(req.body)) {
    try {
      const jsonString = req.body.toString('utf8');
      req.body = JSON.parse(jsonString);
      console.log('📥 Received request:', JSON.stringify(req.body, null, 2));
    } catch (e) {
      console.error('❌ JSON Parse Error:', e.message);
      const bodyStr = req.body.toString('utf8');
      console.error('Body length:', bodyStr.length);
      console.error('First 300 chars:', bodyStr.substring(0, 300));
      const posMatch = e.message.match(/position (\d+)/);
      if (posMatch) {
        const pos = parseInt(posMatch[1]);
        console.error('Chars around position', pos, ':', bodyStr.substring(Math.max(0, pos - 20), pos + 20));
      }
      
      return res.status(400).json({ 
        error: 'Invalid JSON format',
        details: e.message,
        bodyLength: bodyStr.length
      });
    }
  }
  next();
});

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
  console.log('📥 Received request:', JSON.stringify(req.body, null, 2));
  
  // Extract only 'urls' from body - ignore any other fields
  const { urls } = req.body;
  
  // Validate that urls array exists and has at least one URL
  if (!urls || !Array.isArray(urls) || urls.length === 0) {
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
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Make.com webhook: http://your-url/upload`);
  console.log(`🔑 Make.com should POST: { "urls": ["https://example.com/image.jpg"] }`);
});

