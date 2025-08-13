# Script to run the R2 file processor
# Usage: .\process-r2-files.ps1 [fileId] [limit]

# Change to the project directory
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectDir = Split-Path -Parent $scriptDir

# Go to project directory
Push-Location $projectDir

try {
    # Compile the TypeScript file
    Write-Host "Compiling TypeScript..."
    npx tsc -p tsconfig.json scripts/process-r2-files.ts --outDir dist/scripts

    # Run the compiled JavaScript file
    Write-Host "Running file processor..."
    if ($args[0]) {
        # Process a specific file
        node dist/scripts/process-r2-files.js $args[0] $args[1]
    } else {
        # Process a batch of files
        $limit = if ($args[0]) { $args[0] } else { "10" }
        node dist/scripts/process-r2-files.js "" $limit
    }
} finally {
    # Return to original directory
    Pop-Location
}
