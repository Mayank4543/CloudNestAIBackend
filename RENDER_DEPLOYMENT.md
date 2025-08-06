# Render.com Deployment Guide

## Environment Variables Required

Set these in your Render dashboard under "Environment":

```bash
NODE_ENV=production
BASE_URL=https://your-app-name.onrender.com
MAX_FILE_SIZE=10485760
MAX_FILES=1
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
CORS_ORIGIN=https://your-frontend-domain.com
```

## Build & Start Commands

- **Build Command**: `npm run build`
- **Start Command**: `npm start`

## Directory Permissions

Render automatically handles directory creation, but the app will:

1. Create `/uploads` directory at project root during startup
2. Use `process.cwd() + '/uploads'` as the upload path
3. Serve files from `/uploads` URL endpoint

## Debugging

Access the debug endpoint to verify paths:

- `GET /api/files/debug` - Shows directory paths and file listings

## File Upload Flow

1. **Upload**: `POST /api/files/upload` with multipart/form-data
2. **Files saved to**: `/opt/render/project/src/uploads/` (automatically created)
3. **Files served from**: `https://your-app.onrender.com/uploads/filename`

## Troubleshooting

If you get ENOENT errors:

1. Check the debug endpoint
2. Verify NODE_ENV=production is set
3. Check server logs for directory creation messages
4. Ensure file paths match between upload and serving
