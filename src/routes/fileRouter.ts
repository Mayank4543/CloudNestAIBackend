import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import { FileController } from '../controller/FileController';
import { authenticateToken } from '../middleware/authMiddleware';
import { getUploadDir, ensureUploadDir } from '../utils/uploadPaths';
import File from '../models/File';
import { FileService } from '../services/FileService';

ensureUploadDir();

// Create a new router instance
const fileRouter = express.Router();

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
fileRouter.post('/upload', authenticateToken, upload.single('file'), FileController.uploadFile);
fileRouter.get('/debug', FileController.getDebugInfo); // Debug endpoint

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
