import { Request, Response } from 'express';
import User from '../models/User';
import File from '../models/File';
import { Types } from 'mongoose';
import { getPartitionStats } from '../middleware/quotaMiddleware';

/**
 * Controller for managing user storage partitions
 */
export class PartitionController {

    /**
     * Get all partitions for the authenticated user
     * @param req - Express request object
     * @param res - Express response object
     */
    public static async getUserPartitions(req: Request, res: Response): Promise<void> {
        try {
            // Check if user is authenticated
            if (!req.user || !req.user._id) {
                res.status(401).json({
                    success: false,
                    message: 'User authentication required'
                });
                return;
            }

            // Get partition statistics
            const partitionStats = await getPartitionStats(req.user._id.toString());

            res.status(200).json({
                success: true,
                message: 'User partitions retrieved successfully',
                data: partitionStats
            });

        } catch (error) {
            console.error('Error getting user partitions:', error);
            res.status(500).json({
                success: false,
                message: 'Error retrieving user partitions',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    /**
     * Get partition usage statistics with detailed information
     * @param req - Express request object
     * @param res - Express response object
     */
    public static async getPartitionUsageStats(req: Request, res: Response): Promise<void> {
        try {
            // Check if user is authenticated
            if (!req.user || !req.user._id) {
                res.status(401).json({
                    success: false,
                    message: 'User authentication required'
                });
                return;
            }

            // Get user with partitions
            const user = await User.findById(req.user._id);
            if (!user) {
                res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
                return;
            }

            // Calculate statistics for each partition
            const partitionsWithStats = await Promise.all(
                user.storagePartitions.map(async (partition) => {
                    // Get file count for this partition
                    const totalFiles = await File.countDocuments({
                        userId: req.user!._id,
                        partition: partition.name,
                        isDeleted: { $ne: true }
                    });

                    // Calculate percentage used
                    const percentageUsed = partition.quota > 0 ? (partition.used / partition.quota) : 0;

                    // Format sizes
                    const formatSize = (bytes: number): string => {
                        if (bytes < 1024) return bytes + ' B';
                        else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
                        else if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
                        else return (bytes / 1073741824).toFixed(1) + ' GB';
                    };

                    return {
                        name: partition.name,
                        quota: partition.quota,
                        used: partition.used,
                        stats: {
                            totalFiles,
                            percentageUsed,
                            formattedUsed: formatSize(partition.used),
                            formattedQuota: formatSize(partition.quota),
                            isNearLimit: percentageUsed >= 0.8, // 80% warning
                            isOverLimit: percentageUsed >= 1.0  // 100% over limit
                        }
                    };
                })
            );

            // Calculate total statistics
            const totalUsed = user.storagePartitions.reduce((sum, p) => sum + p.used, 0);
            const totalQuota = user.storagePartitions.reduce((sum, p) => sum + p.quota, 0);
            const totalFiles = await File.countDocuments({
                userId: req.user._id,
                isDeleted: { $ne: true }
            });

            res.status(200).json({
                success: true,
                message: 'Partition usage statistics retrieved successfully',
                data: {
                    partitions: partitionsWithStats,
                    totalUsed,
                    totalQuota,
                    totalFiles
                }
            });

        } catch (error) {
            console.error('Error getting partition usage stats:', error);
            res.status(500).json({
                success: false,
                message: 'Error retrieving partition usage statistics',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    /**
     * Create a new storage partition for the authenticated user
     * @param req - Express request object
     * @param res - Express response object
     */
    public static async createPartition(req: Request, res: Response): Promise<void> {
        try {
            // Check if user is authenticated
            if (!req.user || !req.user._id) {
                res.status(401).json({
                    success: false,
                    message: 'User authentication required'
                });
                return;
            }

            const { name, quota } = req.body;

            // Validate input
            if (!name || typeof name !== 'string' || name.trim().length === 0) {
                res.status(400).json({
                    success: false,
                    message: 'Partition name is required and must be a non-empty string'
                });
                return;
            }

            if (!quota || typeof quota !== 'number' || quota <= 0) {
                res.status(400).json({
                    success: false,
                    message: 'Quota is required and must be a positive number (in bytes)'
                });
                return;
            }

            const trimmedName = name.trim().toLowerCase();

            // Validate partition name format (alphanumeric and hyphens only)
            if (!/^[a-z0-9-_]+$/.test(trimmedName)) {
                res.status(400).json({
                    success: false,
                    message: 'Partition name can only contain lowercase letters, numbers, hyphens, and underscores'
                });
                return;
            }

            // Get user with current partitions
            const user = await User.findById(req.user._id);
            if (!user) {
                res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
                return;
            }

            // Check if partition already exists
            const existingPartition = user.storagePartitions.find(p => p.name === trimmedName);
            if (existingPartition) {
                res.status(400).json({
                    success: false,
                    message: `Partition '${trimmedName}' already exists`
                });
                return;
            }

            // Check partition limit (max 10 partitions per user)
            if (user.storagePartitions.length >= 10) {
                res.status(400).json({
                    success: false,
                    message: 'Maximum partition limit reached (10 partitions per user)'
                });
                return;
            }

            // Add new partition
            user.storagePartitions.push({
                name: trimmedName,
                quota: quota,
                used: 0
            });

            // Save user
            await user.save();

            res.status(201).json({
                success: true,
                message: `Partition '${trimmedName}' created successfully`,
                data: {
                    name: trimmedName,
                    quota: quota,
                    used: 0,
                    quotaFormatted: `${(quota / (1024 * 1024 * 1024)).toFixed(2)}GB`
                }
            });

        } catch (error) {
            console.error('Error creating partition:', error);
            res.status(500).json({
                success: false,
                message: 'Error creating partition',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    /**
     * Update a partition's quota
     * @param req - Express request object
     * @param res - Express response object
     */
    public static async updatePartitionQuota(req: Request, res: Response): Promise<void> {
        try {
            // Check if user is authenticated
            if (!req.user || !req.user._id) {
                res.status(401).json({
                    success: false,
                    message: 'User authentication required'
                });
                return;
            }

            const { partitionName } = req.params;
            const { quota } = req.body;

            // Validate input
            if (!quota || typeof quota !== 'number' || quota <= 0) {
                res.status(400).json({
                    success: false,
                    message: 'Quota is required and must be a positive number (in bytes)'
                });
                return;
            }

            // Get user with current partitions
            const user = await User.findById(req.user._id);
            if (!user) {
                res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
                return;
            }

            // Find the partition
            const partitionIndex = user.storagePartitions.findIndex(p => p.name === partitionName);
            if (partitionIndex === -1) {
                res.status(404).json({
                    success: false,
                    message: `Partition '${partitionName}' not found`
                });
                return;
            }

            const partition = user.storagePartitions[partitionIndex];

            // Check if new quota is smaller than current usage
            if (quota < partition.used) {
                res.status(400).json({
                    success: false,
                    message: `Cannot set quota below current usage. Current usage: ${(partition.used / (1024 * 1024)).toFixed(2)}MB, Requested quota: ${(quota / (1024 * 1024)).toFixed(2)}MB`
                });
                return;
            }

            // Update quota
            user.storagePartitions[partitionIndex].quota = quota;
            await user.save();

            res.status(200).json({
                success: true,
                message: `Partition '${partitionName}' quota updated successfully`,
                data: {
                    name: partitionName,
                    quota: quota,
                    used: partition.used,
                    quotaFormatted: `${(quota / (1024 * 1024 * 1024)).toFixed(2)}GB`,
                    usedFormatted: `${(partition.used / (1024 * 1024)).toFixed(2)}MB`
                }
            });

        } catch (error) {
            console.error('Error updating partition quota:', error);
            res.status(500).json({
                success: false,
                message: 'Error updating partition quota',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    /**
     * Delete a partition (only if empty or force delete)
     * @param req - Express request object
     * @param res - Express response object
     */
    public static async deletePartition(req: Request, res: Response): Promise<void> {
        try {
            // Check if user is authenticated
            if (!req.user || !req.user._id) {
                res.status(401).json({
                    success: false,
                    message: 'User authentication required'
                });
                return;
            }

            const { partitionName } = req.params;
            const { force } = req.query; // ?force=true to force delete non-empty partition

            // Get user with current partitions
            const user = await User.findById(req.user._id);
            if (!user) {
                res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
                return;
            }

            // Find the partition
            const partitionIndex = user.storagePartitions.findIndex(p => p.name === partitionName);
            if (partitionIndex === -1) {
                res.status(404).json({
                    success: false,
                    message: `Partition '${partitionName}' not found`
                });
                return;
            }

            const partition = user.storagePartitions[partitionIndex];

            // Prevent deleting default partitions unless forced
            if (['personal', 'work'].includes(partitionName) && force !== 'true') {
                res.status(400).json({
                    success: false,
                    message: `Cannot delete default partition '${partitionName}' without force=true parameter`
                });
                return;
            }

            // Check if partition has files
            const filesInPartition = await File.countDocuments({
                userId: req.user._id,
                partition: partitionName,
                isDeleted: { $ne: true }
            });

            if (filesInPartition > 0 && force !== 'true') {
                res.status(400).json({
                    success: false,
                    message: `Cannot delete partition '${partitionName}' - it contains ${filesInPartition} files. Use ?force=true to force delete or move files to another partition first.`
                });
                return;
            }

            // If force deleting, move files to 'personal' partition or delete them
            if (force === 'true' && filesInPartition > 0) {
                const targetPartition = user.storagePartitions.find(p => p.name === 'personal');

                if (targetPartition && partitionName !== 'personal') {
                    // Move files to personal partition and update usage
                    await File.updateMany(
                        {
                            userId: req.user._id,
                            partition: partitionName,
                            isDeleted: { $ne: true }
                        },
                        { partition: 'personal' }
                    );

                    // Update partition usage (move used space from deleted partition to personal)
                    targetPartition.used += partition.used;

                    console.log(`Moved ${filesInPartition} files from '${partitionName}' to 'personal' partition`);
                } else {
                    // If deleting 'personal' partition or no personal partition exists, soft delete all files
                    await File.updateMany(
                        {
                            userId: req.user._id,
                            partition: partitionName,
                            isDeleted: { $ne: true }
                        },
                        {
                            isDeleted: true,
                            deletedAt: new Date()
                        }
                    );

                    console.log(`Soft deleted ${filesInPartition} files from '${partitionName}' partition`);
                }
            }

            // Remove partition from user
            user.storagePartitions.splice(partitionIndex, 1);
            await user.save();

            res.status(200).json({
                success: true,
                message: `Partition '${partitionName}' deleted successfully`,
                data: {
                    deletedPartition: partitionName,
                    filesAffected: filesInPartition,
                    forced: force === 'true'
                }
            });

        } catch (error) {
            console.error('Error deleting partition:', error);
            res.status(500).json({
                success: false,
                message: 'Error deleting partition',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    /**
     * Get detailed partition statistics including file count
     * @param req - Express request object
     * @param res - Express response object
     */
    public static async getPartitionDetails(req: Request, res: Response): Promise<void> {
        try {
            // Check if user is authenticated
            if (!req.user || !req.user._id) {
                res.status(401).json({
                    success: false,
                    message: 'User authentication required'
                });
                return;
            }

            const { partitionName } = req.params;

            // Get user with partitions
            const user = await User.findById(req.user._id);
            if (!user) {
                res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
                return;
            }

            // Find the partition
            const partition = user.storagePartitions.find(p => p.name === partitionName);
            if (!partition) {
                res.status(404).json({
                    success: false,
                    message: `Partition '${partitionName}' not found`
                });
                return;
            }

            // Get file statistics for this partition
            const [fileCount, trashedFileCount, fileTypes] = await Promise.all([
                File.countDocuments({
                    userId: req.user._id,
                    partition: partitionName,
                    isDeleted: { $ne: true }
                }),
                File.countDocuments({
                    userId: req.user._id,
                    partition: partitionName,
                    isDeleted: true
                }),
                File.aggregate([
                    {
                        $match: {
                            userId: new Types.ObjectId(req.user._id.toString()),
                            partition: partitionName,
                            isDeleted: { $ne: true }
                        }
                    },
                    {
                        $group: {
                            _id: '$mimetype',
                            count: { $sum: 1 },
                            totalSize: { $sum: '$size' }
                        }
                    },
                    {
                        $sort: { count: -1 }
                    }
                ])
            ]);

            res.status(200).json({
                success: true,
                message: `Partition '${partitionName}' details retrieved successfully`,
                data: {
                    name: partition.name,
                    quota: partition.quota,
                    used: partition.used,
                    available: partition.quota - partition.used,
                    usagePercentage: ((partition.used / partition.quota) * 100).toFixed(2),
                    quotaFormatted: `${(partition.quota / (1024 * 1024 * 1024)).toFixed(2)}GB`,
                    usedFormatted: `${(partition.used / (1024 * 1024)).toFixed(2)}MB`,
                    availableFormatted: `${((partition.quota - partition.used) / (1024 * 1024)).toFixed(2)}MB`,
                    fileCount: fileCount,
                    trashedFileCount: trashedFileCount,
                    fileTypes: fileTypes.map(ft => ({
                        mimetype: ft._id,
                        count: ft.count,
                        totalSize: ft.totalSize,
                        totalSizeFormatted: `${(ft.totalSize / (1024 * 1024)).toFixed(2)}MB`
                    }))
                }
            });

        } catch (error) {
            console.error('Error getting partition details:', error);
            res.status(500).json({
                success: false,
                message: 'Error getting partition details',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    /**
     * Move files between partitions
     * @param req - Express request object
     * @param res - Express response object
     */
    public static async moveFilesBetweenPartitions(req: Request, res: Response): Promise<void> {
        try {
            // Check if user is authenticated
            if (!req.user || !req.user._id) {
                res.status(401).json({
                    success: false,
                    message: 'User authentication required'
                });
                return;
            }

            const { fileIds, targetPartition } = req.body;

            // Validate input
            if (!Array.isArray(fileIds) || fileIds.length === 0) {
                res.status(400).json({
                    success: false,
                    message: 'fileIds must be a non-empty array'
                });
                return;
            }

            if (!targetPartition || typeof targetPartition !== 'string') {
                res.status(400).json({
                    success: false,
                    message: 'targetPartition is required'
                });
                return;
            }

            // Validate all fileIds are valid ObjectIds
            for (const fileId of fileIds) {
                if (!Types.ObjectId.isValid(fileId)) {
                    res.status(400).json({
                        success: false,
                        message: `Invalid file ID: ${fileId}`
                    });
                    return;
                }
            }

            // Get user with partitions
            const user = await User.findById(req.user._id);
            if (!user) {
                res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
                return;
            }

            // Check if target partition exists
            const targetPartitionObj = user.storagePartitions.find(p => p.name === targetPartition);
            if (!targetPartitionObj) {
                res.status(404).json({
                    success: false,
                    message: `Target partition '${targetPartition}' not found`
                });
                return;
            }

            // Get files to move
            const filesToMove = await File.find({
                _id: { $in: fileIds },
                userId: req.user._id,
                isDeleted: { $ne: true }
            });

            if (filesToMove.length !== fileIds.length) {
                res.status(400).json({
                    success: false,
                    message: 'Some files not found or access denied'
                });
                return;
            }

            // Calculate total size and check quota
            const totalSize = filesToMove.reduce((sum, file) => sum + file.size, 0);
            const wouldExceedQuota = (targetPartitionObj.used + totalSize) > targetPartitionObj.quota;

            if (wouldExceedQuota) {
                res.status(400).json({
                    success: false,
                    message: `Moving files would exceed quota for partition '${targetPartition}'`,
                    details: {
                        totalFileSize: totalSize,
                        targetPartitionUsed: targetPartitionObj.used,
                        targetPartitionQuota: targetPartitionObj.quota,
                        availableSpace: targetPartitionObj.quota - targetPartitionObj.used
                    }
                });
                return;
            }

            // Group files by current partition for usage updates
            const partitionUsageChanges: { [key: string]: number } = {};
            filesToMove.forEach(file => {
                if (!partitionUsageChanges[file.partition]) {
                    partitionUsageChanges[file.partition] = 0;
                }
                partitionUsageChanges[file.partition] += file.size;
            });

            // Update files to new partition
            await File.updateMany(
                {
                    _id: { $in: fileIds },
                    userId: req.user._id
                },
                { partition: targetPartition }
            );

            // Update partition usage
            for (const [partitionName, sizeToRemove] of Object.entries(partitionUsageChanges)) {
                const sourcePartitionIndex = user.storagePartitions.findIndex(p => p.name === partitionName);
                if (sourcePartitionIndex !== -1) {
                    user.storagePartitions[sourcePartitionIndex].used = Math.max(0,
                        user.storagePartitions[sourcePartitionIndex].used - sizeToRemove
                    );
                }
            }

            // Add usage to target partition
            const targetPartitionIndex = user.storagePartitions.findIndex(p => p.name === targetPartition);
            user.storagePartitions[targetPartitionIndex].used += totalSize;

            await user.save();

            res.status(200).json({
                success: true,
                message: `${filesToMove.length} files moved to partition '${targetPartition}' successfully`,
                data: {
                    movedFiles: filesToMove.length,
                    totalSize: totalSize,
                    targetPartition: targetPartition,
                    partitionUsageChanges: partitionUsageChanges
                }
            });

        } catch (error) {
            console.error('Error moving files between partitions:', error);
            res.status(500).json({
                success: false,
                message: 'Error moving files between partitions',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
}
