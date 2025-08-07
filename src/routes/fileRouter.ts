import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { FileController } from '../controller/FileController';
import { authenticateToken } from '../middleware/authMiddleware';
import { getUploadDir, ensureUploadDir } from '../utils/uploadPaths';

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
fileRouter.get('/', authenticateToken, FileController.getAllFiles);
fileRouter.get('/search', authenticateToken, FileController.searchFiles);
fileRouter.get('/stats', authenticateToken, FileController.getFileStats);
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
