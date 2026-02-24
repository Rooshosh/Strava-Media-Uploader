const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { URL } = require('url');

// Configuration
const STRAVA_URL = 'https://www.strava.com';
const SESSION_DIR = path.join(__dirname, 'sessions');
/**
 * Ensure sessions directory exists
 */
function ensureSessionDir() {
  if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
  }
}

/**
 * Download a file from a URL to a local path
 */
function downloadFile(url, outputPath, redirectCount = 0, originalFileName = null) {
  return new Promise((resolve, reject) => {
    // Prevent infinite redirects
    if (redirectCount > 5) {
      reject(new Error('Too many redirects'));
      return;
    }

    // Remove fragment from URL (e.g., # at the end)
    const cleanUrl = url.split('#')[0];
    
    const protocol = cleanUrl.startsWith('https') ? https : http;
    
    // Use original filename if we have it, otherwise try to extract from URL
    let fileName = originalFileName;
    if (!fileName) {
      try {
        const urlObj = new URL(cleanUrl);
        fileName = path.basename(urlObj.pathname) || 'download';
        // If we got a real filename (not just 'download' or '/'), use it as the original
        if (fileName && fileName !== 'download' && fileName !== '/') {
          originalFileName = fileName;
        }
      } catch (e) {
        fileName = 'download';
      }
    }
    
    const outputFilePath = path.join(outputPath, fileName);

    const file = fs.createWriteStream(outputFilePath);
    
    protocol.get(cleanUrl, (response) => {
      // Follow redirects (301, 302, 303, 307, 308)
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.destroy(); // Close the stream before redirecting
        fs.unlink(outputFilePath, () => {}); // Delete the incomplete file
        // Pass the original filename through redirects
        return downloadFile(response.headers.location, outputPath, redirectCount + 1, originalFileName)
          .then(resolve)
          .catch(reject);
      }
      
      // Check content type to avoid downloading HTML preview pages
      const contentType = response.headers['content-type'];
      if (contentType && contentType.includes('text/html')) {
        file.destroy();
        fs.unlink(outputFilePath, () => {});
        reject(new Error('Got HTML instead of file - link may be broken or require authentication'));
        return;
      }
      
      if (response.statusCode !== 200) {
        file.destroy();
        reject(new Error(`Failed to download: ${response.statusCode} ${response.statusMessage}`));
        return;
      }

      response.pipe(file);

      file.on('finish', () => {
        file.close(() => {
          const stats = fs.statSync(outputFilePath);
          console.log(`📥 Downloaded: ${fileName} (${(stats.size / 1024).toFixed(1)}KB)`);
          resolve(outputFilePath);
        });
      });

      file.on('error', (err) => {
        fs.unlink(outputFilePath, () => {});
        reject(err);
      });
    }).on('error', (err) => {
      file.destroy();
      fs.unlink(outputFilePath, () => {}); // Delete incomplete file
      reject(err);
    });
  });
}

/**
 * Ensure temp directory exists
 */
function ensureTempDir() {
  const tempDir = path.join(__dirname, 'temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  return tempDir;
}

/**
 * Normalize/validate activity input (ID or full URL)
 */
function parseActivityInput(activityInput) {
  if (!activityInput || typeof activityInput !== 'string') {
    throw new Error('Target activity is required (activity ID or full Strava activity URL).');
  }

  const trimmed = activityInput.trim();

  // Numeric ID
  if (/^\d+$/.test(trimmed)) {
    return {
      activityId: trimmed,
      activityUrl: `${STRAVA_URL}/activities/${trimmed}`
    };
  }

  // Full URL
  try {
    const parsed = new URL(trimmed);
    const hostname = parsed.hostname.toLowerCase();

    if (!hostname.includes('strava.com')) {
      throw new Error('Activity URL must be a strava.com link.');
    }

    const match = parsed.pathname.match(/^\/activities\/(\d+)(?:\/.*)?$/);
    if (!match) {
      throw new Error('Activity URL must look like https://www.strava.com/activities/<id>');
    }

    const activityId = match[1];
    return {
      activityId,
      activityUrl: `${STRAVA_URL}/activities/${activityId}`
    };
  } catch (error) {
    if (error.message.includes('strava.com') || error.message.includes('/activities/')) {
      throw error;
    }
    throw new Error('Invalid activity value. Provide an activity ID or full Strava activity URL.');
  }
}

/**
 * Parse CLI arguments
 */
function parseCliArguments(argv) {
  const mediaInputs = [];
  let activityArg;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--activity' || arg === '-a') {
      activityArg = argv[i + 1];
      i++;
      continue;
    }

    mediaInputs.push(arg);
  }

  if (!activityArg) {
    throw new Error('Missing required --activity argument (activity ID or URL).');
  }

  if (mediaInputs.length === 0) {
    throw new Error('Please provide at least one media URL or local file path.');
  }

  return {
    activity: parseActivityInput(activityArg),
    mediaInputs
  };
}

