import { Request, Response } from 'express';
import { FileService, CreateFileData } from '../services/FileService';

// Controller for file operations
export class FileController {

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

            // Extract tags from request body (if provided)
            const tags: string[] = req.body.tags
                ? (Array.isArray(req.body.tags) ? req.body.tags : [req.body.tags])
                : [];

            // Prepare file data
            const fileData: CreateFileData = {
                filename: req.file.filename,
                originalname: req.file.originalname,
                mimetype: req.file.mimetype,
                size: req.file.size,
                path: req.file.path,
                tags: tags
            };

            // Save file using service
            const savedFile = await FileService.saveFile(fileData);

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
            // Extract query parameters for pagination and filtering
            const page = parseInt(req.query.page as string) || 1;
            const limit = parseInt(req.query.limit as string) || 10;
            const mimetype = req.query.mimetype as string;
            const tags = req.query.tags as string;
            const sortBy = req.query.sortBy as string;
            const sortOrder = req.query.sortOrder as 'asc' | 'desc';

            // Parse tags if provided
            const tagArray = tags ? tags.split(',').map(tag => tag.trim()) : undefined;

            // Get files using service
            const result = await FileService.getFiles({
                page,
                limit,
                mimetype,
                tags: tagArray,
                sortBy,
                sortOrder
            });

            // Return files with pagination info
            res.status(200).json({
                success: true,
                message: 'Files retrieved successfully',
                data: result.files,
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

            const file = await FileService.getFileById(id);

            if (!file) {
                res.status(404).json({
                    success: false,
                    message: 'File not found'
                });
                return;
            }

            res.status(200).json({
                success: true,
                message: 'File retrieved successfully',
                data: file
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

            const deletedFile = await FileService.deleteFileById(id);

            if (!deletedFile) {
                res.status(404).json({
                    success: false,
                    message: 'File not found'
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

            if (!Array.isArray(tags)) {
                res.status(400).json({
                    success: false,
                    message: 'Tags must be an array'
                });
                return;
            }

            const updatedFile = await FileService.updateFileTags(id, tags);

            if (!updatedFile) {
                res.status(404).json({
                    success: false,
                    message: 'File not found'
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

    // Method to search files
    public static async searchFiles(req: Request, res: Response): Promise<void> {
        try {
            const { q: searchTerm } = req.query;

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

            const tagArray = tags ? tags.split(',').map(tag => tag.trim()) : undefined;

            const result = await FileService.searchFiles(searchTerm, {
                page,
                limit,
                mimetype,
                tags: tagArray,
                sortBy,
                sortOrder
            });

            res.status(200).json({
                success: true,
                message: 'Files search completed successfully',
                data: result.files,
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
