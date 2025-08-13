#!/bin/bash
# Script to run the R2 file processor
# Usage: ./process-r2-files.sh [fileId] [limit]

# Change to the project directory
cd "$(dirname "$0")/.."

# Compile the TypeScript file
echo "Compiling TypeScript..."
npx tsc -p tsconfig.json scripts/process-r2-files.ts --outDir dist/scripts

# Run the compiled JavaScript file
echo "Running file processor..."
if [ -n "$1" ]; then
  # Process a specific file
  node dist/scripts/process-r2-files.js "$1" "$2"
else
  # Process a batch of files
  node dist/scripts/process-r2-files.js "" "${1:-10}"
fi
