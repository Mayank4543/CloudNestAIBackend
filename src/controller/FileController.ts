import { Request, Response } from 'express';
import { FileService, CreateFileData } from '../services/FileService';
import { getFileUrl, extractFilename, getUploadDir } from '../utils/uploadPaths';
import fs from 'fs';
import path from 'path';

// Controller for file operations
export class FileController {

    // Helper method to add public URL to file objects
    private static addFileUrl(file: any, req: Request): any {
        const filename = extractFilename(file.path);
        return {
            ...file,
            url: getFileUrl(filename, req)
        };
    }

    // Helper method to add URLs to multiple files
    private static addFileUrls(files: any[], req: Request): any[] {
        return files.map(file => this.addFileUrl(file, req));
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

            // Prepare file data
            const fileData: CreateFileData = {
                filename: req.file.filename,
                originalname: req.file.originalname,
                mimetype: req.file.mimetype,
                size: req.file.size,
                path: req.file.path,
                userId: req.user._id.toString(),
                isPublic: isPublic,
                tags: tags
            };

            // Save file using service
            const savedFile = await FileService.saveFile(fileData);

            // Generate public URL for the uploaded file
            const filename = extractFilename(savedFile.path);
            const fileUrl = getFileUrl(filename, req);

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
                    url: fileUrl, // Public URL for accessing the file
                    userId: savedFile.userId,
                    isPublic: savedFile.isPublic,
                    createdAt: savedFile.createdAt,
                    tags: savedFile.tags
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

            // Add URLs to all files
            const filesWithUrls = this.addFileUrls(result.files, req);

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

            const fileWithUrl = this.addFileUrl(file, req);

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

            res.status(200).json({
                success: true,
                message: `File ${isPublic ? 'made public' : 'made private'} successfully`,
                data: updatedFile
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

            // Add URLs to search results
            const filesWithUrls = this.addFileUrls(result.files, req);

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
}
