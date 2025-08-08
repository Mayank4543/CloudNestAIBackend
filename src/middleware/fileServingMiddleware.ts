import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import { getUploadDir } from '../utils/uploadPaths';
import File from '../models/File';

/**
 * Custom static file serving middleware with authorization checks
 * This replaces express.static for uploaded files and ensures only authorized users can access files
 */
export const serveUploadedFile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const filename = req.path.substring(1); // Remove leading slash
        const uploadDir = getUploadDir();
        const fullPath = path.join(uploadDir, filename);

        console.log(`📁 Attempting to serve file: ${fullPath}`);

        // Check if file exists on filesystem
        if (!fs.existsSync(fullPath)) {
            console.log(`❌ File not found: ${fullPath}`);
            res.status(404).json({
                success: false,
                message: 'File not found'
            });
            return;
        }

        // Find file in database by filename
        const fileRecord = await File.findOne({ filename });

        if (!fileRecord) {
            console.log(`❌ File not found in database: ${filename}`);
            res.status(404).json({
                success: false,
                message: 'File not found'
            });
            return;
        }

        // If file is public, serve it directly
        if (fileRecord.isPublic) {
            console.log(`✅ Serving public file: ${fullPath}`);
            res.sendFile(fullPath);
            return;
        }

        // If file is private, check authentication
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.startsWith('Bearer ')
            ? authHeader.substring(7)
            : null;

        if (!token) {
            console.log(`❌ No token provided for private file: ${filename}`);
            res.status(401).json({
                success: false,
                message: 'Authentication required to access this file'
            });
            return;
        }

        // Verify JWT token
        let userId: string;
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-key') as any;
            userId = decoded.userId;
        } catch (jwtError) {
            console.log(`❌ Invalid token for private file: ${filename}`);
            res.status(401).json({
                success: false,
                message: 'Invalid authentication token'
            });
            return;
        }

        // Check if user owns the file
        if (fileRecord.userId.toString() !== userId) {
            console.log(`❌ User ${userId} trying to access file owned by ${fileRecord.userId}: ${filename}`);
            res.status(403).json({
                success: false,
                message: 'You do not have permission to access this file'
            });
            return;
        }

        // User is authorized, serve the file
        console.log(`✅ Serving private file to authorized user: ${fullPath}`);
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
