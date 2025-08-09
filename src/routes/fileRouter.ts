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

// Ensure upload directory exists on startup
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

// File access route with proper authentication - MUST be before /:id route
fileRouter.get('/access/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;

        // Find file in database
        const fileRecord = await File.findOne({ filename });

        if (!fileRecord) {
            return res.status(404).json({
                success: false,
                message: 'File not found'
            });
        }

        // Access control check
        if (!fileRecord.isPublic) {
            // For private files, require authentication
            const authHeader = req.headers.authorization;
            const token = authHeader && authHeader.startsWith('Bearer ')
                ? authHeader.substring(7)
                : null;

            if (!token) {
                return res.status(401).json({
                    success: false,
                    message: 'Authentication required to access this private file'
                });
            }

            // Verify token and check ownership
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-key') as any;

                if (fileRecord.userId.toString() !== decoded.userId) {
                    return res.status(403).json({
                        success: false,
                        message: 'You do not have permission to access this file'
                    });
                }
            } catch (jwtError) {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid authentication token'
                });
            }
        }

        // At this point, access is granted
        // Files should be in R2 now, so generate a presigned URL
        if (fileRecord.r2ObjectKey) {
            try {
                // Generate a fresh presigned URL that's valid for 24 hours
                const presignedUrl = await FileService.generatePresignedUrl(fileRecord.r2ObjectKey);
                return res.redirect(presignedUrl);
            } catch (presignError) {
                console.error('Error generating presigned URL:', presignError);
                // If we have a stored URL as fallback, use that
                if (fileRecord.r2Url) {
                    return res.redirect(fileRecord.r2Url);
                }
            }
        }

        // If we get here, no R2 access was possible
        return res.status(404).json({
            success: false,
            message: 'File not found in cloud storage'
        });

    } catch (error) {
        console.error('File access error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
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
