# Cloudflare R2 File Storage Implementation

This document explains the implementation of file storage using Cloudflare R2 with memory-based uploads in the CloudNest API backend.

## Overview

The application now uses Cloudflare R2 for persistent file storage, with in-memory file handling to prevent local file system dependencies. This solves the issue of files being lost when the server restarts, especially in environments like Render where the filesystem is ephemeral.

## Key Components

### 1. Multer Configuration (Memory Storage)

Files are now processed entirely in memory using `multer.memoryStorage()`, which eliminates the need for local disk storage and prevents file loss on server restarts.

```javascript
// Configure multer for memory storage instead of disk storage
const storage = multer.memoryStorage();
```

### 2. FileController Adjustments

The `uploadFile` method in `FileController.ts` has been updated to handle file buffers from memory storage instead of paths from disk storage:

- It extracts the file buffer from the request
- Generates a unique filename
- Passes the buffer to the FileService for R2 upload

### 3. FileService R2 Integration

The `FileService.ts` class includes:

- `uploadFileToR2()`: Uploads a file buffer directly to R2
- `generatePresignedUrl()`: Creates temporary URLs for secure access to private R2 files
- `saveFile()`: Updated to handle both buffer uploads and legacy path-based uploads

### 4. File Access Logic

File access routes have been updated to:

- Prioritize R2 access through presigned URLs
- Handle access control through authentication checks
- Remove dependencies on local file system checks

### 5. File Model Updates

The `File` model includes R2-specific fields:

- `r2Url`: Stores the pre-signed URL for the file
- `r2ObjectKey`: Stores the object key in the R2 bucket for generating fresh URLs

## Environment Variables

The following environment variables are required:

```
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_ENDPOINT=https://your-account.r2.cloudflarestorage.com
R2_BUCKET_NAME=your-bucket-name
```

## Testing

A test script is provided at `src/tests/memory_upload_test.js` to verify that uploads are working correctly with memory storage and R2.

## Benefits of This Approach

1. **Persistence**: Files remain accessible even after server restarts
2. **Scalability**: No local disk space limitations
3. **Security**: Files are stored privately in R2 and accessed through temporary presigned URLs
4. **Performance**: Direct uploads from memory to R2 without disk I/O operations
5. **Compatibility**: The API maintains backward compatibility by generating virtual file paths

## Limitations

1. The system depends on Cloudflare R2 being properly configured
2. Presigned URLs expire (default 24 hours), requiring regeneration for long-term access
