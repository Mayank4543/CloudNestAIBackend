import { Request, Response } from 'express';
import { FileService, CreateFileData } from '../services/FileService';
import { getFileUrl, extractFilename, getUploadDir } from '../utils/uploadPaths';
import fs from 'fs';
import path from 'path';
import SemanticFileService, { FileMetadataWithEmbedding } from '../services/SemanticFileService';
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

            // Extract tags and isPublic from request body (if provided)
            const tags: string[] = req.body.tags
                ? (Array.isArray(req.body.tags) ? req.body.tags : [req.body.tags])
                : [];
            const isPublic: boolean = req.body.isPublic === 'true' || req.body.isPublic === true;

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
                isPublic: isPublic,
                tags: tags
            };

            // Save file using service
            const savedFile = await FileService.saveFile(fileData);

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
                    console.log(`Processing file buffer for semantic search: ${savedFile._id}`);

                    // Generate embedding asynchronously
                    SemanticFileService.processFileForEmbedding({
                        buffer: req.file.buffer,
                        mimetype: req.file.mimetype,
                        filename: req.file.originalname,
                        fileId: savedFile._id
                    })
                        .then((metadata: FileMetadataWithEmbedding) => {
                            console.log(`✅ Successfully generated embedding for file: ${savedFile._id}`);
                            // Save the embedding and text preview to the file document
                            return SemanticFileService.saveFileMetadata(metadata);
                        })
                        .then(() => {
                            console.log(`✅ Successfully saved embedding metadata for file: ${savedFile._id}`);
                        })
                        .catch((err: Error) => {
                            console.error(`❌ Failed to process file ${savedFile._id} for semantic search:`, err);
                        });
                } catch (embeddingError) {
                    console.error('❌ Failed to generate embedding:', embeddingError);
                }
            } else {
                // Fallback to the path-based method if buffer isn't available
                try {
                    const filePath = savedFile.path;
                    const fileId = savedFile._id as Types.ObjectId;

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
                    id: savedFile._id,
                    filename: savedFile.filename,
                    originalname: savedFile.originalname,
                    mimetype: savedFile.mimetype,
                    size: savedFile.size,
                    path: savedFile.path,
                    url: fileUrl,
                    userId: savedFile.userId,
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
                sortBy,
                sortOrder,
                isPublic: true
            } : {
                page,
                limit,
                mimetype,
                tags: tagArray,
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
                sortBy,
                sortOrder,
                isPublic: true
            } : {
                page,
                limit,
                mimetype,
                tags: tagArray,
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
     * Summarize file content using AI
     */
    public static async summarizeFile(req: Request, res: Response): Promise<void> {
        try {
            // Check if user is authenticated
            if (!req.user || !req.user._id) {
                res.status(401).json({
                    success: false,
                    message: 'User authentication required'
                });
                return;
            }

            const { id: fileId } = req.params;

            if (!fileId) {
                res.status(400).json({
                    success: false,
                    message: 'File ID is required'
                });
                return;
            }

            console.log(`Summarizing file: ${fileId}`);

            // Get the file details first
            const file = await FileService.getFileById(fileId, req.user._id.toString());

            if (!file) {
                res.status(404).json({
                    success: false,
                    message: 'File not found'
                });
                return;
            }

            // Extract text content from the file
            const { TextExtractorService } = require('../services/TextExtractorService');
            let textContent = '';

            try {
                // Extract text using the file path
                textContent = await TextExtractorService.extractText({
                    filePath: file.path,
                    filename: file.originalname,
                    mimetype: file.mimetype
                });

                if (!textContent || textContent.trim().length === 0) {
                    res.status(400).json({
                        success: false,
                        message: 'No text content could be extracted from this file'
                    });
                    return;
                }
            } catch (extractError) {
                console.error('Text extraction error:', extractError);
                res.status(400).json({
                    success: false,
                    message: 'Unable to extract text from this file type'
                });
                return;
            }

            // Import the AI service and generate summary
            const { AIService } = require('../utils/ai');
            
            // Create a summary prompt
            const summaryPrompt = `Please provide a comprehensive summary of the following document content. Focus on the main points, key findings, and important details:\n\n${textContent}`;
            
            const result = await AIService.generateTags(summaryPrompt, `Summary of ${file.originalname}`);

            if (!result.success) {
                res.status(500).json({
                    success: false,
                    message: 'Failed to generate summary',
                    error: result.error
                });
                return;
            }

            // The AI service returns tags, but we'll use it for summary generation
            // Extract the summary from the AI response
            const summary = result.tags.join('\n\n');

            res.status(200).json({
                success: true,
                message: 'File summary generated successfully',
                data: {
                    fileId: file._id,
                    filename: file.originalname,
                    summary: summary,
                    textContent: textContent.substring(0, 500) + (textContent.length > 500 ? '...' : '')
                }
            });

        } catch (error) {
            console.error('Error summarizing file:', error);
            res.status(500).json({
                success: false,
                message: 'Error generating file summary',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
}
