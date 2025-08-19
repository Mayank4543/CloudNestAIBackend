/**
 * Database Migration Script for User Storage Partitions (JavaScript version)
 * 
 * This script should be run after deploying the partition feature
 * to set up default partitions for existing users and assign
 * existing files to the 'personal' partition.
 * 
 * Run this script using:
 * node scripts/migrate-partitions.js migrate
 */

const mongoose = require('mongoose');
const path = require('path');

// Import models (adjust path based on where the compiled JS files are)
let User, File;

async function loadModels() {
    try {
        // Try to load from dist directory (compiled TypeScript)
        User = require('../dist/models/User').default;
        File = require('../dist/models/File').default;
    } catch (error) {
        console.error('Could not load models from dist directory. Make sure to run "npm run build" first.');
        console.error('Or use the TypeScript version: npm run migrate:partitions');
        process.exit(1);
    }
}

/**
 * Main migration function
 */
async function migratePartitions() {
    const stats = {
        usersUpdated: 0,
        filesUpdated: 0,
        errors: [],
        usageRecalculated: {}
    };

    try {
        console.log('🚀 Starting partition migration...');

        // Step 1: Add default partitions to existing users
        console.log('📝 Step 1: Adding default partitions to users...');
        
        const usersWithoutPartitions = await User.find({
            storagePartitions: { $exists: false }
        });

        console.log(`Found ${usersWithoutPartitions.length} users without partitions`);

        for (const user of usersWithoutPartitions) {
            try {
                user.storagePartitions = [
                    { name: 'personal', quota: 5 * 1024 * 1024 * 1024, used: 0 }, // 5GB
                    { name: 'work', quota: 5 * 1024 * 1024 * 1024, used: 0 }      // 5GB
                ];
                
                await user.save();
                stats.usersUpdated++;
                console.log(`✅ Updated user: ${user.email}`);
            } catch (error) {
                const errorMsg = `Failed to update user ${user.email}: ${error.message || 'Unknown error'}`;
                stats.errors.push(errorMsg);
                console.error(`❌ ${errorMsg}`);
            }
        }

        // Step 2: Assign existing files to 'personal' partition
        console.log('📁 Step 2: Assigning files to personal partition...');
        
        const filesWithoutPartition = await File.find({
            partition: { $exists: false }
        });

        console.log(`Found ${filesWithoutPartition.length} files without partition assignment`);

        const updateResult = await File.updateMany(
            { partition: { $exists: false } },
            { $set: { partition: 'personal' } }
        );

        stats.filesUpdated = updateResult.modifiedCount;
        console.log(`✅ Updated ${stats.filesUpdated} files`);

        // Step 3: Recalculate partition usage for all users
        console.log('🧮 Step 3: Recalculating partition usage...');
        
        const allUsers = await User.find({ storagePartitions: { $exists: true } });
        
        for (const user of allUsers) {
            try {
                const userId = user._id.toString();
                stats.usageRecalculated[userId] = {};

                // Calculate usage for each partition
                for (const partition of user.storagePartitions) {
                    const usageResult = await File.aggregate([
                        {
                            $match: {
                                userId: user._id,
                                partition: partition.name,
                                isDeleted: { $ne: true }
                            }
                        },
                        {
                            $group: {
                                _id: null,
                                totalSize: { $sum: '$size' }
                            }
                        }
                    ]);

                    const actualUsage = usageResult[0]?.totalSize || 0;
                    partition.used = actualUsage;
                    stats.usageRecalculated[userId][partition.name] = actualUsage;
                }

                await user.save();
                console.log(`✅ Recalculated usage for user: ${user.email}`);
            } catch (error) {
                const errorMsg = `Failed to recalculate usage for user ${user.email}: ${error.message || 'Unknown error'}`;
                stats.errors.push(errorMsg);
                console.error(`❌ ${errorMsg}`);
            }
        }

        console.log('🎉 Migration completed successfully!');
        console.log(`📊 Statistics:`);
        console.log(`   - Users updated: ${stats.usersUpdated}`);
        console.log(`   - Files updated: ${stats.filesUpdated}`);
        console.log(`   - Errors: ${stats.errors.length}`);

        if (stats.errors.length > 0) {
            console.log('❌ Errors encountered:');
            stats.errors.forEach(error => console.log(`   - ${error}`));
        }

        return stats;

    } catch (error) {
        const errorMsg = `Migration failed: ${error.message || 'Unknown error'}`;
        stats.errors.push(errorMsg);
        console.error(`💥 ${errorMsg}`);
        throw error;
    }
}

