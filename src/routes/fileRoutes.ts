import express from 'express';
import multer from 'multer';
import path from 'path';
import { FileController } from '../controller/FileController';
import { authenticateToken } from '../middleware/authMiddleware';

// Create router
const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Store files in the upload directory
        cb(null, path.join(__dirname, '../upload'));
    },
    filename: (req, file, cb) => {
        // Generate unique filename: timestamp-originalname
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const fileExtension = path.extname(file.originalname);
        const baseName = path.basename(file.originalname, fileExtension);
        cb(null, `${baseName}-${uniqueSuffix}${fileExtension}`);
    }
});

// File filter to validate file types (optional - customize as needed)
const fileFilter = (req: express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    // Allow all file types for now - you can add restrictions here
    cb(null, true); // Accept all files
};

// Configure multer middleware
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
        files: 1 // Allow only 1 file per upload
    }
});

// Routes - Define specific routes first, parameterized routes last
// All routes are protected with authenticateToken middleware

// Handle file upload (protected)
router.post('/upload', authenticateToken, upload.single('file'), FileController.uploadFile);

// Get all files (protected)
router.get('/', authenticateToken, FileController.getAllFiles);

// Search files (protected)
router.get('/search', authenticateToken, FileController.searchFiles);

// Get file statistics (protected)
router.get('/stats', authenticateToken, FileController.getFileStats);

// Get a specific file by ID (protected)
router.get('/:id', authenticateToken, FileController.getFileById);

// Delete a file by ID (protected)
router.delete('/:id', authenticateToken, FileController.deleteFile);

// Update file tags (protected)
router.put('/:id/tags', authenticateToken, FileController.updateFileTags);

// Error handling middleware for multer
router.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                message: 'File too large. Maximum size is 10MB.'
            });
        }
        if (error.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({
                success: false,
                message: 'Too many files. Only 1 file allowed per upload.'
            });
        }
    }

    res.status(400).json({
        success: false,
        message: error.message || 'File upload error'
    });
});

export default router;
