import express from 'express';
import { PartitionController } from '../controller/PartitionController';
import { PartitionTestController } from '../controller/PartitionTestController';
import { authenticateToken } from '../middleware/authMiddleware';

// Create router
const router = express.Router();

// All partition routes require authentication
router.use(authenticateToken);

/**
 * @route GET /api/partitions
 * @desc Get all partitions for the authenticated user
 * @access Private (requires JWT token)
 */
router.get('/', PartitionController.getUserPartitions);

/**
 * @route GET /api/partitions/usage
 * @desc Get partition usage statistics for the authenticated user
 * @access Private (requires JWT token)
 */
router.get('/usage', PartitionController.getPartitionUsageStats);

/**
 * @route POST /api/partitions
 * @desc Create a new partition for the authenticated user
 * @access Private (requires JWT token)
 * @body { name: string, quota: number }
 */
router.post('/', PartitionController.createPartition);

/**
 * @route GET /api/partitions/:partitionName
 * @desc Get detailed information about a specific partition
 * @access Private (requires JWT token)
 */
router.get('/:partitionName', PartitionController.getPartitionDetails);

/**
 * @route PATCH /api/partitions/:partitionName
 * @desc Update quota of a specific partition
 * @access Private (requires JWT token)
 * @body { quota: number }
 */
router.patch('/:partitionName', PartitionController.updatePartitionQuota);

/**
 * @route DELETE /api/partitions/:partitionName
 * @desc Delete a partition (only if empty or force delete)
 * @access Private (requires JWT token)
 * @query { force?: 'true' }
 */
router.delete('/:partitionName', PartitionController.deletePartition);

/**
 * @route POST /api/partitions/move-files
 * @desc Move files between partitions
 * @access Private (requires JWT token)
 * @body { fileIds: string[], targetPartition: string }
 */
router.post('/move-files', PartitionController.moveFilesBetweenPartitions);

/**
 * Test routes for development/debugging
 */
if (process.env.NODE_ENV === 'development') {
    /**
     * @route POST /api/partitions/test/management
     * @desc Test partition management functionality
     * @access Private (requires JWT token)
     */
    router.post('/test/management', PartitionTestController.testPartitionManagement);

    /**
     * @route POST /api/partitions/test/quota
     * @desc Test quota functionality
     * @access Private (requires JWT token)
     */
    router.post('/test/quota', PartitionTestController.testQuotaFunctionality);

    /**
     * @route POST /api/partitions/test/create-test-partitions
     * @desc Create test partitions for demonstration
     * @access Private (requires JWT token)
     */
    router.post('/test/create-test-partitions', PartitionTestController.createTestPartitions);

    /**
     * @route GET /api/partitions/test/report
     * @desc Generate comprehensive partition report
     * @access Private (requires JWT token)
     */
    router.get('/test/report', PartitionTestController.getPartitionReport);
}

export default router;
