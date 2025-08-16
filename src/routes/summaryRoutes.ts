import express from 'express';
import { SummaryController } from '../controller/SummaryController';
import { authenticateToken } from '../middleware/authMiddleware';

const router = express.Router();

// All summary routes require authentication
router.use(authenticateToken);

/**
 * @route POST /api/summary/generate/:fileId
 * @description Generate summary for a specific file
 * @access Private
 */
router.post('/generate/:fileId', SummaryController.generateFileSummary);

/**
 * @route GET /api/summary/:fileId
 * @description Get existing summary for a file
 * @access Private
 */
router.get('/:fileId', SummaryController.getFileSummary);

/**
 * @route PUT /api/summary/regenerate/:fileId
 * @description Regenerate summary for a file (force refresh)
 * @access Private
 */
router.put('/regenerate/:fileId', SummaryController.regenerateFileSummary);

/**
 * @route POST /api/summary/bulk-generate
 * @description Bulk generate summaries for multiple files
 * @access Private
 * @body { fileIds: string[] }
 */
router.post('/bulk-generate', SummaryController.bulkGenerateSummaries);

/**
 * @route GET /api/summary/stats
 * @description Get summary statistics for user's files
 * @access Private
 */
router.get('/stats', SummaryController.getSummaryStats);

/**
 * @route POST /api/summary/test
 * @description Test summary generation with sample text
 * @access Private
 * @body { text: string, filename?: string }
 */
router.post('/test', SummaryController.testSummaryGeneration);

export default router;
