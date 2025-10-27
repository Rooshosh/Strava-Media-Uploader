const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { URL } = require('url');

/**
 * Download a file from a URL
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

module.exports = { downloadFile, ensureTempDir };

