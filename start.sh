#!/bin/bash

echo "=== CloudNest AI Backend Deployment Debug ==="
echo "Node.js version: $(node --version)"
echo "NPM version: $(npm --version)"
echo "Current directory: $(pwd)"
echo "Directory contents:"
ls -la

echo ""
echo "=== Checking dist folder ==="
if [ -d "dist" ]; then
    echo "✅ dist folder exists"
    echo "dist folder contents:"
    ls -la dist/
    
    if [ -f "dist/server.js" ]; then
        echo "✅ dist/server.js exists"
        echo "dist/server.js size: $(stat -c%s dist/server.js) bytes"
    else
        echo "❌ dist/server.js NOT found"
    fi
else
    echo "❌ dist folder NOT found"
fi

echo ""
echo "=== Starting server ==="
node dist/server.js
