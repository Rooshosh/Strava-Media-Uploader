const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// Configuration
const STRAVA_URL = 'https://www.strava.com';
const SESSION_DIR = path.join(__dirname, 'sessions');
const ACTIVITY_DELAY = 2000; // Delay before clicking activity
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
 * Upload media to latest Strava activity
 * @param {string[]} mediaPaths - Array of file paths to upload
 */
async function uploadMediaToStrava(mediaPaths) {
  console.log('🚀 Starting Strava media upload...');
  console.log(`📁 Media files: ${mediaPaths.join(', ')}`);

  // Ensure sessions directory exists
  ensureSessionDir();

  // Configuration from environment variables or defaults
  const useBrowserless = process.env.BROWSERLESS_WS_ENDPOINT || false;
  const isHeadless = process.env.HEADLESS === 'true' || useBrowserless;
  
  console.log(`🖥️  Mode: ${useBrowserless ? 'Browserless.io' : 'Local browser'}`);
  console.log(`👁️  Browser: ${isHeadless ? 'Headless' : 'Visible'}`);

  // Launch browser - either locally or via Browserless.io
  let browser;
  if (useBrowserless) {
    console.log('🔗 Connecting to Browserless.io...');
    browser = await chromium.connect(useBrowserless);
  } else {
    browser = await chromium.launch({
      headless: isHeadless,
      slowMo: isHeadless ? 0 : 500 // Slow down only in visible mode
    });
  }

  const context = await browser.newContext({
    // Store session data
    storageState: fs.existsSync(path.join(SESSION_DIR, 'state.json'))
      ? JSON.parse(fs.readFileSync(path.join(SESSION_DIR, 'state.json'), 'utf8'))
      : undefined,
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

    // Wait for activities to load
    await page.waitForSelector('[data-testid="activity-card"]', { timeout: 10000 }).catch(() => {
      console.log('⚠️  Activity cards not found, trying alternative selector...');
    });

    await page.waitForTimeout(ACTIVITY_DELAY);
    
    // Get all links with href containing "activities"
    const activityLinks = await page.locator('a[href*="/activities/"]').all();
    console.log(`📋 Found ${activityLinks.length} activity links`);
    
    if (activityLinks.length > 0) {
      // Log the first few links for debugging
      for (let i = 0; i < Math.min(3, activityLinks.length); i++) {
        const href = await activityLinks[i].getAttribute('href');
        const text = await activityLinks[i].textContent();
        console.log(`  Link ${i + 1}: "${text.substring(0, 50)}" -> ${href}`);
      }
    }

    // Find the first (latest) activity card
    console.log('🔎 Finding latest activity...');
    const activityCard = await page.locator('[data-testid="activity-card"]').first();
    
    if (!(await activityCard.count())) {
      // Try alternative selectors
      const alternatives = [
        'a[href*="/activities/"]',
        '.activity-title',
        '.activity',
        '[class*="activity"]'
      ];
      
      let found = false;
      for (const selector of alternatives) {
        console.log(`🔍 Trying selector: ${selector}`);
        const elements = await page.locator(selector).first();
        if (await elements.count()) {
          console.log(`✅ Found element with selector: ${selector}`);
          await elements.click();
          found = true;
          break;
        }
      }
      
      if (!found) {
        console.log('❌ Could not find activity card with any selector');
        console.log('💡 Please inspect the page manually and share what you see');
        throw new Error('Could not find activity card');
      }
    } else {
      await activityCard.click();
    }

    // Wait for activity detail page to load
    await page.waitForTimeout(randomDelay(2000, 4000));

    // Look for edit button (pencil icon)
    console.log('✏️  Looking for edit button...');
    
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
            console.log(`✅ Found edit button with selector: ${selector}`);
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
    await page.waitForTimeout(2000);

    // Look for photo upload input
    console.log('📸 Looking for photo upload button...');
    
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
            // It's a file input, set files directly
            await fileInput.setInputFiles(mediaPaths);
            uploadButtonFound = true;
            console.log('✅ File input found, uploading files...');
            break;
          } else {
            // It's a button, click it to reveal file input
            await fileInput.click();
            await page.waitForTimeout(1000);
            
            // Now look for the actual file input
            const hiddenInput = await page.locator('input[type="file"]').first();
            if (await hiddenInput.isVisible({ timeout: 2000 })) {
              await hiddenInput.setInputFiles(mediaPaths);
              uploadButtonFound = true;
              console.log('✅ File input revealed and files uploaded');
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

    // Wait for uploads to complete
    console.log('⏳ Waiting for uploads to complete...');
    
    // Wait for upload progress indicators to disappear
    let uploadComplete = false;
    for (let attempt = 0; attempt < 60; attempt++) { // Check for up to 60 seconds
      await page.waitForTimeout(1000);
      
      // Check if upload indicators are gone
      const uploadIndicators = await page.locator('[class*="upload"], [class*="progress"], [class*="loading"]').all();
      
      let hasActiveUpload = false;
      for (const indicator of uploadIndicators) {
        const isVisible = await indicator.isVisible();
        const text = await indicator.textContent();
        
        // Check for upload-related text
        if (isVisible && (text?.includes('uploading') || text?.includes('processing'))) {
          hasActiveUpload = true;
          break;
        }
      }
      
      if (!hasActiveUpload && attempt > 2) { // Wait at least 3 seconds
        uploadComplete = true;
        console.log('✅ Upload appears to be complete');
        break;
      }
      
      if (attempt === 10 || attempt === 30) {
        console.log(`⏳ Still uploading... (${attempt + 1}s elapsed)`);
      }
    }
    
    if (!uploadComplete) {
      console.log('⚠️  Upload timeout or still processing. Proceeding...');
    }
    
    // Give it a bit more time to ensure everything is ready
    await page.waitForTimeout(2000);

    // Look for save button
    console.log('💾 Looking for save button...');
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
          console.log(`✅ Save button clicked: ${selector}`);
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

    // Wait for save to complete
    await page.waitForTimeout(3000);

    // Save the session state
    await context.storageState({ path: path.join(SESSION_DIR, 'state.json') });
    console.log('✅ Session saved successfully!');

    console.log('✅ Upload complete!');

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

// Main execution
if (require.main === module) {
  // Get file paths from command line arguments or use default
  const mediaPaths = process.argv.slice(2);
  
  if (mediaPaths.length === 0) {
    console.log('❌ Please provide at least one media file path');
    console.log('Usage: node upload.js <file1> [file2] [file3] ...');
    console.log('Example: node upload.js ./photos/photo1.jpg ./photos/photo2.jpg');
    process.exit(1);
  }

  // Check if files exist
  for (const filePath of mediaPaths) {
    if (!fs.existsSync(filePath)) {
      console.error(`❌ File not found: ${filePath}`);
      process.exit(1);
    }
  }

  uploadMediaToStrava(mediaPaths)
    .then(() => {
      console.log('🎉 Script completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Script failed:', error);
      process.exit(1);
    });
}

module.exports = { uploadMediaToStrava };

