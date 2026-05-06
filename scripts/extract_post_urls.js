const fs = require('fs');

const inputPath = process.argv[2];
const outputPath = process.argv[3];

if (!inputPath || !outputPath) {
  console.error('Usage: node scripts/extract_post_urls.js <weekly-raw-json> <urls-txt>');
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const urls = [...new Set((raw.records || [])
  .map((record) => record.postUrl)
  .filter((url) => /facebook\.com\/groups\/.+\/posts\//.test(url)))];

fs.writeFileSync(outputPath, `${urls.join('\n')}\n`);
console.log(JSON.stringify({ outputPath, urls: urls.length }, null, 2));
