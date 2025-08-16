import { TextExtractorService } from './TextExtractorService';
import { FileService } from './FileService';
import { AIService, AISummaryResult } from '../utils/ai';
import File, { IFile } from '../models/File';
import { Types } from 'mongoose';

/**
 * Service for generating and managing AI-powered file summaries
 */
export class SummaryService {
    
    /**
     * Generate and save summary for a file by ID
     * @param fileId - MongoDB file ID
     * @param userId - User ID for authorization
     * @returns Promise<{ success: boolean, summary?: string, error?: string }>
     */
    public static async generateAndSaveSummary(
        fileId: string, 
        userId: string
    ): Promise<{ success: boolean, summary?: string, error?: string }> {
        try {
            console.log(`📋 Starting summary generation for file: ${fileId}`);

            // Get file details from database
            const file = await FileService.getFileById(fileId, userId);
            if (!file) {
                return {
                    success: false,
                    error: 'File not found or access denied'
                };
            }

            console.log(`📄 Processing file: ${file.originalname} (${file.mimetype})`);

            // Check if summary already exists
            const existingFile = await File.findById(fileId).select('+summary');
            if (existingFile?.summary && existingFile.summary.trim().length > 0) {
                console.log(`✅ Summary already exists for file: ${fileId}`);
                return {
                    success: true,
                    summary: existingFile.summary
                };
            }

            // Extract text content from the file
            const textContent = await this.extractTextFromFile(file);
            
            if (!textContent || textContent.trim().length === 0) {
                return {
                    success: false,
                    error: 'No text content could be extracted from this file'
                };
            }

            console.log(`📝 Extracted ${textContent.length} characters of text`);

            // Generate summary using AI
            const summaryResult = await AIService.generateSummary(textContent, file.originalname);
            
            if (!summaryResult.success || !summaryResult.summary) {
                return {
                    success: false,
                    error: summaryResult.error || 'Failed to generate summary'
                };
            }

            console.log(`🤖 Generated summary with ${summaryResult.summary.length} characters`);

            // Save summary to database
            await File.findByIdAndUpdate(fileId, {
                summary: summaryResult.summary
            });

            console.log(`💾 Summary saved to database for file: ${fileId}`);

            return {
                success: true,
                summary: summaryResult.summary
            };

        } catch (error) {
            console.error('Error generating summary:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    /**
     * Get existing summary for a file
     * @param fileId - MongoDB file ID
     * @param userId - User ID for authorization
     * @returns Promise<{ success: boolean, summary?: string, error?: string }>
     */
    public static async getSummary(
        fileId: string, 
        userId: string
    ): Promise<{ success: boolean, summary?: string, error?: string }> {
        try {
            // Verify user has access to file
            const file = await FileService.getFileById(fileId, userId);
            if (!file) {
                return {
                    success: false,
                    error: 'File not found or access denied'
                };
            }

            // Get summary from database
            const fileWithSummary = await File.findById(fileId).select('+summary');
            
            if (!fileWithSummary?.summary || fileWithSummary.summary.trim().length === 0) {
                return {
                    success: false,
                    error: 'No summary available for this file'
                };
            }

            return {
                success: true,
                summary: fileWithSummary.summary
            };

        } catch (error) {
            console.error('Error getting summary:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    /**
     * Extract text content from a file (R2 or local storage)
     * @param file - File document from database
     * @returns Promise<string> - Extracted text content
     */
    private static async extractTextFromFile(file: IFile): Promise<string> {
        try {
            // Check if file type is supported for text extraction
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

            if (!supportedMimetypes.includes(file.mimetype)) {
                throw new Error(`File type "${file.mimetype}" is not supported for text extraction`);
            }

            let textContent = '';

            // If file is stored in R2, download and extract from buffer
            if (file.r2Url && file.r2ObjectKey) {
                console.log(`☁️ Downloading file from R2: ${file.r2ObjectKey}`);
                
                // Download file from R2 to buffer
                const fileBuffer = await FileService.downloadFileFromR2(file.r2ObjectKey);
                
                // Extract text using buffer
                textContent = await TextExtractorService.extractText({
                    buffer: fileBuffer,
                    filename: file.originalname,
                    mimetype: file.mimetype
                });
            } 
            // If file is stored locally, extract from file path
            else if (file.path) {
                console.log(`💾 Reading file from local path: ${file.path}`);
                
                const fs = require('fs');
                if (!fs.existsSync(file.path)) {
                    throw new Error(`File does not exist at path: ${file.path}`);
                }

                // Extract text using the file path
                textContent = await TextExtractorService.extractText({
                    filePath: file.path,
                    filename: file.originalname,
                    mimetype: file.mimetype
                });
            } else {
                throw new Error('No valid file location found (neither R2 nor local path)');
            }

            return textContent;

        } catch (error) {
            console.error('Error extracting text from file:', error);
            throw new Error(`Text extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Regenerate summary for a file (force refresh)
     * @param fileId - MongoDB file ID
     * @param userId - User ID for authorization
     * @returns Promise<{ success: boolean, summary?: string, error?: string }>
     */
    public static async regenerateSummary(
        fileId: string, 
        userId: string
    ): Promise<{ success: boolean, summary?: string, error?: string }> {
        try {
            // Clear existing summary first
            await File.findByIdAndUpdate(fileId, {
                $unset: { summary: 1 }
            });

            // Generate new summary
            return await this.generateAndSaveSummary(fileId, userId);

        } catch (error) {
            console.error('Error regenerating summary:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    /**
     * Bulk generate summaries for multiple files
     * @param fileIds - Array of MongoDB file IDs
     * @param userId - User ID for authorization
     * @returns Promise<{ completed: number, failed: number, results: Array<{fileId: string, success: boolean, error?: string}> }>
     */
    public static async bulkGenerateSummaries(
        fileIds: string[], 
        userId: string
    ): Promise<{ 
        completed: number, 
        failed: number, 
        results: Array<{fileId: string, success: boolean, error?: string}> 
    }> {
        const results = [];
        let completed = 0;
        let failed = 0;

        for (const fileId of fileIds) {
            try {
                const result = await this.generateAndSaveSummary(fileId, userId);
                if (result.success) {
                    completed++;
                    results.push({ fileId, success: true });
                } else {
                    failed++;
                    results.push({ fileId, success: false, error: result.error });
                }
            } catch (error) {
                failed++;
                results.push({ 
                    fileId, 
                    success: false, 
                    error: error instanceof Error ? error.message : 'Unknown error' 
                });
            }

            // Add small delay to avoid overwhelming the AI API
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        return { completed, failed, results };
    }

    /**
     * Get summary statistics for a user's files
     * @param userId - User ID
     * @returns Promise<{ totalFiles: number, filesWithSummary: number, filesWithoutSummary: number }>
     */
    public static async getSummaryStats(userId: string): Promise<{
        totalFiles: number,
        filesWithSummary: number,
        filesWithoutSummary: number
    }> {
        try {
            const totalFiles = await File.countDocuments({ userId: new Types.ObjectId(userId) });
            
            const filesWithSummary = await File.countDocuments({
                userId: new Types.ObjectId(userId),
                summary: { $exists: true, $nin: ['', null] }
            });

            const filesWithoutSummary = totalFiles - filesWithSummary;

            return {
                totalFiles,
                filesWithSummary,
                filesWithoutSummary
            };

        } catch (error) {
            console.error('Error getting summary stats:', error);
            return {
                totalFiles: 0,
                filesWithSummary: 0,
                filesWithoutSummary: 0
            };
        }
    }
}

export default SummaryService;