/**
 * Upload media to specified Strava activity (single session attempt)
 * @param {{activityId: string, activityUrl: string}} activity - Activity target
 * @param {string[]} mediaPaths - Array of file paths to upload
 * @returns {number} - Number of files successfully uploaded in this session
 */
async function uploadMediaToStravaSingleSession(activity, mediaPaths) {
  let uploadedCount = 0; // Track files uploaded in this session
  
  // Ensure sessions directory exists
  ensureSessionDir();

  // Configuration from environment variables or defaults
  const useBrowserless = process.env.BROWSERLESS_WS_ENDPOINT || false;
  const isHeadless = process.env.HEADLESS === 'true' || useBrowserless;

  // Get session data from environment variable or file
  let sessionData;
  
  // Try environment variable first (for cloud deployment)
  if (process.env.SESSION_DATA) {
    try {
      const decoded = Buffer.from(process.env.SESSION_DATA, 'base64').toString('utf-8');
      sessionData = JSON.parse(decoded);
      console.log('✅ Session loaded from environment variable');
    } catch (e) {
      console.log('⚠️  Failed to parse SESSION_DATA, trying file system...');
    }
  }
  
  // Fall back to file system (for local development and Railway volumes)
  // Check volume mount path first (/sessions), then relative path
  const volumePath = '/sessions/state.json';
  if (!sessionData && fs.existsSync(volumePath)) {
    sessionData = JSON.parse(fs.readFileSync(volumePath, 'utf8'));
    console.log('✅ Session loaded from volume');
  } else if (!sessionData && fs.existsSync(path.join(SESSION_DIR, 'state.json'))) {
    sessionData = JSON.parse(fs.readFileSync(path.join(SESSION_DIR, 'state.json'), 'utf8'));
    console.log('✅ Session loaded from relative path');
  }

  // Start timer for Browserless timeout tracking
  const uploadStartTime = Date.now();
  const HARD_TIMEOUT = 50000; // 50 seconds to save before Browserless closes at ~64s (14s safety margin)
  
  // Launch browser - either locally or via Browserless.io
  console.log('🔗 Starting browser session (50s timeout)...');
  let browser;
  if (useBrowserless) {
    browser = await chromium.connect(useBrowserless);
  } else {
    browser = await chromium.launch({
      headless: isHeadless,
      slowMo: isHeadless ? 0 : 500 // Slow down only in visible mode
    });
  }

  const context = await browser.newContext({
    // Store session data
    storageState: sessionData || undefined,
    // Anti-detection measures
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'en-US',
    timezoneId: 'America/New_York'
  });

  const page = await context.newPage();

  try {
    // Navigate directly to the requested activity
    console.log(`🔍 Opening target activity ${activity.activityId}...`);
    await page.goto(activity.activityUrl, { waitUntil: 'domcontentloaded' });

    // Wait for navigation
    await page.waitForTimeout(3000);

    const currentUrl = page.url();
    console.log(`📍 Current URL: ${currentUrl}`);

    // If we're redirected to login, session has expired or was invalid
    if (currentUrl.includes('login')) {
      console.log('❌ Not logged in. Session expired or invalid.');
      console.log('');
      console.log('🔧 For initial setup (interactive):');
      console.log('   Run the script locally with a browser and log in manually');
      console.log('   After login, your session will be saved');
      console.log('');
      console.log('🔧 For cloud/production (automated):');
      console.log('   Session must be set up first');
      console.log('   If this error occurs in production, session has expired');
      console.log('   You need to re-authenticate or refresh your session');
      console.log('');

      await browser.close();
      throw new Error('Authentication required - session expired or invalid');
    }

    if (!currentUrl.includes(`/activities/${activity.activityId}`)) {
      throw new Error(`Failed to open target activity ${activity.activityId}. Landed on: ${currentUrl}`);
    }

    console.log(`✅ Connected and on target activity ${activity.activityId}`);

    // Wait for activity detail page to load
    await page.waitForTimeout(1500);

    // Click edit button
    
    // Try multiple possible selectors for the edit button
    // Priority: pencil icon button, then text-based buttons
    const editButtonSelectors = [
      'button[title*="Edit"], button[aria-label*="Edit"]',  // Pencil icon buttons
      'button svg[class*="pencil"], button svg[class*="edit"]',  // Buttons with pencil SVG
      'a[href*="/edit"]',  // Edit link
      'button:has-text("Edit")',
      '[aria-label="Edit activity"]',
      'button[class*="edit"]'
    ];

    let editButtonClicked = false;
    for (const selector of editButtonSelectors) {
      try {
        const editButtons = await page.locator(selector).all();
        for (const editButton of editButtons) {
          if (await editButton.isVisible({ timeout: 1000 })) {
            // Check if it's not the "more options" menu button
            const text = await editButton.textContent();
            const ariaLabel = await editButton.getAttribute('aria-label');
            
            // Skip if it's a "more options" menu
            if (text?.includes('More') || ariaLabel?.includes('More')) {
              continue;
            }
            
              await editButton.click();
              editButtonClicked = true;
              console.log(`✅ Clicked edit button`);
              break;
          }
        }
        if (editButtonClicked) break;
      } catch (e) {
        // Try next selector
      }
    }

    if (!editButtonClicked) {
      console.log('⚠️  Edit button not found automatically. Please click the PENCIL icon manually in the browser.');
      await page.waitForTimeout(5000);
    }

    // Wait for edit form to load
    await page.waitForTimeout(1000);
    
    // Look for photo upload input
    // Upload photos
    
    const fileInputSelectors = [
      'input[type="file"]',
      'input[accept*="image"]',
      'input[accept*="video"]',
      '[data-cy="upload-photo"]',
      'button[aria-label*="photo"]'
    ];

    let uploadButtonFound = false;
    for (const selector of fileInputSelectors) {
      try {
        const fileInput = await page.locator(selector).first();
        if (await fileInput.isVisible({ timeout: 3000 })) {
          // Check if it's an input[type="file"]
          const tagName = await fileInput.evaluate(el => el.tagName.toLowerCase());
          
          if (tagName === 'input') {
            // It's a file input
            console.log(`📤 Uploading ${mediaPaths.length} file(s) to Strava:`);
            mediaPaths.forEach((p, i) => {
              console.log(`   ${i + 1}. ${path.basename(p)} (${(fs.statSync(p).size / 1024 / 1024).toFixed(2)}MB)`);
            });
            
              // Upload files one at a time - Strava seems to only accept one at a time
              for (let i = 0; i < mediaPaths.length; i++) {
                const mediaPath = mediaPaths[i];
                
                // Check time remaining - if less than 10s, save what we have NOW
                const elapsed = Date.now() - uploadStartTime;
                if (elapsed > HARD_TIMEOUT - 10000 && uploadedCount > 0) {
                  console.log(`⚠️  Approaching timeout (${Math.floor(elapsed/1000)}s), saving ${uploadedCount} file(s) now to avoid data loss...`);
                  // Break immediately and go to save
                  break;
                }
                
                console.log(`\n📤 Uploading file ${i + 1}/${mediaPaths.length}: ${path.basename(mediaPath)}`);
                
                try {
                  await fileInput.setInputFiles(mediaPath);
                  console.log(`✅ Queued upload for: ${path.basename(mediaPath)}`);
                  uploadedCount++;
                  
                  // Check if browser closed
                  try {
                    await page.title();
                  } catch (e) {
                    console.log(`⚠️  Browser closed after uploading ${i + 1} file(s). Cannot save - browser already closed.`);
                    console.log(`⚠️  Returned 0 - files will be retried in next session as they were not saved.`);
                    return 0; // Don't count these - they weren't saved!
                  }
                  
                  // Wait for upload to start/complete before next file
                  if (i < mediaPaths.length - 1) {
                    await page.waitForTimeout(1000); // Reduced to 1s for speed
                  }
                } catch (e) {
                  console.log(`❌ Failed to upload: ${path.basename(mediaPath)} - ${e.message}`);
                  // If browser closed, we can't save
                  if (e.message.includes('closed')) {
                    console.log(`❌ Browser closed during upload. ${uploadedCount} file(s) already queued but NOT saved.`);
                    console.log(`⚠️  Returned 0 - files will be retried in next session as they were not saved.`);
                    return 0; // Don't count these - they weren't saved!
                  }
                  // For other errors, continue
                  uploadedCount--; // Don't count failed uploads
                }
              }
            uploadButtonFound = true;
            console.log('✅ All files queued for upload to Strava...');
            break;
          } else {
            // It's a button, click it to reveal file input
            await fileInput.click();
            await page.waitForTimeout(500);
            
            // Now look for the actual file input
            const hiddenInput = await page.locator('input[type="file"]').first();
            if (await hiddenInput.isVisible({ timeout: 2000 })) {
              console.log(`📤 Uploading ${mediaPaths.length} file(s) to Strava:`);
              mediaPaths.forEach((p, i) => {
                console.log(`   ${i + 1}. ${path.basename(p)} (${(fs.statSync(p).size / 1024 / 1024).toFixed(2)}MB)`);
              });
              
              // Upload files one at a time - Strava seems to only accept one at a time
              for (let i = 0; i < mediaPaths.length; i++) {
                const mediaPath = mediaPaths[i];
                
                // Check time remaining - if less than 10s, save what we have NOW
                const elapsed = Date.now() - uploadStartTime;
                if (elapsed > HARD_TIMEOUT - 10000 && uploadedCount > 0) {
                  console.log(`⚠️  Approaching timeout (${Math.floor(elapsed/1000)}s), saving ${uploadedCount} file(s) now to avoid data loss...`);
                  // Break immediately and go to save
                  break;
                }
                
                console.log(`\n📤 Uploading file ${i + 1}/${mediaPaths.length}: ${path.basename(mediaPath)}`);
                
                try {
                  await hiddenInput.setInputFiles(mediaPath);
                  console.log(`✅ Queued upload for: ${path.basename(mediaPath)}`);
                  uploadedCount++;
                  
                  // Check if browser closed
                  try {
                    await page.title();
                  } catch (e) {
                    console.log(`⚠️  Browser closed after uploading ${i + 1} file(s). Cannot save - browser already closed.`);
                    console.log(`⚠️  Returned 0 - files will be retried in next session as they were not saved.`);
                    return 0; // Don't count these - they weren't saved!
                  }
                  
                  // Wait for upload to start/complete before next file
                  if (i < mediaPaths.length - 1) {
                    await page.waitForTimeout(1000); // Reduced to 1s for speed
                  }
                } catch (e) {
                  console.log(`❌ Failed to upload: ${path.basename(mediaPath)} - ${e.message}`);
                  // If browser closed, we can't save
                  if (e.message.includes('closed')) {
                    console.log(`❌ Browser closed during upload. ${uploadedCount} file(s) already queued but NOT saved.`);
                    console.log(`⚠️  Returned 0 - files will be retried in next session as they were not saved.`);
                    return 0; // Don't count these - they weren't saved!
                  }
                  // For other errors, continue
                  uploadedCount--; // Don't count failed uploads
                }
              }
              
              uploadButtonFound = true;
              console.log('✅ All files queued for upload to Strava...');
              break;
            }
          }
        }
      } catch (e) {
        // Try next selector
      }
    }

    if (!uploadButtonFound) {
      console.log('⚠️  Upload button not found automatically. Please click it manually in the browser.');
      await page.waitForTimeout(5000);
    }

    // Give uploads just a few seconds to start, then save immediately
    console.log('⏳ Giving uploads time to start...');
    
    // Calculate remaining time before hard timeout
    const elapsedBeforeWait = Date.now() - uploadStartTime;
    const remainingTime = HARD_TIMEOUT - elapsedBeforeWait;
    const waitTime = Math.min(3000, remainingTime - 3000); // Wait max 3s, leave 3s for save
    const maxWaitAttempts = Math.max(1, Math.ceil(waitTime / 1000)); // At least 1s
    
    console.log(`⏳ Waiting ${maxWaitAttempts}s for uploads to start...`);
    
    try {
      // Just wait briefly - Strava handles uploads in background
      for (let attempt = 0; attempt < maxWaitAttempts; attempt++) {
        try {
          await page.waitForTimeout(1000);
        } catch (e) {
          if (e.message.includes('closed')) {
            console.log('⚠️  Browser closed during wait - cannot save');
            console.log(`⚠️  Returned 0 - files will be retried in next session as they were not saved.`);
            return 0; // Don't count these - they weren't saved!
          }
          throw e;
        }
        
        // Check if we've exceeded hard timeout
        const elapsed = Date.now() - uploadStartTime;
        if (elapsed >= HARD_TIMEOUT - 3000) {
          console.log(`⚠️  Running out of time (${Math.floor(elapsed/1000)}s). Saving now...`);
          break;
        }
      }
      
      console.log('✅ Uploads should be processing in background. Saving changes...');
    } catch (e) {
      if (e.message.includes('closed')) {
        console.log('⚠️  Browser closed during verification. Cannot save.');
        console.log(`⚠️  Returned 0 - files will be retried in next session as they were not saved.`);
        return 0; // Don't count these - they weren't saved!
      } else {
        throw e;
      }
    }
    
    // Minimal wait before clicking save
    await page.waitForTimeout(500);

    // Click save button (with browser closure protection)
    let saveButtonClicked = false;
    
    try {
      // Check if browser is still open - if not, can't save
      await page.title();
    } catch (e) {
      if (e.message?.includes('closed') || e.message?.includes('Target')) {
        console.log('⚠️  Browser closed before save. Cannot save.');
        console.log(`⚠️  Returned 0 - files will be retried in next session as they were not saved.`);
        return 0; // Don't count these - they weren't saved!
      }
      throw e;
    }
    
    try {
      const saveButtonSelectors = [
        'button:has-text("Save")',
        'button:has-text("Confirm")',
        'button[type="submit"]',
        '[data-cy="save"]',
        'button.btn-primary:has-text("Save")'
      ];
      for (const selector of saveButtonSelectors) {
        try {
          const saveButton = await page.locator(selector).first();
          if (await saveButton.isVisible({ timeout: 2000 })) {
            await saveButton.click();
            saveButtonClicked = true;
            console.log(`✅ Clicked save button`);
            break;
          }
        } catch (e) {
          // Try next selector
        }
      }

      if (!saveButtonClicked) {
        console.log('⚠️  Save button not found automatically. Please click it manually in the browser.');
        await page.waitForTimeout(5000);
      } else {
        // Wait for save to complete (if page is still open)
        try {
          await page.waitForTimeout(1000);
        } catch (e) {
          // Browser may have closed, that's okay
          console.log('⏩ Skipping final wait (browser closed)');
        }
      }
    } catch (error) {
      if (error.message?.includes('closed') || error.message?.includes('Target')) {
        console.log('⚠️  Browser closed during save. Changes may not be saved.');
        console.log(`⚠️  Returned 0 - files will be retried in next session as they were not saved.`);
        return 0; // Don't count these - they weren't saved!
      } else {
        throw error;
      }
    }
    
    // CRITICAL: Only return uploadedCount if we actually clicked save!
    // If save button was never clicked, files were not saved and should be retried
    if (!saveButtonClicked) {
      console.log('⚠️  Save button was never clicked. Returned 0 - files will be retried.');
      return 0;
    }

    // Save the session state (only if not using Browserless.io)
    if (!useBrowserless) {
      try {
        await context.storageState({ path: path.join(SESSION_DIR, 'state.json') });
        console.log('✅ Session saved successfully!');
      } catch (e) {
        console.log('⚠️  Could not save session (browser may have closed)');
      }
    } else {
      console.log('✅ Upload complete! (session managed by Browserless.io)');
    }

    console.log('✅ Upload complete!');
    
    // Return number of files successfully uploaded
    return uploadedCount || mediaPaths.length;

  } catch (error) {
    console.error('❌ Error during upload:', error);
    throw error;
  } finally {
    // Close browser for automation/headless, keep open for local debugging
    if (isHeadless || useBrowserless) {
      await browser.close();
      console.log('🔒 Browser closed (automation mode)');
    } else {
      console.log('💡 Browser remains open for inspection. Close it when done.');
      // Uncomment to auto-close: await browser.close();
    }
  }
}

