# File Upload System Documentation

## Overview

This document describes the file upload system implementation using Multer, Express, and MongoDB with user authentication and public file sharing capabilities.

## Directory Structure

```
├── src/
│   ├── utils/
│   │   └── uploadPaths.ts          # Path utilities for uploads
│   ├── routes/
│   │   └── fileRouter.ts           # File upload routes
│   ├── controller/
│   │   └── FileController.ts       # File operations logic
│   ├── services/
│   │   └── FileService.ts          # Database operations
│   ├── models/
│   │   └── File.ts                 # File schema
│   └── upload/                     # Development uploads (gitignored)
├── uploads/                        # Production uploads (created dynamically)
└── dist/                          # Compiled JavaScript
```

## How It Works

### 1. Path Resolution

- **Development**: Files saved to `src/upload/`
- **Production**: Files saved to `uploads/` in project root
- Uses `uploadPaths.ts` utility to determine correct paths

### 2. File Upload Flow

1. Client sends POST request to `/api/files/upload` with multipart form data
2. `authenticateToken` middleware validates user authentication
3. Multer middleware processes file upload and saves to appropriate directory
4. FileController extracts user ID and file metadata
5. FileService saves metadata to MongoDB
6. Response includes file metadata and public URL

### 3. File Serving

- Static files served from `/uploads/*` endpoint
- Express.static middleware serves files from the upload directory
- Files accessible via: `https://yourapi.com/uploads/filename.ext`

## API Endpoints

### Upload File

```http
POST /api/files/upload
Authorization: Bearer <token>
Content-Type: multipart/form-data

FormData:
- file: <file>
- isPublic: true/false (optional)
- tags: ["tag1", "tag2"] (optional)
```

### Get Files

```http
GET /api/files
Authorization: Bearer <token>
Query Parameters:
- public: true/false (get public files vs user files)
- page: number (pagination)
- limit: number (items per page)
```

### File Security

#### User Ownership

- Each file linked to uploader via `userId` field
- Only file owner can:
  - Delete file
  - Update file tags
  - Change public status
  - Access private files

#### Public Files

- Files with `isPublic: true` are accessible to all authenticated users
- Query `?public=true` returns only public files
- Public files can be accessed via `/uploads/` URL by anyone

## Configuration

### Environment Variables

```bash
# Required for production
BASE_URL=https://your-domain.com
NODE_ENV=production

# Optional
MAX_FILE_SIZE=10485760  # 10MB default
MAX_FILES=1             # 1 file per upload
```

### Multer Configuration

- **File Size Limit**: 10MB per file
- **File Count**: 1 file per upload
- **Filename**: `originalname-timestamp-randomnumber.ext`
- **Security**: Filename sanitization prevents path traversal

## Database Schema

### File Model

```typescript
{
  filename: string,        // Generated filename
  originalname: string,    // User's filename
  mimetype: string,        // File MIME type
  size: number,            // File size in bytes
  path: string,            // Full file path
  userId: ObjectId,        // File owner (required)
  isPublic: boolean,       // Public access flag
  tags: string[],          // User tags
  createdAt: Date,         // Upload timestamp
  updatedAt: Date          // Last modified
}
```

### Indexes

- `userId: 1` - User files lookup
- `isPublic: 1` - Public files filter
- `userId: 1, isPublic: 1` - Compound index
- `createdAt: -1` - Recent files first
- `tags: 1` - Tag-based search

## Error Handling

### Common Errors

- **401 Unauthorized**: Missing/invalid auth token
- **400 Bad Request**: No file uploaded or invalid data
- **413 Payload Too Large**: File exceeds size limit
- **404 Not Found**: File not found or access denied
- **500 Internal Error**: Server/database errors

### File System Errors

- **ENOENT**: Directory auto-created if missing
- **EACCES**: Permission errors logged
- **ENOSPC**: Disk space errors handled gracefully

## Production Deployment

### Directory Setup

```bash
# Ensure upload directory exists in production
mkdir -p uploads
chmod 755 uploads
```

### Render.com Specific

- Upload directory created automatically on first startup
- Files persist between deployments (if using persistent storage)
- Set `BASE_URL` environment variable to your Render domain

### Security Considerations

1. **Authentication**: All endpoints require valid JWT token
2. **File Validation**: Multer validates file uploads
3. **Path Sanitization**: Filename cleaning prevents attacks
4. **Access Control**: User ownership validation
5. **Rate Limiting**: Consider adding rate limiting for uploads
6. **Virus Scanning**: Consider adding virus scanning for production

## Testing

### Manual Testing

```bash
# Upload a file
curl -X POST \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "file=@testfile.jpg" \
  -F "isPublic=true" \
  http://localhost:3000/api/files/upload

# Access uploaded file
curl http://localhost:3000/uploads/testfile-1234567890-123456789.jpg
```

### Automated Testing

- Unit tests in `src/tests/`
- Integration tests for file upload/download
- Mock Multer for testing without actual files

## Monitoring & Logs

- File operations logged to console
- Upload directory path logged on startup
- Error details logged for debugging
- Consider log aggregation for production

---

## Quick Setup Checklist

1. ✅ Install dependencies: `npm install multer @types/multer`
2. ✅ Import utilities in routes/controllers
3. ✅ Set up authentication middleware
4. ✅ Configure environment variables
5. ✅ Test upload functionality
6. ✅ Verify static file serving
7. ✅ Check database schema and indexes
8. ✅ Deploy to production with proper environment settings
