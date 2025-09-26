const fs = require("fs");
const path = require("path");

const src = path.resolve(__dirname, "..", "generated");
const dest = path.resolve(__dirname, "..", "dist", "generated");

try {
  // remove dest if exists
  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true, force: true });
  }

  // copy recursively (fs.cpSync available in Node 16+)
  if (!fs.existsSync(src)) {
    console.error("Source generated folder not found:", src);
    process.exit(1);
  }

  fs.cpSync(src, dest, { recursive: true });
  console.log("Copied generated ->", dest);
} catch (err) {
  console.error("Failed to copy generated:", err);
  process.exit(1);
}
