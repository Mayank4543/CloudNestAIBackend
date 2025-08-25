import { Request, Response } from 'express';
import User from '../models/User';
import File from '../models/File';
import { FileService } from '../services/FileService';
import { PartitionController } from '../controller/PartitionController';
import { checkQuota, updatePartitionUsage, getPartitionStats } from '../middleware/quotaMiddleware';

/**
 * Test controller for partition functionality
 * Use this for manual testing of the partition features
 */
export class PartitionTestController {

    /**
     * Test partition creation and management
     */
    public static async testPartitionManagement(req: Request, res: Response): Promise<void> {
        try {
            if (!req.user || !req.user._id) {
                res.status(401).json({
                    success: false,
                    message: 'User authentication required'
                });
                return;
            }

            const testResults: any[] = [];

            // Test 1: Get user partitions
            try {
                const partitionStats = await getPartitionStats(req.user._id.toString());
                testResults.push({
                    test: 'Get User Partitions',
                    status: 'PASS',
                    data: partitionStats
                });
            } catch (error) {
                testResults.push({
                    test: 'Get User Partitions',
                    status: 'FAIL',
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }

            // Test 2: Check if user has default partitions
            try {
                const user = await User.findById(req.user._id);
                const hasPersonal = user?.storagePartitions.some(p => p.name === 'personal');
                const hasWork = user?.storagePartitions.some(p => p.name === 'work');

                testResults.push({
                    test: 'Default Partitions Check',
                    status: (hasPersonal && hasWork) ? 'PASS' : 'FAIL',
                    data: {
                        hasPersonal,
                        hasWork,
                        totalPartitions: user?.storagePartitions.length || 0
                    }
                });
            } catch (error) {
                testResults.push({
                    test: 'Default Partitions Check',
                    status: 'FAIL',
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }

            // Test 3: Simulate quota check for different file sizes
            const testFileSizes = [
                { size: 1024 * 1024, name: '1MB file' },        // 1MB
                { size: 100 * 1024 * 1024, name: '100MB file' }, // 100MB
                { size: 1024 * 1024 * 1024, name: '1GB file' },  // 1GB
                { size: 6 * 1024 * 1024 * 1024, name: '6GB file' } // 6GB (should exceed default quota)
            ];

            for (const testFile of testFileSizes) {
                try {
                    // Simulate quota check without actually uploading
                    const user = await User.findById(req.user._id);
                    const personalPartition = user?.storagePartitions.find(p => p.name === 'personal');

                    if (personalPartition) {
                        const wouldExceedQuota = (personalPartition.used + testFile.size) > personalPartition.quota;
                        testResults.push({
                            test: `Quota Check - ${testFile.name}`,
                            status: 'PASS',
                            data: {
                                fileSize: testFile.size,
                                currentUsed: personalPartition.used,
                                quota: personalPartition.quota,
                                wouldExceedQuota,
                                availableSpace: personalPartition.quota - personalPartition.used
                            }
                        });
                    }
                } catch (error) {
                    testResults.push({
                        test: `Quota Check - ${testFile.name}`,
                        status: 'FAIL',
                        error: error instanceof Error ? error.message : 'Unknown error'
                    });
                }
            }

            // Test 4: Count files by partition
            try {
                const partitionCounts = await File.aggregate([
                    {
                        $match: {
                            userId: req.user._id,
                            isDeleted: { $ne: true }
                        }
                    },
                    {
                        $group: {
                            _id: '$partition',
                            count: { $sum: 1 },
                            totalSize: { $sum: '$size' }
                        }
                    }
                ]);

                testResults.push({
                    test: 'Files by Partition Count',
                    status: 'PASS',
                    data: partitionCounts
                });
            } catch (error) {
                testResults.push({
                    test: 'Files by Partition Count',
                    status: 'FAIL',
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }

            res.status(200).json({
                success: true,
                message: 'Partition management tests completed',
                testResults,
                summary: {
                    total: testResults.length,
                    passed: testResults.filter(t => t.status === 'PASS').length,
                    failed: testResults.filter(t => t.status === 'FAIL').length
                }
            });

        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Error running partition tests',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    /**
     * Test quota functionality
     */
    public static async testQuotaFunctionality(req: Request, res: Response): Promise<void> {
        try {
            if (!req.user || !req.user._id) {
                res.status(401).json({
                    success: false,
                    message: 'User authentication required'
                });
                return;
            }

            const testResults: any[] = [];

            // Test updating partition usage
            try {
                const testSize = 1024 * 1024; // 1MB
                await updatePartitionUsage(req.user._id.toString(), 'personal', testSize, true);

                // Get updated stats
                const statsAfterIncrease = await getPartitionStats(req.user._id.toString());
                const personalPartition = statsAfterIncrease.find((p: any) => p.name === 'personal');

                // Decrease it back
                await updatePartitionUsage(req.user._id.toString(), 'personal', testSize, false);

                const statsAfterDecrease = await getPartitionStats(req.user._id.toString());
                const personalPartitionAfter = statsAfterDecrease.find((p: any) => p.name === 'personal');

                testResults.push({
                    test: 'Partition Usage Update',
                    status: 'PASS',
                    data: {
                        beforeIncrease: personalPartition?.used,
                        afterDecrease: personalPartitionAfter?.used,
                        testSize
                    }
                });
            } catch (error) {
                testResults.push({
                    test: 'Partition Usage Update',
                    status: 'FAIL',
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }

            res.status(200).json({
                success: true,
                message: 'Quota functionality tests completed',
                testResults,
                summary: {
                    total: testResults.length,
                    passed: testResults.filter(t => t.status === 'PASS').length,
                    failed: testResults.filter(t => t.status === 'FAIL').length
                }
            });

        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Error running quota tests',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    /**
     * Create test partitions for demonstration
     */
    public static async createTestPartitions(req: Request, res: Response): Promise<void> {
        try {
            if (!req.user || !req.user._id) {
                res.status(401).json({
                    success: false,
                    message: 'User authentication required'
                });
                return;
            }

            const testPartitions = [
                { name: 'projects', quota: 2 * 1024 * 1024 * 1024 }, // 2GB
                { name: 'archive', quota: 1 * 1024 * 1024 * 1024 },  // 1GB
                { name: 'temp', quota: 512 * 1024 * 1024 }           // 512MB
            ];

            const results: any[] = [];

            for (const partition of testPartitions) {
                try {
                    const user = await User.findById(req.user._id);
                    if (!user) {
                        throw new Error('User not found');
                    }

                    // Check if partition already exists
                    const existingPartition = user.storagePartitions.find(p => p.name === partition.name);
                    if (existingPartition) {
                        results.push({
                            partition: partition.name,
                            status: 'SKIPPED',
                            message: 'Partition already exists'
                        });
                        continue;
                    }

                    // Add new partition
                    user.storagePartitions.push({
                        name: partition.name,
                        quota: partition.quota,
                        used: 0
                    });

                    await user.save();

                    results.push({
                        partition: partition.name,
                        status: 'CREATED',
                        quota: partition.quota,
                        quotaFormatted: `${(partition.quota / (1024 * 1024 * 1024)).toFixed(2)}GB`
                    });

                } catch (error) {
                    results.push({
                        partition: partition.name,
                        status: 'FAILED',
                        error: error instanceof Error ? error.message : 'Unknown error'
                    });
                }
            }

            res.status(200).json({
                success: true,
                message: 'Test partitions creation completed',
                results
            });

        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Error creating test partitions',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    /**
     * Generate a comprehensive report of user's partition status
     */
    public static async getPartitionReport(req: Request, res: Response): Promise<void> {
        try {
            if (!req.user || !req.user._id) {
                res.status(401).json({
                    success: false,
                    message: 'User authentication required'
                });
                return;
            }

            // Get partition stats
            const partitionStats = await getPartitionStats(req.user._id.toString());

            // Get file distribution by partition
            const fileDistribution = await File.aggregate([
                {
                    $match: {
                        userId: req.user._id,
                        isDeleted: { $ne: true }
                    }
                },
                {
                    $group: {
                        _id: '$partition',
                        fileCount: { $sum: 1 },
                        totalSize: { $sum: '$size' },
                        avgSize: { $avg: '$size' },
                        mimetypes: { $addToSet: '$mimetype' }
                    }
                }
            ]);

            // 
            const overallStats = await File.aggregate([
                {
                    $match: {
                        userId: req.user._id,
                        isDeleted: { $ne: true }
                    }
                },
                {
                    $group: {
                        _id: null,
                        totalFiles: { $sum: 1 },
                        totalSize: { $sum: '$size' },
                        avgSize: { $avg: '$size' }
                    }
                }
            ]);

            const report = {
                user: {
                    id: req.user._id,
                    email: req.user.email,
                    name: req.user.name
                },
                partitions: partitionStats,
                fileDistribution: fileDistribution.map(dist => ({
                    partition: dist._id,
                    fileCount: dist.fileCount,
                    totalSize: dist.totalSize,
                    totalSizeFormatted: `${(dist.totalSize / (1024 * 1024)).toFixed(2)}MB`,
                    avgSize: Math.round(dist.avgSize),
                    avgSizeFormatted: `${(dist.avgSize / 1024).toFixed(2)}KB`,
                    uniqueMimetypes: dist.mimetypes.length,
                    mimetypes: dist.mimetypes
                })),
                overallStats: overallStats[0] ? {
                    totalFiles: overallStats[0].totalFiles,
                    totalSize: overallStats[0].totalSize,
                    totalSizeFormatted: `${(overallStats[0].totalSize / (1024 * 1024)).toFixed(2)}MB`,
                    avgSize: Math.round(overallStats[0].avgSize),
                    avgSizeFormatted: `${(overallStats[0].avgSize / 1024).toFixed(2)}KB`
                } : null,
                summary: {
                    totalPartitions: partitionStats.length,
                    totalQuota: partitionStats.reduce((sum: number, p: any) => sum + p.quota, 0),
                    totalUsed: partitionStats.reduce((sum: number, p: any) => sum + p.used, 0),
                    totalAvailable: partitionStats.reduce((sum: number, p: any) => sum + p.available, 0),
                    overallUsagePercentage: partitionStats.length > 0
                        ? ((partitionStats.reduce((sum: number, p: any) => sum + p.used, 0) /
                            partitionStats.reduce((sum: number, p: any) => sum + p.quota, 0)) * 100).toFixed(2)
                        : '0.00'
                },
                generatedAt: new Date().toISOString()
            };

            res.status(200).json({
                success: true,
                message: 'Partition report generated successfully',
                report
            });

        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Error generating partition report',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
}
