import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { getUploadDir } from '../utils/uploadPaths';

/**
 * Custom static file serving middleware with better error handling
 * This replaces express.static for uploaded files
 */
export const serveUploadedFile = (req: Request, res: Response, next: NextFunction): void => {
    try {
        const filename = req.path.substring(1); // Remove leading slash
        const uploadDir = getUploadDir();
        const fullPath = path.join(uploadDir, filename);

        console.log(`📁 Attempting to serve file: ${fullPath}`);

        // Check if file exists
        if (!fs.existsSync(fullPath)) {
            console.log(`❌ File not found: ${fullPath}`);
            console.log(`📂 Upload directory: ${uploadDir}`);
            console.log(`📋 Files in directory:`, fs.existsSync(uploadDir) ? fs.readdirSync(uploadDir) : 'Directory does not exist');

            res.status(404).json({
                success: false,
                message: 'File not found',
                debug: {
                    requestedFile: filename,
                    fullPath: fullPath,
                    uploadDir: uploadDir,
                    uploadDirExists: fs.existsSync(uploadDir)
                }
            });
            return;
        }

        // Serve the file
        console.log(`✅ Serving file: ${fullPath}`);
        res.sendFile(fullPath);

    } catch (error) {
        console.error('❌ Error serving file:', error);
        res.status(500).json({
            success: false,
            message: 'Error serving file',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};
