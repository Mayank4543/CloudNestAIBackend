#!/bin/bash

echo "=== Build Verification Script ==="
echo "Current directory: $(pwd)"
echo "Node version: $(node --version)"
echo "NPM version: $(npm --version)"

echo ""
echo "=== Installing dependencies ==="
npm ci

echo ""
echo "=== Running TypeScript build ==="
npm run build

echo ""
echo "=== Verifying build output ==="
if [ -f "dist/server.js" ]; then
    echo "✅ dist/server.js created successfully"
    echo "File size: $(wc -c < dist/server.js) bytes"
    echo "First few lines:"
    head -10 dist/server.js
else
    echo "❌ Build failed - dist/server.js not found"
    exit 1
fi

echo ""
echo "=== Directory structure ==="
ls -la
echo ""
echo "=== Dist directory ==="
ls -la dist/

echo ""
echo "✅ Build verification completed successfully"
