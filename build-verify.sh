#!/bin/bash

# Print diagnostic information
echo "Starting build process..."
echo "Node version: $(node -v)"
echo "NPM version: $(npm -v)"

# Install dependencies
echo "Installing dependencies..."
npm install

# Rebuild Sharp specifically for the platform
echo "Rebuilding Sharp for the current platform..."
npm rebuild sharp

# Build the application
echo "Building the application..."
npm run build

echo "Build process completed successfully!"
