// Import necessary modules and middleware
import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import cors from 'cors';
import { FileController } from '../controller/FileController';
import { authenticateToken } from '../middleware/authMiddleware';
import { checkQuota } from '../middleware/quotaMiddleware';
import { getUploadDir, ensureUploadDir } from '../utils/uploadPaths';
import File from '../models/File';
import { FileService } from '../services/FileService';
import { getFileUrl, extractFilename } from '../utils/uploadPaths';

ensureUploadDir();

// Create a new router instance
const fileRouter = express.Router();

// Configure CORS specifically for file operations
const uploadCorsOptions = {
    origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
        const allowedOrigins = [
            'https://cloud-nest-ai-frontend.vercel.app',
            'https://cloudnestai.vercel.app',
            'http://localhost:3000',
            'http://127.0.0.1:3000'
        ];

        // Allow requests with no origin (like mobile apps, Postman, etc.)
        if (!origin) return callback(null, true);

        if (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development') {
            console.log(`✅ File upload CORS allowed for origin: ${origin}`);
            callback(null, true);
        } else {
            console.log(`❌ File upload CORS blocked for origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['Content-Range', 'X-Content-Range'],
    maxAge: 86400
};

// Apply CORS to all file routes
fileRouter.use(cors(uploadCorsOptions));

// Configure multer for memory storage instead of disk storage
// This way files are kept in memory and uploaded directly to R2 without saving to disk
const storage = multer.memoryStorage();

// Helper function to generate a safe, unique filename (used after upload)
const generateSafeFilename = (originalname: string): string => {
    // Generate unique filename with timestamp and random suffix
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const fileExtension = path.extname(originalname);
    const baseName = path.basename(originalname, fileExtension);

    // Clean filename to prevent path traversal attacks
    const cleanBaseName = baseName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const finalFilename = `${cleanBaseName}-${uniqueSuffix}${fileExtension}`;

    console.log(`📄 Generated filename: ${finalFilename}`);
    return finalFilename;
};

// File filter for security (optional but recommended)
const fileFilter = (req: express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {

    cb(null, true);
};

// Configure multer middleware with memory storage
const upload = multer({
    storage: storage, // Using memory storage defined above
    fileFilter: fileFilter,
    limits: {
        fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760'), // 10MB default
        files: parseInt(process.env.MAX_FILES || '1') // 1 file default
    }
});

// Simple routes - specific paths first, param routes last
// Handle preflight OPTIONS requests explicitly
fileRouter.options('/upload', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Max-Age', '86400');
    res.status(200).end();
});

fileRouter.post('/upload', authenticateToken, upload.single('file'), checkQuota, FileController.uploadFile);
fileRouter.get('/debug', FileController.getDebugInfo); // Debug endpoint

// Add CORS test endpoint
fileRouter.get('/cors-test', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'CORS test successful',
        origin: req.headers.origin || 'No origin header',
        userAgent: req.headers['user-agent'] || 'No user agent',
        timestamp: new Date().toISOString()
    });
});

// Import proxyR2File middleware and CORS configuration
import { proxyR2File, proxyFileCors } from '../middleware/r2ProxyMiddleware';

// Proxy route to avoid CORS issues with Cloudflare R2
// This route serves the file content directly through our backend instead of redirecting
// Apply CORS middleware specifically for this route
fileRouter.get('/proxy/:filename', proxyFileCors, proxyR2File);

// File access route with Google Drive style permissions - MUST be before /:id route
fileRouter.get('/access/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;
        console.log(`Access requested for file: ${filename}`);

        // For private files, extract user ID from token if present
        let userId: string | undefined = undefined;

        // Extract and validate auth token
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.startsWith('Bearer ')
            ? authHeader.substring(7)
            : null;

        // If token exists, try to decode it to get userId
        if (token) {
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-key') as any;
                userId = decoded.userId;
            } catch (tokenError) {
                console.error('Invalid token:', tokenError);
                // We'll handle authorization failure in getFileAccessUrl
            }
        }

        // Use the new hybrid access method from FileService
        // This implements Google Drive's exact feel:
        // - Public files: Use permanent R2 URL
        // - Private files: Generate 1-hour presigned URL
        try {
            const { url, isPublic, file } = await FileService.getFileAccessUrl(filename, userId);

            if (isPublic) {
                console.log(`Serving public file: ${filename} with URL type: ${url.includes('?') ? 'presigned' : 'permanent'}`);
            } else {
                console.log(`Serving private file: ${filename} with 1-hour presigned URL`);
            }

            // Redirect to the access URL
            return res.redirect(url);

        } catch (accessError: any) {
            console.error('Access error:', accessError);

            // Handle specific access errors with appropriate status codes
            if (accessError.message.includes('not found')) {
                return res.status(404).json({
                    success: false,
                    message: 'File not found'
                });
            } else if (accessError.message.includes('Access denied') ||
                accessError.message.includes('authentication required')) {
                return res.status(401).json({
                    success: false,
                    message: 'Authentication required for this private file'
                });
            } else {
                return res.status(500).json({
                    success: false,
                    message: 'Error accessing file',
                    error: accessError instanceof Error ? accessError.message : 'Unknown error'
                });
            }
        }

    } catch (error) {
        console.error('File access error:', error);
        return res.status(500).json({
            success: false,
            message: 'Error accessing file',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

// Other specific routes
fileRouter.get('/', authenticateToken, FileController.getAllFiles);
fileRouter.get('/search', authenticateToken, FileController.searchFiles);
fileRouter.get('/stats', authenticateToken, FileController.getFileStats);

// Partition-specific file listing
fileRouter.get('/partition/:partitionName', authenticateToken, async (req, res) => {
    try {
        const { partitionName } = req.params;

        if (!req.user || !req.user._id) {
            return res.status(401).json({
                success: false,
                message: 'User authentication required'
            });
        }

        // Extract query parameters
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const mimetype = req.query.mimetype as string;
        const tags = req.query.tags as string;
        const sortBy = req.query.sortBy as string;
        const sortOrder = req.query.sortOrder as 'asc' | 'desc';

        const tagArray = tags ? tags.split(',').map(tag => tag.trim()) : undefined;

        const queryOptions = {
            page,
            limit,
            mimetype,
            tags: tagArray,
            partition: partitionName,
            sortBy,
            sortOrder,
            userId: req.user._id.toString()
        };

        const result = await FileService.getFiles(queryOptions);

        // Add URLs to files
        const filesWithUrls = result.files.map((file: any) => {
            try {
                if (file.r2Url) {
                    return {
                        ...file,
                        url: file.r2Url,
                        storedInR2: true
                    };
                } else {
                    const filename = extractFilename(file.path);
                    return {
                        ...file,
                        url: getFileUrl(filename, req),
                        storedInR2: false
                    };
                }
            } catch (err) {
                console.error('Error adding URL to file:', err);
                return file;
            }
        });

        res.status(200).json({
            success: true,
            message: `Files from partition '${partitionName}' retrieved successfully`,
            data: filesWithUrls,
            pagination: result.pagination
        });

    } catch (error) {
        console.error('Error getting files by partition:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting files by partition',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

// Trash operations (protected) - must be before /:id routes
fileRouter.get('/trash', authenticateToken, FileController.getTrashFiles);
fileRouter.put('/restore/:id', authenticateToken, FileController.restoreFile);
fileRouter.delete('/permanent/:id', authenticateToken, FileController.permanentlyDeleteFile);
fileRouter.delete('/trash/empty', authenticateToken, FileController.emptyTrash);

// Manual trash cleanup endpoint (for testing/admin)
fileRouter.post('/trash/cleanup', authenticateToken, async (req, res) => {
    try {
        const { TrashCleanupService } = require('../services/TrashCleanupService');
        const result = await TrashCleanupService.manualCleanup();

        res.status(200).json({
            success: true,
            message: `Manual cleanup completed: ${result.deletedCount} files deleted`,
            data: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error during manual cleanup',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

// Test AI tagging functionality (protected)
fileRouter.post('/test-ai-tagging', authenticateToken, FileController.testAITagging);
// Scan file for sensitive data before making public (protected)
fileRouter.post('/:id/scan-sensitive', authenticateToken, FileController.scanForSensitiveData);
// Summarize file content using AI (protected)
// fileRouter.post('/:id/summarize', authenticateToken, FileController.summarizeFile);

// IMPORTANT: Specific routes with parameters must come BEFORE generic param routes
fileRouter.get('/download/:id', authenticateToken, FileController.downloadFile);
fileRouter.get('/:id/info', authenticateToken, FileController.getFileInfo);

// Generic param routes MUST come last
fileRouter.get('/:id', authenticateToken, FileController.getFileById);
fileRouter.delete('/:id', authenticateToken, FileController.deleteFile);
fileRouter.put('/:id/tags', authenticateToken, FileController.updateFileTags);
fileRouter.put('/:id/public', authenticateToken, FileController.updateFilePublicStatus);
// Error handling middleware
fileRouter.use((error: any, req: any, res: any, next: any) => {
    console.error('File route error:', error);
    res.status(400).json({
        success: false,
        message: error.message || 'File operation error'
    });
});

// Export the router
export default fileRouter;
