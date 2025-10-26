const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// Configuration
const STRAVA_URL = 'https://www.strava.com';
const SESSION_DIR = path.join(__dirname, 'sessions');
const ACTIVITY_DELAY = 2000; // Delay before clicking activity
const UPLOAD_TIMEOUT = 60000; // 60 seconds timeout for upload

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

  // Launch browser with persistent context for session storage
  const browser = await chromium.launch({
    headless: false, // Set to true for production
    slowMo: 500 // Slow down operations for visibility
  });

  const context = await browser.newContext({
    // Store session data
    storageState: fs.existsSync(path.join(SESSION_DIR, 'state.json'))
      ? JSON.parse(fs.readFileSync(path.join(SESSION_DIR, 'state.json'), 'utf8'))
      : undefined
  });

  const page = await context.newPage();

  try {
    // Check if we're already logged in by looking at the page
    console.log('🔍 Checking login status...');
    await page.goto(`${STRAVA_URL}/athlete`);

    // Wait a bit to see if we're redirected or if we land on the athlete page
    await page.waitForTimeout(2000);

    const currentUrl = page.url();
    console.log(`📍 Current URL: ${currentUrl}`);

    // If we're not on the athlete page or we're redirected to login
    if (currentUrl.includes('login') || currentUrl.includes('account')) {
      console.log('❌ Not logged in. Please log in manually in the browser.');
      console.log('💡 After logging in, close the browser to save the session.');
      
      // Keep browser open for manual login
      await page.waitForTimeout(10000); // Give user 10 seconds to log in
      
      // Save the state after potential login
      await context.storageState({ path: path.join(SESSION_DIR, 'state.json') });
    }

    // Navigate to athlete activities
    console.log('📊 Navigating to activity feed...');
    await page.goto(`${STRAVA_URL}/athlete/training`);

    // Wait for activities to load
    await page.waitForSelector('[data-testid="activity-card"]', { timeout: 10000 }).catch(() => {
      console.log('⚠️  Activity cards not found, trying alternative selector...');
    });

    await page.waitForTimeout(ACTIVITY_DELAY);

    // Find the first (latest) activity card
    console.log('🔎 Finding latest activity...');
    const activityCard = await page.locator('[data-testid="activity-card"]').first();
    
    if (!(await activityCard.count())) {
      // Try alternative selectors
      const alternatives = [
        '.activity-title',
        '.activity',
        '[href*="/activities/"]'
      ];
      
      let found = false;
      for (const selector of alternatives) {
        const elements = await page.locator(selector).first();
        if (await elements.count()) {
          await elements.click();
          found = true;
          break;
        }
      }
      
      if (!found) {
        throw new Error('Could not find activity card');
      }
    } else {
      await activityCard.click();
    }

    // Wait for activity detail page to load
    await page.waitForTimeout(3000);

    // Look for edit button
    console.log('✏️  Looking for edit button...');
    
    // Try multiple possible selectors for the edit button
    const editButtonSelectors = [
      'button:has-text("Edit")',
      'a:has-text("Edit")',
      '[aria-label="Edit activity"]',
      '.edit-button',
      'button[class*="edit"]'
    ];

    let editButtonClicked = false;
    for (const selector of editButtonSelectors) {
      try {
        const editButton = await page.locator(selector).first();
        if (await editButton.isVisible({ timeout: 2000 })) {
          await editButton.click();
          editButtonClicked = true;
          console.log(`✅ Found edit button with selector: ${selector}`);
          break;
        }
      } catch (e) {
        // Try next selector
      }
    }

    if (!editButtonClicked) {
      console.log('⚠️  Edit button not found automatically. Please click it manually in the browser.');
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
    await page.waitForTimeout(UPLOAD_TIMEOUT);

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
    // Keep browser open for debugging, uncomment to auto-close
    // await browser.close();
    console.log('💡 Browser remains open for inspection. Close it when done.');
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

