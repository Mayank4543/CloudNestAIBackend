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

        // First, check if the file exists and get its public status
        const fileRecord = await File.findOne({ filename }).select('-__v');

        if (!fileRecord) {
            return res.status(404).json({
                success: false,
                message: 'File not found in database'
            });
        }

        // Implements Google Drive style access flow
        // Step 1: Check if file is public
        if (fileRecord.isPublic) {
            console.log(`File ${filename} is public, serving direct URL`);

            // For public files, use the stored R2 URL directly if available
            if (fileRecord.r2Url) {
                return res.redirect(fileRecord.r2Url);
            }

            // If R2 URL not available but we have the object key, generate a long-lived URL
            if (fileRecord.r2ObjectKey) {
                try {
                    // For public files, generate a longer expiry time (24 hours)
                    const presignedUrl = await FileService.generatePresignedUrl(fileRecord.r2ObjectKey, 86400);
                    console.log(`Generated presigned URL for public file: ${presignedUrl}`);
                    return res.redirect(presignedUrl);
                } catch (error) {
                    console.error('Error generating presigned URL for public file:', error);
                    // Continue to fallbacks below
                }
            }
        }
        // Step 2: For private files, check authentication
        else {
            console.log(`File ${filename} is private, checking authentication`);

            // Extract and validate auth token
            const authHeader = req.headers.authorization;
            const token = authHeader && authHeader.startsWith('Bearer ')
                ? authHeader.substring(7)
                : null;

            // No token provided - unauthorized
            if (!token) {
                console.log('No authentication token provided for private file');
                return res.status(401).json({
                    success: false,
                    message: 'Authentication required to access this private file'
                });
            }

            try {
                // Verify the token
                const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-key') as any;
                const userId = decoded.userId;

                // Check if the user owns this file
                if (fileRecord.userId.toString() !== userId) {
                    console.log(`User ${userId} does not own private file ${filename}`);
                    return res.status(403).json({
                        success: false,
                        message: 'You do not have permission to access this private file'
                    });
                }

                console.log(`User ${userId} authenticated for private file ${filename}`);

                // User is authorized, generate a short-lived presigned URL (1 hour)
                if (fileRecord.r2ObjectKey) {
                    try {
                        // For private files owned by the user, generate a shorter expiry time (1 hour)
                        const presignedUrl = await FileService.generatePresignedUrl(fileRecord.r2ObjectKey, 3600);
                        console.log(`Generated presigned URL for private file: ${presignedUrl}`);
                        return res.redirect(presignedUrl);
                    } catch (error) {
                        console.error('Error generating presigned URL for private file:', error);
                        // Continue to fallbacks below
                    }
                }
            } catch (jwtError) {
                console.error('Invalid JWT token:', jwtError);
                return res.status(401).json({
                    success: false,
                    message: 'Invalid authentication token'
                });
            }
        }

        // If we get here, we couldn't use R2 directly, try fallbacks

        // Try to extract R2 object key from R2 URL if available
        if (!fileRecord.r2ObjectKey && fileRecord.r2Url) {
            try {
                const extractedKey = FileService.extractObjectKeyFromUrl(fileRecord.r2Url);
                console.log(`Extracted object key from R2 URL: ${extractedKey}`);

                // Update the database for future requests
                await File.updateOne(
                    { _id: fileRecord._id },
                    { r2ObjectKey: extractedKey }
                );

                // Generate a presigned URL with the extracted key
                const urlExpiry = fileRecord.isPublic ? 86400 : 3600; // 24 hours for public, 1 hour for private
                const presignedUrl = await FileService.generatePresignedUrl(extractedKey, urlExpiry);
                console.log(`Generated presigned URL with extracted key: ${presignedUrl}`);
                return res.redirect(presignedUrl);
            } catch (error) {
                console.error('Failed to extract and use object key from R2 URL:', error);

                // If extraction failed, just use the stored R2 URL
                if (fileRecord.r2Url) {
                    console.log(`Falling back to stored R2 URL: ${fileRecord.r2Url}`);
                    return res.redirect(fileRecord.r2Url);
                }
            }
        }

        // Final fallback: check if file exists on local disk
        if (fileRecord.path) {
            try {
                const fullPath = path.resolve(fileRecord.path);
                if (fs.existsSync(fullPath)) {
                    console.log(`Serving file from local disk: ${fullPath}`);
                    return res.sendFile(fullPath);
                }
            } catch (diskError) {
                console.error('Error accessing local file:', diskError);
            }
        }

        // If we get here, no access method worked
        return res.status(404).json({
            success: false,
            message: 'File content unavailable - not found in R2 or local storage'
        });

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
