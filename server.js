// Production server entry point
// This file handles deployment scenarios where platforms ignore custom start commands

const fs = require("fs");
const path = require("path");

const distServerPath = path.join(__dirname, "dist", "server.js");

console.log("🔍 Checking for compiled server...");
console.log("Looking for:", distServerPath);

if (fs.existsSync(distServerPath)) {
  console.log("✅ Found compiled server, starting...");
  require(distServerPath);
} else {
  console.error("❌ Compiled server not found!");
  console.log("Current directory:", __dirname);
  console.log("Directory contents:");

  try {
    const files = fs.readdirSync(__dirname);
    files.forEach((file) => {
      const filePath = path.join(__dirname, file);
      const stats = fs.statSync(filePath);
      console.log(`  ${stats.isDirectory() ? "d" : "f"} ${file}`);
    });

    if (fs.existsSync(path.join(__dirname, "dist"))) {
      console.log("Dist folder contents:");
      const distFiles = fs.readdirSync(path.join(__dirname, "dist"));
      distFiles.forEach((file) => {
        console.log(`  dist/${file}`);
      });
    }
  } catch (error) {
    console.error("Error reading directory:", error.message);
  }

  console.error(
    'Please run "npm run build" to compile the TypeScript code first.'
  );
  process.exit(1);
}
