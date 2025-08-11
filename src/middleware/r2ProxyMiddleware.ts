import { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import File from '../models/File';
import jwt from 'jsonwebtoken';
import { FileService } from '../services/FileService';

/**
 * Middleware to proxy R2 files through our backend to avoid CORS issues with Cloudflare
 * Works for both public and private files while respecting authentication
 */
export const proxyR2File = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const filename = req.params.filename;
        
        if (!filename) {
            return res.status(400).json({
                success: false,
                message: 'Filename is required'
            });
        }

        console.log(`R2 Proxy: Processing request for ${filename}`);

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
                console.log(`R2 Proxy: Authenticated user ${userId}`);
            } catch (tokenError) {
                console.error('R2 Proxy: Invalid token:', tokenError);
                // Continue without userId - will only allow public files
            }
        }

        // Find the file in the database
        const file = await File.findOne({ filename });

        if (!file) {
            console.error(`R2 Proxy: File not found: ${filename}`);
            return res.status(404).json({
                success: false,
                message: 'File not found'
            });
        }

        // Check access permissions
        if (!file.isPublic && (!userId || file.userId.toString() !== userId)) {
            console.error(`R2 Proxy: Access denied for ${filename} - authentication required`);
            return res.status(401).json({
                success: false,
                message: 'Authentication required for this private file'
            });
        }

        // Determine the source URL for the file
        let sourceUrl: string;
        
        if (file.r2ObjectKey) {
            // Generate a fresh presigned URL with short expiry
            try {
                // Use a longer expiry for public files, shorter for private
                const expirySeconds = file.isPublic ? 86400 : 3600; // 24h or 1h
                sourceUrl = await FileService.generatePresignedUrl(file.r2ObjectKey, expirySeconds);
                console.log(`R2 Proxy: Generated presigned URL for ${filename}`);
            } catch (error) {
                console.error('R2 Proxy: Error generating presigned URL:', error);
                return res.status(500).json({
                    success: false,
                    message: 'Error generating access URL'
                });
            }
        } else if (file.r2Url) {
            // Use the stored URL as fallback
            sourceUrl = file.r2Url;
            console.log(`R2 Proxy: Using stored R2 URL for ${filename}`);
        } else {
            console.error(`R2 Proxy: No R2 location available for ${filename}`);
            return res.status(404).json({
                success: false,
                message: 'File content unavailable'
            });
        }

        // Proxy the content through our server
        try {
            const response = await axios({
                method: 'GET',
                url: sourceUrl,
                responseType: 'stream',
                timeout: 30000, // 30 second timeout
            });

            // Set appropriate headers
            res.setHeader('Content-Type', file.mimetype || 'application/octet-stream');
            res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.originalname)}"`);
            
            // Add cache control headers - cache public files longer
            if (file.isPublic) {
                res.setHeader('Cache-Control', 'public, max-age=86400'); // 24 hours
            } else {
                res.setHeader('Cache-Control', 'private, max-age=3600'); // 1 hour
            }
            
            // Stream the response directly to the client
            response.data.pipe(res);

            // Handle errors in the stream
            response.data.on('error', (error: Error) => {
                console.error(`R2 Proxy: Stream error for ${filename}:`, error);
                // If we haven't sent headers yet, send error response
                if (!res.headersSent) {
                    res.status(500).json({
                        success: false,
                        message: 'Error streaming file content'
                    });
                }
            });
        } catch (error) {
            console.error(`R2 Proxy: Failed to proxy ${filename}:`, error);
            return res.status(500).json({
                success: false,
                message: 'Error retrieving file from storage'
            });
        }
    } catch (error) {
        console.error('R2 Proxy middleware error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};
