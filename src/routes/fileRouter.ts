import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import { FileController } from '../controller/FileController';
import { authenticateToken } from '../middleware/authMiddleware';
import { getUploadDir, ensureUploadDir } from '../utils/uploadPaths';
import File from '../models/File';

// Ensure upload directory exists on startup
ensureUploadDir();

// Create a new router instance
const fileRouter = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        try {
            // Use the utility function to get correct upload directory
            const uploadDir = getUploadDir();

            console.log(`📁 Attempting to save file to: ${uploadDir}`);

            // Double-check directory exists before saving
            if (!fs.existsSync(uploadDir)) {
                console.log(`📂 Creating directory: ${uploadDir}`);
                fs.mkdirSync(uploadDir, { recursive: true });
            }

            // Verify the directory is writable
            fs.accessSync(uploadDir, fs.constants.W_OK);

            cb(null, uploadDir);
        } catch (error) {
            console.error('❌ Error setting up upload destination:', error);
            cb(error as Error, '');
        }
    },
    filename: (req, file, cb) => {
        try {
            // Generate unique filename with timestamp and random suffix
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            const fileExtension = path.extname(file.originalname);
            const baseName = path.basename(file.originalname, fileExtension);

            // Clean filename to prevent path traversal attacks
            const cleanBaseName = baseName.replace(/[^a-zA-Z0-9._-]/g, '_');
            const finalFilename = `${cleanBaseName}-${uniqueSuffix}${fileExtension}`;

            console.log(`📄 Generated filename: ${finalFilename}`);

            cb(null, finalFilename);
        } catch (error) {
            console.error('❌ Error generating filename:', error);
            cb(error as Error, '');
        }
    }
});// File filter for security (optional but recommended)
const fileFilter = (req: express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {

    cb(null, true);
};

// Configure multer middleware
const upload = multer({
    storage: storage,
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

        // If file is public, allow access
        if (fileRecord.isPublic) {
            // If stored in R2, redirect to R2 URL
            if (fileRecord.r2Url) {
                return res.redirect(fileRecord.r2Url);
            }

            // Otherwise, try to serve from local storage
            const uploadDir = getUploadDir();
            const fullPath = path.join(uploadDir, filename);

            if (fs.existsSync(fullPath)) {
                return res.sendFile(fullPath);
            } else {
                return res.status(404).json({
                    success: false,
                    message: 'File not found on disk and no R2 URL available'
                });
            }
        }

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

            // User authorized, serve file

            // If the file is stored in R2, redirect to the R2 URL
            if (fileRecord.r2Url) {
                return res.redirect(fileRecord.r2Url);
            }

            // Otherwise, try to serve from local disk
            const uploadDir = getUploadDir();
            const fullPath = path.join(uploadDir, filename);

            if (fs.existsSync(fullPath)) {
                return res.sendFile(fullPath);
            } else {
                return res.status(404).json({
                    success: false,
                    message: 'File not found on disk and no R2 URL available'
                });
            }

        } catch (jwtError) {
            return res.status(401).json({
                success: false,
                message: 'Invalid authentication token'
            });
        }

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
