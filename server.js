const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const app = express();

app.use(express.json());

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

