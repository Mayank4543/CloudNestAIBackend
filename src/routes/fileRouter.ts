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

// File access route with proper authentication - MUST be before /:id route
fileRouter.get('/access/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;

        // Get userId from token if present for authentication
        let userId: string | undefined = undefined;

        // Extract token if present
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.startsWith('Bearer ')
            ? authHeader.substring(7)
            : null;

        // Validate token if provided
        if (token) {
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-key') as any;
                userId = decoded.userId;
            } catch (jwtError) {
                console.error('Invalid JWT token:', jwtError);
                // Continue without userId - will only allow public files
            }
        }

        try {
            // Use the new FileService method to get the file access URL
            const { url, isPublic, file } = await FileService.getFileAccessUrl(filename, userId);

            // Check file permissions
            if (!isPublic && (!userId || file.userId.toString() !== userId)) {
                return res.status(403).json({
                    success: false,
                    message: 'You do not have permission to access this private file'
                });
            }



            // Determine how to serve the URL based on its format
            if (url.startsWith('http://') || url.startsWith('https://')) {
                // For http/https URLs (like presigned URLs), redirect
                return res.redirect(url);
            } else {
                // For local paths, use sendFile
                return res.sendFile(url);
            }

        } catch (error) {
            // Handle specific errors
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';

            if (errorMessage.includes('File not found')) {
                return res.status(404).json({
                    success: false,
                    message: 'File not found in database'
                });
            } else if (errorMessage.includes('access denied')) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied to this file'
                });
            } else if (errorMessage.includes('File content unavailable')) {
                return res.status(404).json({
                    success: false,
                    message: 'File content not found in storage'
                });
            } else {
                throw error; // Re-throw for general error handling
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
