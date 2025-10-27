const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { URL } = require('url');

// Configuration
const STRAVA_URL = 'https://www.strava.com';
const SESSION_DIR = path.join(__dirname, 'sessions');
const ACTIVITY_DELAY = 1000; // Delay before clicking activity
const UPLOAD_TIMEOUT = 60000; // 60 seconds timeout for upload

// Random delay helper to make behavior more human-like
function randomDelay(min = 500, max = 1500) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

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
 * Upload media to latest Strava activity (single session attempt)
 * @param {string[]} mediaPaths - Array of file paths to upload
 * @returns {number} - Number of files successfully uploaded in this session
 */
async function uploadMediaToStravaSingleSession(mediaPaths) {
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
    // Navigate to a page that requires authentication to check login status
    console.log('🔍 Checking login status...');
    await page.goto(`${STRAVA_URL}/athlete/training`);

    // Wait for navigation
    await page.waitForTimeout(3000);

    let currentUrl = page.url();
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

    // Now we're logged in, let's continue with the activity feed
    console.log('📊 Connected! Looking for your activities...');

    await page.waitForTimeout(ACTIVITY_DELAY);
    
    console.log('🔎 Opening latest activity...');
    
    // Try to click the latest activity
    let clicked = false;
    
    // Find the latest activity link (skip the card selector that never works)
    // Get all links to activity details (not share buttons)
    {
      const allLinks = await page.locator('a[href*="/activities/"]').all();
      
      // Filter to find actual activity links (not Twitter/other share links)
      let latestActivityHref = null;
      for (const link of allLinks) {
        const href = await link.getAttribute('href');
        const text = await link.textContent();
        const ariaLabel = await link.getAttribute('aria-label');
        
        // Skip if it's a share button or external link
        if (!href || href.includes('twitter.com') || href.includes('facebook.com') || 
            text.trim().toLowerCase() === 'on twitter' ||
            text.trim().toLowerCase() === 'more options' ||
            ariaLabel?.toLowerCase().includes('share') ||
            ariaLabel?.toLowerCase().includes('more')) {
          continue;
        }
        
        // This looks like an actual activity link
        if (href.startsWith('/activities/') || href.startsWith('https://www.strava.com/activities/')) {
          latestActivityHref = href.startsWith('/') ? `https://www.strava.com${href}` : href;
          // Already logged above
          // Navigate directly to the activity
          await page.goto(latestActivityHref);
          clicked = true;
          break;
        }
      }
      
      if (!clicked && latestActivityHref) {
        await page.goto(latestActivityHref);
        clicked = true;
      }
    }
    
    if (!clicked) {
      console.log('❌ Could not find activity card with any selector');
      throw new Error('Could not find activity card');
    }

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
                console.log(`\n📤 Uploading file ${i + 1}/${mediaPaths.length}: ${path.basename(mediaPath)}`);
                
                try {
                  await fileInput.setInputFiles(mediaPath);
                  console.log(`✅ Queued upload for: ${path.basename(mediaPath)}`);
                  uploadedCount++;
                  
                  // Check if browser closed
                  try {
                    await page.title();
                  } catch (e) {
                    console.log(`⚠️  Browser closed after uploading ${i + 1} file(s). Stopping upload loop.`);
                    return uploadedCount; // Return count of files uploaded before browser closed
                  }
                  
                  // Wait for upload to start/complete before next file
                  if (i < mediaPaths.length - 1) {
                    await page.waitForTimeout(1000);
                  }
                } catch (e) {
                  console.log(`❌ Failed to upload: ${path.basename(mediaPath)} - ${e.message}`);
                  // If browser closed, stop
                  if (e.message.includes('closed')) {
                    console.log(`⚠️  Stopping upload loop due to browser closure.`);
                    return uploadedCount;
                  }
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
                console.log(`\n📤 Uploading file ${i + 1}/${mediaPaths.length}: ${path.basename(mediaPath)}`);
                
                try {
                  await hiddenInput.setInputFiles(mediaPath);
                  console.log(`✅ Queued upload for: ${path.basename(mediaPath)}`);
                  uploadedCount++;
                  
                  // Check if browser closed
                  try {
                    await page.title();
                  } catch (e) {
                    console.log(`⚠️  Browser closed after uploading ${i + 1} file(s). Stopping upload loop.`);
                    return uploadedCount;
                  }
                  
                  // Wait for upload to start/complete before next file
                  if (i < mediaPaths.length - 1) {
                    await page.waitForTimeout(1000);
                  }
                } catch (e) {
                  console.log(`❌ Failed to upload: ${path.basename(mediaPath)} - ${e.message}`);
                  // If browser closed, stop
                  if (e.message.includes('closed')) {
                    console.log(`⚠️  Stopping upload loop due to browser closure.`);
                    return uploadedCount;
                  }
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

    // Wait for uploads to complete (very short wait for photos)
    console.log('⏳ Verifying uploads are complete...');
    
    // Minimal wait with hard timeout to save before Browserless closes
    let uploadComplete = false;
    
    for (let attempt = 0; attempt < 10; attempt++) { // Check for up to 10 seconds max
      try {
        await page.waitForTimeout(1000);
      } catch (e) {
        if (e.message.includes('closed')) {
          console.log('⚠️  Browser closed during upload wait, proceeding to save...');
          uploadComplete = true;
          break;
        }
        throw e;
      }
      
      // Check for multiple types of upload indicators
      const selectors = [
        '[class*="uploading"]',
        '[class*="progress"]',
        '[class*="loading"]',
        '[aria-label*="upload"]',
        '[aria-label*="Uploading"]',
        '[role="progressbar"]',
        'button:has-text("Uploading")',
        'div:has-text("Uploading")',
        'div:has-text("Processing")'
      ];
      
      let hasActiveUpload = false;
      
      // Check visible indicators
      for (const selector of selectors) {
        try {
          const elements = await page.locator(selector).all();
          for (const element of elements) {
            const isVisible = await element.isVisible();
            if (isVisible) {
              const text = await element.textContent();
              // Double-check it's actually uploading/processing
              if (text?.toLowerCase().includes('upload') || 
                  text?.toLowerCase().includes('process') ||
                  text?.toLowerCase().includes('load')) {
                hasActiveUpload = true;
                console.log(`  ⏳ Detected upload activity: "${text}"`);
                break;
              }
            }
          }
          if (hasActiveUpload) break;
        } catch (e) {
          // Selector failed, continue
        }
      }
      
      // Check hard timeout FIRST (save before Browserless closes at ~64s)
      const elapsed = Date.now() - uploadStartTime;
      if (elapsed >= HARD_TIMEOUT) {
        console.log(`⚠️  Hard timeout reached (${(elapsed / 1000).toFixed(1)}s). Forcing save before Browserless closes...`);
        uploadComplete = true;
        break;
      }
      
      // Quick check - if no upload indicators for 2 seconds, assume done
      if (!hasActiveUpload && attempt > 1) {
        uploadComplete = true;
        console.log(`✅ Uploads appear complete (${attempt + 1}s verification)`);
        break;
      }
      
      // Log every 5 seconds to show progress
      if ((attempt + 1) % 5 === 0 && attempt > 0) {
        console.log(`⏳ Still uploading... (${attempt + 1}s elapsed)`);
      }
    }
    
    if (!uploadComplete) {
      console.log('⚠️  Upload loop timeout. Proceeding with caution...');
    }
    
    // Short final wait
    await page.waitForTimeout(1000);

    // Click save button
    const saveButtonSelectors = [
      'button:has-text("Save")',
      'button:has-text("Confirm")',
      'button[type="submit"]',
      '[data-cy="save"]',
      'button.btn-primary:has-text("Save")'
    ];

    let saveButtonClicked = false;
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
    }

    // Wait for save to complete (if page is still open)
    try {
      await page.waitForTimeout(1000);
    } catch (e) {
      // Browser may have closed, that's okay
      console.log('⏩ Skipping final wait (browser closed)');
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
async function uploadMediaToStrava(mediaPaths) {
  const tempDir = path.join(__dirname, 'temp');
  let remainingFiles = [...mediaPaths];
  let consecutiveNoProgress = 0;
  let totalUploaded = 0;
  let session = 0;
  
  while (remainingFiles.length > 0 && consecutiveNoProgress < 2) {
    session++;
    console.log(`\n📋 Session ${session}: ${remainingFiles.length} file(s) remaining`);
    
    try {
      // Attempt to upload in this session
      const uploadedCount = await uploadMediaToStravaSingleSession(remainingFiles);
      
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
  // Get URLs from command line arguments
  const mediaUrls = process.argv.slice(2);
  
  if (mediaUrls.length === 0) {
    console.log('❌ Please provide at least one media URL');
    console.log('Usage: node upload.js <url1> [url2] [url3] ...');
    console.log('Example: node upload.js https://example.com/photo1.jpg https://example.com/photo2.jpg');
    process.exit(1);
  }

  // Process URLs - download if needed, or pass through if already local paths
  (async () => {
    const tempDir = ensureTempDir();
    const localPaths = [];
    
    // Skip logging if already local files (server.js already downloaded)
    const isLocalFile = (path) => fs.existsSync(path);
    
    for (let i = 0; i < mediaUrls.length; i++) {
      const input = mediaUrls[i];
      let localPath;

      // Check if it's a URL (starts with http:// or https://)
      if (input.startsWith('http://') || input.startsWith('https://')) {
        console.log(`📥 Downloading ${i + 1}/${mediaUrls.length}: ${input}`);
        try {
          localPath = await downloadFile(input, tempDir);
          
          // Validate download
          const stats = fs.statSync(localPath);
          if (stats.size === 0) {
            console.error(`❌ Downloaded file is empty (0 bytes). URL may be invalid or redirect may have failed.`);
            process.exit(1);
          }
          
          console.log(`✅ Download ${i + 1}/${mediaUrls.length} successful: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);
          localPaths.push(localPath);
        } catch (error) {
          console.error(`❌ Failed to download ${i + 1}/${mediaUrls.length}: ${error.message}`);
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
    uploadMediaToStrava(localPaths)
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

