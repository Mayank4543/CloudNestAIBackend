import { Request, Response, NextFunction } from 'express';
import User, { IUser } from '../models/User';
import { Types } from 'mongoose';

// Extend the Request interface to include quota information
declare global {
    namespace Express {
        interface Request {
            partitionInfo?: {
                partitionName: string;
                currentUsed: number;
                quota: number;
                availableSpace: number;
            };
        }
    }
}

/**
 * Middleware to check if a file upload will exceed the partition quota
 * Must be used after authenticateToken middleware
 */
export const checkQuota = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        // Check if user is authenticated
        if (!req.user || !req.user._id) {
            res.status(401).json({
                success: false,
                message: 'User authentication required for quota check'
            });
            return;
        }

        // Get partition name from request body (default to 'personal' if not specified)
        const partitionName = req.body.partition || 'personal';

        // Get file size - this could be from multer or request body
        let fileSize = 0;
        if (req.file) {
            fileSize = req.file.size;
        } else if (req.body.size) {
            fileSize = parseInt(req.body.size);
        }

        if (fileSize <= 0) {
            res.status(400).json({
                success: false,
                message: 'Invalid file size for quota check'
            });
            return;
        }

        // Get user with storage partitions
        const user = await User.findById(req.user._id).select('+storagePartitions');
        if (!user) {
            res.status(404).json({
                success: false,
                message: 'User not found'
            });
            return;
        }

        // Find the specified partition
        const partition = user.storagePartitions.find(p => p.name === partitionName);
        if (!partition) {
            res.status(400).json({
                success: false,
                message: `Partition '${partitionName}' not found. Available partitions: ${user.storagePartitions.map(p => p.name).join(', ')}`
            });
            return;
        }

        // Check if adding this file would exceed the quota
        const wouldExceedQuota = (partition.used + fileSize) > partition.quota;
        
        if (wouldExceedQuota) {
            const availableSpace = Math.max(0, partition.quota - partition.used);
            const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(2);
            const availableSpaceMB = (availableSpace / (1024 * 1024)).toFixed(2);
            const quotaMB = (partition.quota / (1024 * 1024)).toFixed(2);

            res.status(400).json({
                success: false,
                message: `Quota exceeded for partition '${partitionName}'. File size: ${fileSizeMB}MB, Available space: ${availableSpaceMB}MB, Quota: ${quotaMB}MB`,
                error: 'QUOTA_EXCEEDED',
                details: {
                    partition: partitionName,
                    fileSize: fileSize,
                    availableSpace: availableSpace,
                    quota: partition.quota,
                    currentUsed: partition.used
                }
            });
            return;
        }

        // Attach partition info to request for use in subsequent middleware/controllers
        req.partitionInfo = {
            partitionName: partitionName,
            currentUsed: partition.used,
            quota: partition.quota,
            availableSpace: partition.quota - partition.used
        };

        console.log(`✅ Quota check passed for partition '${partitionName}': ${(fileSize / (1024 * 1024)).toFixed(2)}MB file, ${((partition.quota - partition.used) / (1024 * 1024)).toFixed(2)}MB available`);

        // Continue to next middleware/route handler
        next();

    } catch (error) {
        console.error('Quota middleware error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error during quota check',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};

/**
 * Middleware to update partition usage after successful file upload
 * Must be used after successful file creation
 */
export const updatePartitionUsage = async (
    userId: string,
    partitionName: string,
    fileSize: number,
    increment: boolean = true
): Promise<void> => {
    try {
        if (!Types.ObjectId.isValid(userId)) {
            throw new Error('Invalid user ID format');
        }

        const user = await User.findById(userId);
        if (!user) {
            throw new Error('User not found for partition usage update');
        }

        // Find the partition
        const partitionIndex = user.storagePartitions.findIndex(p => p.name === partitionName);
        if (partitionIndex === -1) {
            throw new Error(`Partition '${partitionName}' not found for usage update`);
        }

        // Update usage
        const currentUsed = user.storagePartitions[partitionIndex].used;
        const newUsed = increment 
            ? currentUsed + fileSize 
            : Math.max(0, currentUsed - fileSize);

        user.storagePartitions[partitionIndex].used = newUsed;

        // Save the updated user
        await user.save();

        const action = increment ? 'increased' : 'decreased';
        console.log(`📊 Partition '${partitionName}' usage ${action} by ${(fileSize / (1024 * 1024)).toFixed(2)}MB. New total: ${(newUsed / (1024 * 1024)).toFixed(2)}MB`);

    } catch (error) {
        console.error(`Error updating partition usage:`, error);
        // Don't throw here to avoid breaking the main flow - log the error instead
        // In a production system, you might want to have a retry mechanism or separate job
    }
};

/**
 * Helper function to get partition usage statistics for a user
 */
export const getPartitionStats = async (userId: string): Promise<any> => {
    try {
        if (!Types.ObjectId.isValid(userId)) {
            throw new Error('Invalid user ID format');
        }

        const user = await User.findById(userId).select('storagePartitions');
        if (!user) {
            throw new Error('User not found');
        }

        return user.storagePartitions.map(partition => ({
            name: partition.name,
            quota: partition.quota,
            used: partition.used,
            available: partition.quota - partition.used,
            usagePercentage: ((partition.used / partition.quota) * 100).toFixed(2),
            quotaFormatted: `${(partition.quota / (1024 * 1024 * 1024)).toFixed(2)}GB`,
            usedFormatted: `${(partition.used / (1024 * 1024)).toFixed(2)}MB`,
            availableFormatted: `${((partition.quota - partition.used) / (1024 * 1024)).toFixed(2)}MB`
        }));

    } catch (error) {
        throw new Error(`Failed to get partition stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
};
