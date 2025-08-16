import { Request, Response } from 'express';
import { SummaryService } from '../services/SummaryService';

/**
 * Controller for file summary operations
 */
export class SummaryController {

    /**
     * Generate summary for a specific file
     * @param req - Express request object
     * @param res - Express response object
     */
    public static async generateFileSummary(req: Request, res: Response): Promise<void> {
        try {
            // Check if user is authenticated
            if (!req.user || !req.user._id) {
                res.status(401).json({
                    success: false,
                    message: 'User authentication required'
                });
                return;
            }

            const { fileId } = req.params;

            if (!fileId) {
                res.status(400).json({
                    success: false,
                    message: 'File ID is required'
                });
                return;
            }

            console.log(`📋 Generating summary for file: ${fileId}`);

            // Generate and save summary
            const result = await SummaryService.generateAndSaveSummary(fileId, req.user._id.toString());

            if (!result.success) {
                res.status(400).json({
                    success: false,
                    message: 'Failed to generate summary',
                    error: result.error
                });
                return;
            }

            res.status(200).json({
                success: true,
                message: 'Summary generated successfully',
                data: {
                    fileId,
                    summary: result.summary,
                    generatedAt: new Date().toISOString()
                }
            });

        } catch (error) {
            console.error('Error generating file summary:', error);
            res.status(500).json({
                success: false,
                message: 'Error generating file summary',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    /**
     * Get existing summary for a file
     * @param req - Express request object
     * @param res - Express response object
     */
    public static async getFileSummary(req: Request, res: Response): Promise<void> {
        try {
            // Check if user is authenticated
            if (!req.user || !req.user._id) {
                res.status(401).json({
                    success: false,
                    message: 'User authentication required'
                });
                return;
            }

            const { fileId } = req.params;

            if (!fileId) {
                res.status(400).json({
                    success: false,
                    message: 'File ID is required'
                });
                return;
            }

            console.log(`📖 Getting summary for file: ${fileId}`);

            // Get existing summary
            const result = await SummaryService.getSummary(fileId, req.user._id.toString());

            if (!result.success) {
                res.status(404).json({
                    success: false,
                    message: 'Summary not found',
                    error: result.error
                });
                return;
            }

            res.status(200).json({
                success: true,
                message: 'Summary retrieved successfully',
                data: {
                    fileId,
                    summary: result.summary
                }
            });

        } catch (error) {
            console.error('Error getting file summary:', error);
            res.status(500).json({
                success: false,
                message: 'Error getting file summary',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    /**
     * Regenerate summary for a file (force refresh)
     * @param req - Express request object
     * @param res - Express response object
     */
    public static async regenerateFileSummary(req: Request, res: Response): Promise<void> {
        try {
            // Check if user is authenticated
            if (!req.user || !req.user._id) {
                res.status(401).json({
                    success: false,
                    message: 'User authentication required'
                });
                return;
            }

            const { fileId } = req.params;

            if (!fileId) {
                res.status(400).json({
                    success: false,
                    message: 'File ID is required'
                });
                return;
            }

            console.log(`🔄 Regenerating summary for file: ${fileId}`);

            // Regenerate summary
            const result = await SummaryService.regenerateSummary(fileId, req.user._id.toString());

            if (!result.success) {
                res.status(400).json({
                    success: false,
                    message: 'Failed to regenerate summary',
                    error: result.error
                });
                return;
            }

            res.status(200).json({
                success: true,
                message: 'Summary regenerated successfully',
                data: {
                    fileId,
                    summary: result.summary,
                    regeneratedAt: new Date().toISOString()
                }
            });

        } catch (error) {
            console.error('Error regenerating file summary:', error);
            res.status(500).json({
                success: false,
                message: 'Error regenerating file summary',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    /**
     * Bulk generate summaries for multiple files
     * @param req - Express request object
     * @param res - Express response object
     */
    public static async bulkGenerateSummaries(req: Request, res: Response): Promise<void> {
        try {
            // Check if user is authenticated
            if (!req.user || !req.user._id) {
                res.status(401).json({
                    success: false,
                    message: 'User authentication required'
                });
                return;
            }

            const { fileIds } = req.body;

            if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
                res.status(400).json({
                    success: false,
                    message: 'Array of file IDs is required'
                });
                return;
            }

            console.log(`📚 Bulk generating summaries for ${fileIds.length} files`);

            // Generate summaries for multiple files
            const result = await SummaryService.bulkGenerateSummaries(fileIds, req.user._id.toString());

            res.status(200).json({
                success: true,
                message: `Bulk summary generation completed. ${result.completed} successful, ${result.failed} failed.`,
                data: {
                    completed: result.completed,
                    failed: result.failed,
                    results: result.results,
                    processedAt: new Date().toISOString()
                }
            });

        } catch (error) {
            console.error('Error bulk generating summaries:', error);
            res.status(500).json({
                success: false,
                message: 'Error bulk generating summaries',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    /**
     * Get summary statistics for user's files
     * @param req - Express request object
     * @param res - Express response object
     */
    public static async getSummaryStats(req: Request, res: Response): Promise<void> {
        try {
            // Check if user is authenticated
            if (!req.user || !req.user._id) {
                res.status(401).json({
                    success: false,
                    message: 'User authentication required'
                });
                return;
            }

            console.log(`📊 Getting summary statistics for user: ${req.user._id}`);

            // Get summary statistics
            const stats = await SummaryService.getSummaryStats(req.user._id.toString());

            res.status(200).json({
                success: true,
                message: 'Summary statistics retrieved successfully',
                data: stats
            });

        } catch (error) {
            console.error('Error getting summary stats:', error);
            res.status(500).json({
                success: false,
                message: 'Error getting summary statistics',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    /**
     * Test summary generation with sample text
     * @param req - Express request object
     * @param res - Express response object
     */
    public static async testSummaryGeneration(req: Request, res: Response): Promise<void> {
        try {
            // Check if user is authenticated
            if (!req.user || !req.user._id) {
                res.status(401).json({
                    success: false,
                    message: 'User authentication required'
                });
                return;
            }

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

            console.log(`🧪 Testing summary generation for: ${filenameToUse}`);
            const result = await AIService.generateSummary(text, filenameToUse);

            res.status(200).json({
                success: true,
                message: 'Summary generation test completed',
                data: {
                    originalText: text.substring(0, 200) + (text.length > 200 ? '...' : ''),
                    filename: filenameToUse,
                    summaryResult: result,
                    testCompletedAt: new Date().toISOString()
                }
            });

        } catch (error) {
            console.error('Error testing summary generation:', error);
            res.status(500).json({
                success: false,
                message: 'Error testing summary generation',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
}

export default SummaryController;
