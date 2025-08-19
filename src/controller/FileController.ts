import { Request, Response } from 'express';
import { FileService, CreateFileData } from '../services/FileService';
import { getFileUrl, extractFilename, getUploadDir } from '../utils/uploadPaths';
import fs from 'fs';
import path from 'path';
import SemanticFileService, { FileMetadataWithEmbedding } from '../services/SemanticFileService';
import { SensitiveDataScanService } from '../services/SensitiveDataScanService';
import { IFile } from '../models/File';
// Controller for file operations
import { Types } from 'mongoose';
export class FileController {

    // Helper method to add public URL to file objects
    private static addFileUrl(file: any, req: Request): any {
        const filename = extractFilename(file.path);
        return {
            ...file,
            url: getFileUrl(filename, req)
        };
    }

    // Debug endpoint to help diagnose upload issues
    public static async getDebugInfo(req: Request, res: Response): Promise<void> {
        try {
            const uploadDir = getUploadDir();
            const exists = fs.existsSync(uploadDir);
            const files = exists ? fs.readdirSync(uploadDir) : [];

            res.status(200).json({
                success: true,
                debug: {
                    environment: process.env.NODE_ENV || 'development',
                    workingDirectory: process.cwd(),
                    uploadDirectory: uploadDir,
                    uploadDirExists: exists,
                    filesInUploadDir: files,
                    __dirname: __dirname,
                    baseUrl: process.env.BASE_URL,
                    timestamp: new Date().toISOString()
                }
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Debug info error',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    // Handle single file upload and return file metadata
    public static async uploadFile(req: Request, res: Response): Promise<void> {
        try {
            // Check if file was uploaded
            if (!req.file) {
                res.status(400).json({
                    success: false,
                    message: 'No file uploaded'
                });
                return;
            }

            // Check if user is authenticated
            if (!req.user || !req.user._id) {
                res.status(401).json({
                    success: false,
                    message: 'User authentication required'
                });
                return;
            }

            // Extract tags, isPublic, and partition from request body (if provided)
            const tags: string[] = req.body.tags
                ? (Array.isArray(req.body.tags) ? req.body.tags : [req.body.tags])
                : [];
            const isPublic: boolean = req.body.isPublic === 'true' || req.body.isPublic === true;
            const partition: string = req.body.partition || 'personal'; // Default to 'personal' partition

            // Generate a filename (since we're using memory storage)
            // Import the function from fileRouter or redeclare it here
            const generateFilename = (originalname: string): string => {
                const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
                const fileExtension = path.extname(originalname);
                const baseName = path.basename(originalname, fileExtension);
                const cleanBaseName = baseName.replace(/[^a-zA-Z0-9._-]/g, '_');
                return `${cleanBaseName}-${uniqueSuffix}${fileExtension}`;
            };

            const generatedFilename = req.file.filename || generateFilename(req.file.originalname);

            // Prepare file data with buffer instead of path
            const fileData: CreateFileData = {
                filename: generatedFilename,
                originalname: req.file.originalname,
                mimetype: req.file.mimetype,
                size: req.file.size,
                buffer: req.file.buffer, // Use buffer instead of path
                userId: req.user._id.toString(),
                partition: partition, // Include partition
                isPublic: isPublic,
                tags: tags
            };

            // Save file using service
            const savedFile: IFile = await FileService.saveFile(fileData);

            // Check if the file type is supported for text extraction
            const supportedMimetypes = [
                'application/pdf',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'text/plain',
                'text/csv',
                'image/jpeg',
                'image/jpg',
                'image/png',
                'image/bmp',
                'image/tiff',
                'image/webp'
            ];

            // Process file for embedding generation if it's a supported type
            if (supportedMimetypes.includes(req.file.mimetype) && req.file.buffer) {
                try {
                    const { SemanticFileService } = require('../services/SemanticFileService');

                    // Process the file buffer directly for embedding generation
                    console.log(`Processing file buffer for semantic search: ${(savedFile as any)._id}`);

                    // Generate embedding asynchronously
                    SemanticFileService.processFileForEmbedding({
                        buffer: req.file.buffer,
                        mimetype: req.file.mimetype,
                        filename: req.file.originalname,
                        fileId: (savedFile as any)._id
                    })
                        .then((metadata: FileMetadataWithEmbedding) => {
                            console.log(`✅ Successfully generated embedding for file: ${(savedFile as any)._id}`);
                            // Save the embedding and text preview to the file document
                            return SemanticFileService.saveFileMetadata(metadata);
                        })
                        .then(() => {
                            console.log(`✅ Successfully saved embedding metadata for file: ${(savedFile as any)._id}`);
                        })
                        .catch((err: Error) => {
                            console.error(`❌ Failed to process file ${(savedFile as any)._id} for semantic search:`, err);
                        });

                    // Also generate summary asynchronously
                    const { SummaryService } = require('../services/SummaryService');
                    console.log(`📋 Starting summary generation for file: ${(savedFile as any)._id}`);

                    SummaryService.generateAndSaveSummary((savedFile as any)._id.toString(), req.user._id.toString())
                        .then((summaryResult: any) => {
                            if (summaryResult.success) {
                                console.log(`✅ Successfully generated summary for file: ${(savedFile as any)._id}`);
                            } else {
                                console.error(`❌ Failed to generate summary for file ${(savedFile as any)._id}:`, summaryResult.error);
                            }
                        })
                        .catch((err: Error) => {
                            console.error(`❌ Failed to generate summary for file ${(savedFile as any)._id}:`, err);
                        });

                } catch (embeddingError) {
                    console.error('❌ Failed to generate embedding:', embeddingError);
                }
            } else {
                // Fallback to the path-based method if buffer isn't available
                try {
                    const filePath = savedFile.path;
                    const fileId = (savedFile as any)._id as Types.ObjectId;

                    // Use the legacy method that expects a file path
                    const { SemanticFileService } = require('../services/SemanticFileService');
                    await SemanticFileService.processFileFromPath(filePath, fileId);
                    console.log(`✅ Semantic embedding generated for file ${fileId} using path method`);
                } catch (embeddingError) {
                    console.error('❌ Failed to generate embedding using path method:', embeddingError);
                }
            }

            const filename = extractFilename(savedFile.path);
            const fileUrl = savedFile.r2Url || getFileUrl(filename, req);

            // Return file metadata
            res.status(201).json({
                success: true,
                message: 'File uploaded successfully',
                data: {
                    id: (savedFile as any)._id,
                    filename: savedFile.filename,
                    originalname: savedFile.originalname,
                    mimetype: savedFile.mimetype,
                    size: savedFile.size,
                    path: savedFile.path,
                    url: fileUrl,
                    userId: savedFile.userId,
                    partition: savedFile.partition, // Include partition in response
                    isPublic: savedFile.isPublic,
                    createdAt: savedFile.createdAt,
                    tags: savedFile.tags,
                    storedInR2: !!savedFile.r2Url
                }
            });

        } catch (error) {
            console.error('Error uploading file:', error);
            res.status(500).json({
                success: false,
                message: 'Error uploading file',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    // Fetch all uploaded files from MongoDB
    public static async getAllFiles(req: Request, res: Response): Promise<void> {
        try {

            // Check if user is authenticated
            if (!req.user || !req.user._id) {
                res.status(401).json({
                    success: false,
                    message: 'User authentication required'
                });
                return;
            }



            // Extract query parameters for pagination and filtering
            const page = parseInt(req.query.page as string) || 1;
            const limit = parseInt(req.query.limit as string) || 10;
            const mimetype = req.query.mimetype as string;
            const tags = req.query.tags as string;
            const partition = req.query.partition as string; // Add partition filter
            const sortBy = req.query.sortBy as string;
            const sortOrder = req.query.sortOrder as 'asc' | 'desc';
            const isPublic = req.query.public === 'true';

            // Parse tags if provided
            const tagArray = tags ? tags.split(',').map(tag => tag.trim()) : undefined;

            // Determine query options based on public flag
            const queryOptions = isPublic ? {
                page,
                limit,
                mimetype,
                tags: tagArray,
                partition,
                sortBy,
                sortOrder,
                isPublic: true
            } : {
                page,
                limit,
                mimetype,
                tags: tagArray,
                partition,
                sortBy,
                sortOrder,
                userId: req.user._id.toString()
            };

            // Get files using service
            const result = await FileService.getFiles(queryOptions);


            // Validate that result and files array exist
            if (!result || !result.files) {

                res.status(500).json({
                    success: false,
                    message: 'Error retrieving files from database',
                    error: 'Invalid result structure from file service'
                });
                return;
            }


            // Add URLs to all files - directly inline to avoid any static method issues
            const filesWithUrls = result.files.map((file: any) => {
                try {
                    // Use R2 URL if available, otherwise generate local URL
                    if (file.r2Url) {
                        return {
                            ...file,
                            url: file.r2Url,
                            storedInR2: true
                        };
                    } else {
                        const filename = extractFilename(file.path);
                        return {
                            ...file,
                            url: getFileUrl(filename, req),
                            storedInR2: false
                        };
                    }
                } catch (err) {
                    console.error('Error adding URL to file:', err);
                    return file; // Return file without URL if there's an error
                }
            });


            // Return files with pagination info
            res.status(200).json({
                success: true,
                message: `${isPublic ? 'Public files' : 'User files'} retrieved successfully`,
                data: filesWithUrls,
                pagination: result.pagination
            });

        } catch (error) {
            console.error('Error fetching files:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching files',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    // Additional helper method to get file by ID
    public static async getFileById(req: Request, res: Response): Promise<void> {
        try {
            const { id } = req.params;

            // Check if user is authenticated
            if (!req.user || !req.user._id) {
                res.status(401).json({
                    success: false,
                    message: 'User authentication required'
                });
                return;
            }

            const file = await FileService.getFileById(id, req.user._id.toString());

            if (!file) {
                res.status(404).json({
                    success: false,
                    message: 'File not found or access denied'
                });
                return;
            }

            // Check if client wants JSON response (for API calls) vs file download
            const acceptHeader = req.headers.accept || '';
            const formatQuery = req.query.format as string;
            const wantsJson = acceptHeader.includes('application/json') || formatQuery === 'json';

            console.log('FileController.getFileById debug:', {
                acceptHeader,
                formatQuery,
                wantsJson,
                fileId: id,
                hasR2Url: !!file.r2Url
            });

            if (wantsJson) {
                console.log('Returning JSON response for file:', id);
                // Return file metadata as JSON (for ShareModal and other API consumers)
                let fileWithUrl;
                if (file.r2Url) {
                    fileWithUrl = {
                        ...file,
                        url: file.r2Url,
                        storedInR2: true
                    };
                } else {
                    const filename = extractFilename(file.path);
                    fileWithUrl = {
                        ...file,
                        url: getFileUrl(filename, req),
                        storedInR2: false
                    };
                }

                res.status(200).json({
                    success: true,
                    message: 'File retrieved successfully',
                    data: fileWithUrl
                });
                return;
            }

            console.log('Proceeding with file download/redirect for file:', id);

            // For direct file access (browser navigation), serve the file or redirect
            // Check if the file exists on local disk
            if (file.path && fs.existsSync(file.path)) {
                // If local file exists, serve it directly
                return res.sendFile(file.path);
            } else if (file.r2Url) {
                // If local file doesn't exist but we have R2 URL, redirect to it
                return res.redirect(file.r2Url);
            }

            // If we reach here, neither local file nor R2 URL is valid,
            // fallback to original JSON response

            // Add URL to file inline - use R2 URL if available, otherwise local URL
            let fileWithUrl;
            if (file.r2Url) {
                fileWithUrl = {
                    ...file,
                    url: file.r2Url,
                    storedInR2: true
                };
            } else {
                const filename = extractFilename(file.path);
                fileWithUrl = {
                    ...file,
                    url: getFileUrl(filename, req),
                    storedInR2: false
                };
            }

            res.status(200).json({
                success: true,
                message: 'File retrieved successfully',
                data: fileWithUrl
            });

        } catch (error) {
            console.error('Error fetching file:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching file',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    // Additional helper method to delete file
    public static async deleteFile(req: Request, res: Response): Promise<void> {
        try {
            const { id } = req.params;

            // Check if user is authenticated
            if (!req.user || !req.user._id) {
                res.status(401).json({
                    success: false,
                    message: 'User authentication required'
                });
                return;
            }

            const deletedFile = await FileService.deleteFileById(id, req.user._id.toString());

            if (!deletedFile) {
                res.status(404).json({
                    success: false,
                    message: 'File not found or access denied'
                });
                return;
            }

            res.status(200).json({
                success: true,
                message: 'File deleted successfully',
                data: deletedFile
            });

        } catch (error) {
            console.error('Error deleting file:', error);
            res.status(500).json({
                success: false,
                message: 'Error deleting file',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    // Additional method to update file tags
    public static async updateFileTags(req: Request, res: Response): Promise<void> {
        try {
            const { id } = req.params;
            const { tags } = req.body;

            // Check if user is authenticated
            if (!req.user || !req.user._id) {
                res.status(401).json({
                    success: false,
                    message: 'User authentication required'
                });
                return;
            }

            if (!Array.isArray(tags)) {
                res.status(400).json({
                    success: false,
                    message: 'Tags must be an array'
                });
                return;
            }

            const updatedFile = await FileService.updateFileTags(id, tags, req.user._id.toString());

            if (!updatedFile) {
                res.status(404).json({
                    success: false,
                    message: 'File not found or access denied'
                });
                return;
            }

            res.status(200).json({
                success: true,
                message: 'File tags updated successfully',
                data: updatedFile
            });

        } catch (error) {
            console.error('Error updating file tags:', error);
            res.status(500).json({
                success: false,
                message: 'Error updating file tags',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    // Method to update file public status
    public static async updateFilePublicStatus(req: Request, res: Response): Promise<void> {
        try {
            const { id } = req.params;
            const { isPublic } = req.body;

            // Check if user is authenticated
            if (!req.user || !req.user._id) {
                res.status(401).json({
                    success: false,
                    message: 'User authentication required'
                });
                return;
            }

            if (typeof isPublic !== 'boolean') {
                res.status(400).json({
                    success: false,
                    message: 'isPublic must be a boolean value'
                });
                return;
            }

            const updatedFile = await FileService.updateFilePublicStatus(id, isPublic, req.user._id.toString());

            if (!updatedFile) {
                res.status(404).json({
                    success: false,
                    message: 'File not found or access denied'
                });
                return;
            }

            // Add URL to updated file object for response
            let fileUrl;

            if (updatedFile.r2ObjectKey) {
                try {
                    // Generate a fresh presigned URL that's valid for 24 hours
                    fileUrl = await FileService.generatePresignedUrl(updatedFile.r2ObjectKey);
                } catch (presignError) {
                    console.error('Error generating presigned URL:', presignError);
                    // If we have a stored URL as fallback, use that
                    fileUrl = updatedFile.r2Url;
                }
            } else {
                const filename = extractFilename(updatedFile.path);
                fileUrl = getFileUrl(filename, req);
            }

            res.status(200).json({
                success: true,
                message: `File ${isPublic ? 'made public' : 'made private'} successfully`,
                data: {
                    ...updatedFile.toObject(),
                    url: fileUrl,
                    storedInR2: !!updatedFile.r2ObjectKey
                }
            });

        } catch (error) {
            console.error('Error updating file public status:', error);
            res.status(500).json({
                success: false,
                message: 'Error updating file public status',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    // Method to search files
    public static async searchFiles(req: Request, res: Response): Promise<void> {
        try {
            const { q: searchTerm } = req.query;

            // Check if user is authenticated
            if (!req.user || !req.user._id) {
                res.status(401).json({
                    success: false,
                    message: 'User authentication required'
                });
                return;
            }

            if (!searchTerm || typeof searchTerm !== 'string') {
                res.status(400).json({
                    success: false,
                    message: 'Search term is required'
                });
                return;
            }

            // Extract other query parameters
            const page = parseInt(req.query.page as string) || 1;
            const limit = parseInt(req.query.limit as string) || 10;
            const mimetype = req.query.mimetype as string;
            const tags = req.query.tags as string;
            const partition = req.query.partition as string; // Add partition filter
            const sortBy = req.query.sortBy as string;
            const sortOrder = req.query.sortOrder as 'asc' | 'desc';
            const isPublic = req.query.public === 'true';

            const tagArray = tags ? tags.split(',').map(tag => tag.trim()) : undefined;

            // Determine query options based on public flag
            const searchOptions = isPublic ? {
                page,
                limit,
                mimetype,
                tags: tagArray,
                partition,
                sortBy,
                sortOrder,
                isPublic: true
            } : {
                page,
                limit,
                mimetype,
                tags: tagArray,
                partition,
                sortBy,
                sortOrder,
                userId: req.user._id.toString()
            };

            const result = await FileService.searchFiles(searchTerm, searchOptions);

            // Validate that result and files array exist
            if (!result || !result.files) {
                console.error('❌ Invalid result from FileService.searchFiles:', result);
                res.status(500).json({
                    success: false,
                    message: 'Error searching files in database',
                    error: 'Invalid result structure from file service'
                });
                return;
            }

            // Add URLs to search results - inline to avoid static method issues
            const filesWithUrls = result.files.map(file => {
                try {
                    // Use R2 URL if available, otherwise generate local URL
                    if (file.r2Url) {
                        return {
                            ...file,
                            url: file.r2Url,
                            storedInR2: true
                        };
                    } else {
                        const filename = extractFilename(file.path);
                        return {
                            ...file,
                            url: getFileUrl(filename, req),
                            storedInR2: false
                        };
                    }
                } catch (err) {
                    console.error('Error adding URL to file:', err);
                    return file; // Return file without URL if there's an error
                }
            });

            res.status(200).json({
                success: true,
                message: `${isPublic ? 'Public files' : 'User files'} search completed successfully`,
                data: filesWithUrls,
                pagination: result.pagination
            });

        } catch (error) {
            console.error('Error searching files:', error);
            res.status(500).json({
                success: false,
                message: 'Error searching files',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    // Method to get file statistics
    public static async getFileStats(req: Request, res: Response): Promise<void> {
        try {
            const stats = await FileService.getFileStats();

            res.status(200).json({
                success: true,
                message: 'File statistics retrieved successfully',
                data: stats
            });

        } catch (error) {
            console.error('Error getting file stats:', error);
            res.status(500).json({
                success: false,
                message: 'Error getting file statistics',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    // New dedicated method to get file info as JSON (for ShareModal and API consumers)
    // This will NEVER redirect and ALWAYS returns JSON
    public static async getFileInfo(req: Request, res: Response): Promise<void> {
        try {
            const { id } = req.params;

            // Check if user is authenticated
            if (!req.user || !req.user._id) {
                res.status(401).json({
                    success: false,
                    message: 'User authentication required'
                });
                return;
            }

            const file = await FileService.getFileById(id, req.user._id.toString());

            if (!file) {
                res.status(404).json({
                    success: false,
                    message: 'File not found or access denied'
                });
                return;
            }

            // Always return JSON metadata - never redirect
            let fileWithUrl;
            if (file.r2Url) {
                fileWithUrl = {
                    ...file,
                    url: file.r2Url,
                    storedInR2: true
                };
            } else {
                const filename = extractFilename(file.path);
                fileWithUrl = {
                    ...file,
                    url: getFileUrl(filename, req),
                    storedInR2: false
                };
            }

            res.status(200).json({
                success: true,
                message: 'File info retrieved successfully',
                data: fileWithUrl
            });

        } catch (error) {
            console.error('Error getting file info:', error);
            res.status(500).json({
                success: false,
                message: 'Error getting file info',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    /**
     * Test AI tagging functionality
     * @param req - Express request object
     * @param res - Express response object
     * @returns Promise<void>
     */
    public static async testAITagging(req: Request, res: Response): Promise<void> {
        try {
            console.log('🧪 testAITagging called');
            console.log('👤 req.user exists:', !!req.user);
            console.log('🆔 req.user._id exists:', req.user ? !!req.user._id : 'req.user is null/undefined');

            if (req.user) {
                console.log('📋 req.user keys:', Object.keys(req.user.toObject ? req.user.toObject() : req.user));
                console.log('🔍 req.user._id type:', typeof req.user._id);
                console.log('🔍 req.user._id value:', req.user._id);
            }

            // Check if user is authenticated
            if (!req.user || !req.user._id) {
                console.log('❌ Authentication check failed');
                res.status(401).json({
                    success: false,
                    message: 'User authentication required'
                });
                return;
            }

            console.log('✅ Authentication check passed');

            const { text, filename } = req.body;

            if (!text || typeof text !== 'string') {
                res.status(400).json({
                    success: false,
                    message: 'Text content is required'
                });
                return;
            }

            const filenameToUse = filename || 'test-document.txt';

            // Import the AI service
            const { AIService } = require('../utils/ai');

            console.log(`Testing AI tagging for: ${filenameToUse}`);
            const result = await AIService.generateTags(text, filenameToUse);

            res.status(200).json({
                success: true,
                message: 'AI tagging test completed',
                data: {
                    originalText: text.substring(0, 200) + (text.length > 200 ? '...' : ''),
                    filename: filenameToUse,
                    aiTaggingResult: result
                }
            });

        } catch (error) {
            console.error('Error testing AI tagging:', error);
            res.status(500).json({
                success: false,
                message: 'Error testing AI tagging',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    /**
     * Get all files in trash for the authenticated user
     * @param req - Express request object
     * @param res - Express response object
     * @returns Promise<void>
     */
    public static async getTrashFiles(req: Request, res: Response): Promise<void> {
        try {
            // Check if user is authenticated
            if (!req.user || !req.user._id) {
                res.status(401).json({
                    success: false,
                    message: 'User authentication required'
                });
                return;
            }

            // Extract query parameters for pagination
            const page = parseInt(req.query.page as string) || 1;
            const limit = parseInt(req.query.limit as string) || 10;
            const mimetype = req.query.mimetype as string;
            const sortBy = req.query.sortBy as string || 'deletedAt';
            const sortOrder = req.query.sortOrder as 'asc' | 'desc' || 'desc';
            const searchKeyword = req.query.q as string;

            const queryOptions = {
                page,
                limit,
                mimetype,
                sortBy,
                sortOrder,
                searchKeyword
            };

            // Get trash files using service
            const result = await FileService.getTrashFiles(req.user._id.toString(), queryOptions);

            // Add URLs to trash files
            const filesWithUrls = result.files.map((file: any) => {
                try {
                    // Use R2 URL if available, otherwise generate local URL
                    if (file.r2Url) {
                        return {
                            ...file,
                            url: file.r2Url,
                            storedInR2: true
                        };
                    } else {
                        const filename = extractFilename(file.path);
                        return {
                            ...file,
                            url: getFileUrl(filename, req),
                            storedInR2: false
                        };
                    }
                } catch (err) {
                    console.error('Error adding URL to trash file:', err);
                    return file;
                }
            });

            res.status(200).json({
                success: true,
                message: 'Trash files retrieved successfully',
                data: filesWithUrls,
                pagination: result.pagination
            });

        } catch (error) {
            console.error('Error fetching trash files:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching trash files',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    /**
     * Restore a file from trash
     * @param req - Express request object
     * @param res - Express response object
     * @returns Promise<void>
     */
    public static async restoreFile(req: Request, res: Response): Promise<void> {
        try {
            const { id } = req.params;

            // Check if user is authenticated
            if (!req.user || !req.user._id) {
                res.status(401).json({
                    success: false,
                    message: 'User authentication required'
                });
                return;
            }

            const restoredFile = await FileService.restoreFileFromTrash(id, req.user._id.toString());

            if (!restoredFile) {
                res.status(404).json({
                    success: false,
                    message: 'File not found in trash or access denied'
                });
                return;
            }

            // Add URL to restored file
            let fileWithUrl;
            if (restoredFile.r2Url) {
                fileWithUrl = {
                    ...restoredFile.toObject(),
                    url: restoredFile.r2Url,
                    storedInR2: true
                };
            } else {
                const filename = extractFilename(restoredFile.path);
                fileWithUrl = {
                    ...restoredFile.toObject(),
                    url: getFileUrl(filename, req),
                    storedInR2: false
                };
            }

            res.status(200).json({
                success: true,
                message: 'File restored successfully',
                data: fileWithUrl
            });

        } catch (error) {
            console.error('Error restoring file:', error);
            res.status(500).json({
                success: false,
                message: 'Error restoring file',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    /**
     * Permanently delete a file from trash
     * @param req - Express request object
     * @param res - Express response object
     * @returns Promise<void>
     */
    public static async permanentlyDeleteFile(req: Request, res: Response): Promise<void> {
        try {
            const { id } = req.params;

            // Check if user is authenticated
            if (!req.user || !req.user._id) {
                res.status(401).json({
                    success: false,
                    message: 'User authentication required'
                });
                return;
            }

            const deletedFile = await FileService.permanentlyDeleteFile(id, req.user._id.toString());

            if (!deletedFile) {
                res.status(404).json({
                    success: false,
                    message: 'File not found in trash or access denied'
                });
                return;
            }

            res.status(200).json({
                success: true,
                message: 'File permanently deleted successfully',
                data: {
                    id: deletedFile._id,
                    filename: deletedFile.filename,
                    originalname: deletedFile.originalname
                }
            });

        } catch (error) {
            console.error('Error permanently deleting file:', error);
            res.status(500).json({
                success: false,
                message: 'Error permanently deleting file',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    /**
     * Empty trash (permanently delete all files in trash)
     * @param req - Express request object
     * @param res - Express response object
     * @returns Promise<void>
     */
    public static async emptyTrash(req: Request, res: Response): Promise<void> {
        try {
            // Check if user is authenticated
            if (!req.user || !req.user._id) {
                res.status(401).json({
                    success: false,
                    message: 'User authentication required'
                });
                return;
            }

            const result = await FileService.emptyTrash(req.user._id.toString());

            res.status(200).json({
                success: true,
                message: `Trash emptied successfully. ${result.deletedCount} files permanently deleted.`,
                data: {
                    deletedCount: result.deletedCount,
                    errors: result.errors
                }
            });

        } catch (error) {
            console.error('Error emptying trash:', error);
            res.status(500).json({
                success: false,
                message: 'Error emptying trash',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    /**
     * Scan file for sensitive data before making it public
     * @param req - Express request object with fileId param and optional text content
     * @param res - Express response object
     * @returns Promise<void>
     */
    public static async scanForSensitiveData(req: Request, res: Response): Promise<void> {
        try {
            const { id } = req.params;
            const { textContent } = req.body;

            // Check if user is authenticated
            if (!req.user || !req.user._id) {
                res.status(401).json({
                    success: false,
                    message: 'User authentication required'
                });
                return;
            }

            if (!id) {
                res.status(400).json({
                    success: false,
                    message: 'File ID is required'
                });
                return;
            }

            // Get file information
            const file = await FileService.getFileById(id, req.user._id.toString());
            if (!file) {
                res.status(404).json({
                    success: false,
                    message: 'File not found or access denied'
                });
                return;
            }

            let content = textContent;
            let fileBuffer: Buffer | undefined;

            // If no text content provided, try to extract it from the file
            if (!content) {
                try {
                    if (file.path && fs.existsSync(file.path)) {
                        // For images and text files, we'll use the new method that supports OCR
                        if (file.mimetype?.includes('image/')) {
                            // For images, we'll use the scanFileForSensitiveData method with OCR
                            const scanResult = await SensitiveDataScanService.scanFileForSensitiveData(
                                file.path,
                                undefined,
                                file.originalname,
                                file.mimetype || ''
                            );

                            // Log scan result for monitoring
                            console.log(`Sensitive data scan for image file ${id}:`, {
                                containsSensitive: scanResult.containsSensitiveData,
                                riskLevel: scanResult.riskLevel,
                                types: scanResult.sensitiveDataTypes
                            });

                            res.status(200).json({
                                success: true,
                                message: 'File scanned successfully',
                                data: {
                                    fileId: file._id,
                                    filename: file.originalname,
                                    scanResult: {
                                        containsSensitiveData: scanResult.containsSensitiveData,
                                        riskLevel: scanResult.riskLevel,
                                        confidence: scanResult.confidence,
                                        sensitiveDataTypes: scanResult.sensitiveDataTypes,
                                        details: scanResult.details,
                                        recommendation: scanResult.containsSensitiveData
                                            ? 'This file contains potentially sensitive information. Consider keeping it private.'
                                            : 'No sensitive data detected. File appears safe to share publicly.'
                                    }
                                }
                            });
                            return;
                        } else if (file.mimetype?.includes('text/') || file.mimetype?.includes('application/json')) {
                            content = fs.readFileSync(file.path, 'utf8');
                        } else {
                            // For other files, we'll use filename and metadata for basic scan
                            content = `${file.originalname} ${file.mimetype || ''} ${(file as any).tags?.join(' ') || ''}`;
                        }
                    } else if ((file as any).r2ObjectKey) {
                        // For R2 stored files, check if we have buffer access for images
                        if (file.mimetype?.includes('image/')) {
                            // For R2 images, we need to download the file first
                            // This is a limitation - for now, fall back to metadata scan
                            console.warn('Image file stored in R2 - OCR not available, using metadata scan');
                            content = `${file.originalname} ${file.mimetype || ''} ${(file as any).tags?.join(' ') || ''}`;
                        } else {
                            // For R2 stored files, we'll use metadata for basic scan
                            content = `${file.originalname} ${file.mimetype || ''} ${(file as any).tags?.join(' ') || ''}`;
                        }
                    } else {
                        res.status(400).json({
                            success: false,
                            message: 'Cannot extract text content from this file type. Please provide text content manually.'
                        });
                        return;
                    }
                } catch (extractError) {
                    console.error('Error extracting file content:', extractError);
                    // Use basic metadata for scan
                    content = `${file.originalname} ${file.mimetype || ''} ${(file as any).tags?.join(' ') || ''}`;
                }
            }

            if (!content || content.trim().length === 0) {
                res.status(400).json({
                    success: false,
                    message: 'No content available for scanning'
                });
                return;
            }

            // Perform sensitive data scan for non-image files
            const scanResult = await SensitiveDataScanService.scanForSensitiveData(
                content,
                file.originalname
            );

            // Log scan result for monitoring
            console.log(`Sensitive data scan for file ${id}:`, {
                containsSensitive: scanResult.containsSensitiveData,
                riskLevel: scanResult.riskLevel,
                types: scanResult.sensitiveDataTypes
            });

            res.status(200).json({
                success: true,
                message: 'File scanned successfully',
                data: {
                    fileId: file._id,
                    filename: file.originalname,
                    scanResult: {
                        containsSensitiveData: scanResult.containsSensitiveData,
                        riskLevel: scanResult.riskLevel,
                        confidence: scanResult.confidence,
                        sensitiveDataTypes: scanResult.sensitiveDataTypes,
                        details: scanResult.details,
                        recommendation: scanResult.containsSensitiveData
                            ? 'This file contains potentially sensitive information. Consider keeping it private.'
                            : 'No sensitive data detected. File appears safe to share publicly.'
                    }
                }
            });

        } catch (error) {
            console.error('Error scanning file for sensitive data:', error);
            res.status(500).json({
                success: false,
                message: 'Error scanning file for sensitive data',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
}
