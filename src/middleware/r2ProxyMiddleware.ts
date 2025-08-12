import { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import File from '../models/File';
import jwt from 'jsonwebtoken';
import { FileService } from '../services/FileService';
import cors from 'cors';

/**
 * Configure CORS specifically for the proxy endpoint
 * This ensures all origins are allowed for the proxy
 */
export const proxyFileCors = cors({
    origin: function (origin, callback) {
        const allowedOrigins = [
            'http://localhost:3000',
            'https://cloudnestai.vercel.app',
            'https://cloudnestai.com',
            // Add any other frontend origins here
        ];

        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV !== 'production') {
            callback(null, true);
        } else {
            console.log(`CORS blocked for origin: ${origin}`);
            // Still allow the request, but log it for debugging
            callback(null, true);
        }
    },
    credentials: true,
    maxAge: 86400 // CORS preflight cache time (24 hours)
});

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

        // Clean the filename parameter - remove any URL encoding and trailing spaces
        const cleanedFilename = decodeURIComponent(filename).trim();
        console.log(`R2 Proxy: Cleaned filename: "${cleanedFilename}"`);

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

        console.log(`R2 Proxy: Searching for file with filename: "${cleanedFilename}"`);

        // Find the file in the database - try multiple approaches
        let file = await File.findOne({ filename: cleanedFilename });

        // If not found with exact match, try with the original filename
        if (!file && cleanedFilename !== filename) {
            file = await File.findOne({ filename });
            if (file) {
                console.log(`R2 Proxy: Found file using original filename`);
            }
        }

        if (!file) {
            console.error(`R2 Proxy: File not found: ${cleanedFilename}`);

            // For debugging - let's check if we can find any file
            const anyFile = await File.findOne({});
            if (anyFile) {
                console.log(`R2 Proxy: However, found at least one file in DB with filename: ${anyFile.filename}`);
            } else {
                console.log(`R2 Proxy: No files exist in the database at all`);
            }

            // Try these alternate lookup methods
            try {
                // Method 1: Try looking for partial match before the first dash
                let partialMatches = null;

                if (cleanedFilename.includes('-')) {
                    const baseFilename = cleanedFilename.split('-')[0];
                    console.log(`R2 Proxy: Trying to match on base filename: ${baseFilename}`);

                    partialMatches = await File.find({
                        filename: { $regex: new RegExp(baseFilename, 'i') }
                    }).limit(1);
                }

                if (partialMatches && partialMatches.length > 0) {
                    console.log(`R2 Proxy: Found partial match: ${partialMatches[0].filename}`);
                    file = partialMatches[0];
                } else {
                    // Method 2: Try by originalname
                    console.log(`R2 Proxy: Trying to match on original filename`);
                    const fileByOriginal = await File.findOne({
                        originalname: { $regex: new RegExp(cleanedFilename.split('-')[0], 'i') }
                    });

                    if (fileByOriginal) {
                        console.log(`R2 Proxy: Found by original name: ${fileByOriginal.originalname}`);
                        file = fileByOriginal;
                    } else {
                        // Method 3: Get the most recent file as a fallback
                        console.log(`R2 Proxy: No matches found. Getting most recent file as fallback...`);
                        const recentFile = await File.findOne().sort({ createdAt: -1 });

                        if (recentFile) {
                            console.log(`R2 Proxy: Using most recent file: ${recentFile.filename}`);
                            // Don't automatically use this - just inform the user
                            return res.status(404).json({
                                success: false,
                                message: 'File not found',
                                requestedFilename: cleanedFilename,
                                helpMessage: 'The file was not found. Try using the exact filename.',
                                suggestions: [
                                    {
                                        message: 'Most recent file in the system:',
                                        filename: recentFile.filename,
                                        originalname: recentFile.originalname,
                                        url: `/api/proxy/${encodeURIComponent(recentFile.filename)}`
                                    }
                                ]
                            });
                        }
                    }
                }

                // If we still don't have a file, return 404
                if (!file) {
                    return res.status(404).json({
                        success: false,
                        message: 'File not found',
                        requestedFilename: cleanedFilename,
                        helpMessage: 'The exact filename must match a record in the database'
                    });
                }

            } catch (err) {
                console.error(`R2 Proxy: Error during alternate lookup:`, err);
                return res.status(500).json({
                    success: false,
                    message: 'Error looking up file',
                    error: err instanceof Error ? err.message : 'Unknown error'
                });
            }
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

            // Enable CORS headers
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
            res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours

            // Set appropriate content headers
            res.setHeader('Content-Type', file.mimetype || 'application/octet-stream');
            res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.originalname)}"`);

            // Transfer content length header if available to improve loading indicators
            if (response.headers['content-length']) {
                res.setHeader('Content-Length', response.headers['content-length']);
            }

            // Add cache control headers - cache public files longer
            if (file.isPublic) {
                res.setHeader('Cache-Control', 'public, max-age=86400'); // 24 hours
            } else {
                res.setHeader('Cache-Control', 'private, max-age=3600'); // 1 hour
            }

            // Add a header to indicate this is a proxied response
            res.setHeader('X-Proxied-By', 'CloudNestAI-Backend');

            // Stream the response directly to the client without redirecting
            response.data.pipe(res);

            // Handle successful completion
            response.data.on('end', () => {
                console.log(`R2 Proxy: Successfully streamed ${filename}`);
            });

            // Handle errors in the stream
            response.data.on('error', (error: Error) => {
                console.error(`R2 Proxy: Stream error for ${filename}:`, error);
                // If we haven't sent headers yet, send error response
                if (!res.headersSent) {
                    res.status(500).json({
                        success: false,
                        message: 'Error streaming file content'
                    });
                } else {
                    // If headers already sent, try to end the response properly
                    try {
                        res.end();
                    } catch (e) {
                        console.error('Error ending response stream:', e);
                    }
                }
            });
        } catch (error) {
            console.error(`R2 Proxy: Failed to proxy ${filename}:`, error);

            // Enhanced error handling with specific status codes
            if (axios.isAxiosError(error)) {
                const statusCode = error.response?.status || 500;
                let errorMessage = 'Error retrieving file from storage';

                // Handle specific error codes
                if (statusCode === 403) {
                    errorMessage = 'Access denied or URL expired';
                } else if (statusCode === 404) {
                    errorMessage = 'File not found in storage';
                } else if (statusCode === 429) {
                    errorMessage = 'Too many requests to storage provider';
                }

                return res.status(statusCode).json({
                    success: false,
                    message: errorMessage,
                    error: process.env.NODE_ENV === 'development' ? error.message : undefined
                });
            }

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