/**
 * Upload media with automatic retry when browser times out
 * Handles chunking by continuing in new sessions
 * @param {string[]} mediaPaths - Array of file paths to upload
 */
async function uploadMediaToStrava(activity, mediaPaths) {
  let remainingFiles = [...mediaPaths];
  let consecutiveNoProgress = 0;
  let totalUploaded = 0;
  let session = 0;
  
  while (remainingFiles.length > 0 && consecutiveNoProgress < 2) {
    session++;
    console.log(`\n📋 Session ${session}: ${remainingFiles.length} file(s) remaining`);
    
    try {
      // Attempt to upload in this session
      const uploadedCount = await uploadMediaToStravaSingleSession(activity, remainingFiles);
      
      if (uploadedCount === 0) {
        consecutiveNoProgress++;
        console.log(`⚠️  No progress in session ${session}. Consecutive failures: ${consecutiveNoProgress}/2`);
      } else {
        consecutiveNoProgress = 0; // Reset counter on success
        totalUploaded += uploadedCount;
        
        // Wait for uploads to complete and save changes before browser closes
        console.log(`✅ Session ${session} complete: ${uploadedCount} file(s) uploaded. Waiting 2s for save...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Remove uploaded files from remaining list
        remainingFiles = remainingFiles.slice(uploadedCount);
        
        // If there are still files remaining, wait before next session
        if (remainingFiles.length > 0) {
          console.log(`⏳ Waiting 30s before next session (${remainingFiles.length} file(s) remaining)...`);
          await new Promise(resolve => setTimeout(resolve, 30000));
        }
      }
    } catch (error) {
      console.error(`❌ Session ${session} failed:`, error.message);
      consecutiveNoProgress++;
      
      if (consecutiveNoProgress >= 2) {
        console.log(`⚠️  Stopping after ${consecutiveNoProgress} consecutive failures`);
        break;
      }
      
      // Wait before retrying
      console.log(`⏳ Waiting 30s before retry...`);
      await new Promise(resolve => setTimeout(resolve, 30000));
    }
  }
  
  if (remainingFiles.length === 0) {
    console.log(`\n✅ All ${totalUploaded} file(s) uploaded successfully!`);
  } else {
    console.log(`\n⚠️  Incomplete: ${totalUploaded} of ${mediaPaths.length} file(s) uploaded. ${remainingFiles.length} remaining.`);
  }
}

// Main execution
if (require.main === module) {
  const usageText = [
    'Usage: node upload.js --activity <activity-id-or-url> <media1> [media2] [media3] ...',
    'Example (ID): node upload.js --activity 123456789 https://example.com/photo1.jpg',
    'Example (URL): node upload.js --activity https://www.strava.com/activities/123456789 ./photo.jpg'
  ].join('\n');

  let parsedArgs;
  try {
    parsedArgs = parseCliArguments(process.argv.slice(2));
  } catch (error) {
    console.error(`❌ ${error.message}`);
    console.log(usageText);
    process.exit(1);
  }

  const { activity, mediaInputs } = parsedArgs;

  // Process media inputs - download if needed, or pass through if already local paths
  (async () => {
    const tempDir = ensureTempDir();
    const localPaths = [];
    
    for (let i = 0; i < mediaInputs.length; i++) {
      const input = mediaInputs[i];
      let localPath;

      // Check if it's a URL (starts with http:// or https://)
      if (input.startsWith('http://') || input.startsWith('https://')) {
        console.log(`📥 Downloading ${i + 1}/${mediaInputs.length}: ${input}`);
        try {
          localPath = await downloadFile(input, tempDir);
          
          // Validate download
          const stats = fs.statSync(localPath);
          if (stats.size === 0) {
            console.error(`❌ Downloaded file is empty (0 bytes). URL may be invalid or redirect may have failed.`);
            process.exit(1);
          }
          
          console.log(`✅ Download ${i + 1}/${mediaInputs.length} successful: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);
          localPaths.push(localPath);
        } catch (error) {
          console.error(`❌ Failed to download ${i + 1}/${mediaInputs.length}: ${error.message}`);
          process.exit(1);
        }
      } else {
        // Treat as local file path (already downloaded by server.js)
        if (!fs.existsSync(input)) {
          console.error(`❌ File not found: ${input}`);
          process.exit(1);
        }
        const stats = fs.statSync(input);
        if (stats.size === 0) {
          console.error(`❌ File is empty (0 bytes): ${input}`);
          process.exit(1);
        }
        // Don't log - server.js already logged it
        localPaths.push(input);
      }
    }

    // Upload to Strava
    uploadMediaToStrava(activity, localPaths)
      .then(() => {
        console.log('🎉 Script completed successfully!');
        
        // Clean up downloaded files
        if (tempDir.includes('temp')) {
          console.log('🧹 Cleaning up temporary files...');
          localPaths.forEach(filePath => {
            if (filePath.includes('temp')) {
              try {
                fs.unlinkSync(filePath);
              } catch (e) {
                // Ignore errors
              }
            }
          });
        }
        
        process.exit(0);
      })
      .catch((error) => {
        console.error('💥 Script failed:', error);
        process.exit(1);
      });
  })();
}

module.exports = { uploadMediaToStrava };


