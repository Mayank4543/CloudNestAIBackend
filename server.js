// Production server entry point
// This file handles deployment scenarios where platforms ignore custom start commands

const fs = require("fs");
const path = require("path");

// Try multiple possible paths for the compiled server
const possiblePaths = [
  path.join(__dirname, "dist", "server.js"), // Standard path
  path.join(__dirname, "..", "dist", "server.js"), // If running from subdirectory
  path.join(process.cwd(), "dist", "server.js"), // Using process working directory
];

let distServerPath = null;

console.log("🔍 Checking for compiled server...");
console.log("Current __dirname:", __dirname);
console.log("Current process.cwd():", process.cwd());

// Find the correct path
for (const possiblePath of possiblePaths) {
  console.log("Checking:", possiblePath);
  if (fs.existsSync(possiblePath)) {
    distServerPath = possiblePath;
    console.log("✅ Found compiled server at:", distServerPath);
    break;
  }
}

if (distServerPath) {
  console.log("✅ Starting compiled server...");
  require(distServerPath);
} else {
  console.error("❌ Compiled server not found!");
  console.log("Searched paths:");
  possiblePaths.forEach((p) => console.log("  ❌", p));

  console.log("Current directory contents:");

  try {
    const files = fs.readdirSync(process.cwd());
    files.forEach((file) => {
      const filePath = path.join(process.cwd(), file);
      const stats = fs.statSync(filePath);
      console.log(`  ${stats.isDirectory() ? "d" : "f"} ${file}`);
    });

    // Check if dist exists in current working directory
    const distPath = path.join(process.cwd(), "dist");
    if (fs.existsSync(distPath)) {
      console.log("Dist folder contents:");
      const distFiles = fs.readdirSync(distPath);
      distFiles.forEach((file) => {
        console.log(`  dist/${file}`);
      });
    } else {
      console.log("❌ No dist folder found in current working directory");
    }
  } catch (error) {
    console.error("Error reading directory:", error.message);
  }

  console.error(
    'Please run "npm run build" to compile the TypeScript code first.'
  );
  process.exit(1);
}