/**
 * Verify migration results
 */
async function verifyMigration() {
    console.log('🔍 Verifying migration results...');

    try {
        // Check users without partitions
        const usersWithoutPartitions = await User.countDocuments({
            storagePartitions: { $exists: false }
        });

        // Check files without partition
        const filesWithoutPartition = await File.countDocuments({
            partition: { $exists: false }
        });

        // Check usage accuracy for a sample of users
        const sampleUsers = await User.find({ storagePartitions: { $exists: true } }).limit(5);
        const usageChecks = [];

        for (const user of sampleUsers) {
            for (const partition of user.storagePartitions) {
                const actualUsage = await File.aggregate([
                    {
                        $match: {
                            userId: user._id,
                            partition: partition.name,
                            isDeleted: { $ne: true }
                        }
                    },
                    {
                        $group: {
                            _id: null,
                            totalSize: { $sum: '$size' }
                        }
                    }
                ]);

                const calculatedUsage = actualUsage[0]?.totalSize || 0;
                const storedUsage = partition.used;
                const isAccurate = calculatedUsage === storedUsage;

                usageChecks.push({
                    user: user.email,
                    partition: partition.name,
                    stored: storedUsage,
                    calculated: calculatedUsage,
                    accurate: isAccurate
                });
            }
        }

        console.log('📋 Verification Results:');
        console.log(`   - Users without partitions: ${usersWithoutPartitions}`);
        console.log(`   - Files without partition: ${filesWithoutPartition}`);
        console.log(`   - Usage accuracy check:`);
        
        usageChecks.forEach(check => {
            const status = check.accurate ? '✅' : '❌';
            console.log(`     ${status} ${check.user} - ${check.partition}: stored=${check.stored}, calculated=${check.calculated}`);
        });

        const allAccurate = usageChecks.every(check => check.accurate);
        console.log(`   - Overall usage accuracy: ${allAccurate ? '✅ All accurate' : '❌ Some inaccuracies found'}`);

    } catch (error) {
        console.error(`💥 Verification failed: ${error.message || 'Unknown error'}`);
        throw error;
    }
}

/**
 * Rollback migration (for testing purposes only)
 */
async function rollbackMigration() {
    console.log('⚠️  Rolling back migration...');
    
    try {
        // Remove storagePartitions field from all users
        await User.updateMany(
            {},
            { $unset: { storagePartitions: 1 } }
        );

        // Remove partition field from all files
        await File.updateMany(
            {},
            { $unset: { partition: 1 } }
        );

        console.log('✅ Migration rolled back successfully');
    } catch (error) {
        console.error(`💥 Rollback failed: ${error.message || 'Unknown error'}`);
        throw error;
    }
}

// Main execution
async function main() {
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/cloudnest';
    
    try {
        await loadModels();
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB');
        
        // Check command line arguments
        const command = process.argv[2];
        
        switch (command) {
            case 'migrate':
                await migratePartitions();
                break;
            case 'verify':
                await verifyMigration();
                break;
            case 'rollback':
                await rollbackMigration();
                break;
            default:
                console.log('Usage: node scripts/migrate-partitions.js [migrate|verify|rollback]');
                console.log('  migrate  - Run the migration');
                console.log('  verify   - Verify migration results');
                console.log('  rollback - Rollback migration (testing only)');
                console.log('');
                console.log('Note: Make sure to run "npm run build" first to compile TypeScript files.');
        }
        
        await mongoose.disconnect();
        console.log('👋 Disconnected from MongoDB');
    } catch (error) {
        console.error('💥 Script execution failed:', error);
        process.exit(1);
    }
}

// Check if this script is being run directly
if (require.main === module) {
    main().catch(error => {
        console.error('Script execution failed:', error);
        process.exit(1);
    });
}

module.exports = {
    migratePartitions,
    verifyMigration,
    rollbackMigration
};
