#!/usr/bin/env node

// Startup diagnostics script
const fs = require('fs');
const path = require('path');

console.log('🚀 Starting CloudNest Backend...');
console.log('📊 Environment Diagnostics:');
console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
console.log(`   Working Directory: ${process.cwd()}`);
console.log(`   BASE_URL: ${process.env.BASE_URL || 'not set'}`);

// Check upload directory
const uploadDir = process.env.NODE_ENV === 'production' 
    ? path.join(process.cwd(), 'uploads')
    : path.join(process.cwd(), 'src', 'upload');

console.log(`📁 Upload Directory: ${uploadDir}`);

try {
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
        console.log('✅ Created upload directory');
    } else {
        console.log('✅ Upload directory exists');
    }
    
    // Test write permissions
    const testFile = path.join(uploadDir, '.startup-test');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    console.log('✅ Upload directory is writable');
    
} catch (error) {
    console.error('❌ Upload directory error:', error.message);
}

console.log('🎯 Starting Express server...\n');

// Start the actual server
require('./dist/server.js');
