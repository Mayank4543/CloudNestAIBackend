import { FileService } from './FileService';

/**
 * Service for handling automatic cleanup of trash files
 */
export class TrashCleanupService {
    private static cleanupInterval: NodeJS.Timeout | null = null;

    /**
     * Start the automatic cleanup service
     * Runs every 24 hours to clean up files older than 30 days in trash
     */
    public static startCleanupScheduler(): void {
        // Prevent multiple schedulers
        if (this.cleanupInterval) {
            console.log('🗑️  Trash cleanup scheduler is already running');
            return;
        }

        // Run cleanup every 24 hours (86400000 milliseconds)
        this.cleanupInterval = setInterval(async () => {
            try {
                console.log('🗑️  Starting automatic trash cleanup...');
                const result = await FileService.cleanupOldTrashFiles();
                
                if (result.deletedCount > 0) {
                    console.log(`🗑️  Automatic cleanup completed: ${result.deletedCount} expired files deleted`);
                    
                    if (result.errors.length > 0) {
                        console.warn(`🗑️  Cleanup completed with ${result.errors.length} errors:`, result.errors);
                    }
                } else {
                    console.log('🗑️  No expired files found during automatic cleanup');
                }
            } catch (error) {
                console.error('🗑️  Error during automatic trash cleanup:', error);
            }
        }, 24 * 60 * 60 * 1000); // 24 hours

        console.log('🗑️  Trash cleanup scheduler started (runs every 24 hours)');
    }

    /**
     * Stop the automatic cleanup service
     */
    public static stopCleanupScheduler(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
            console.log('🗑️  Trash cleanup scheduler stopped');
        }
    }

    /**
     * Manually trigger cleanup (useful for testing or immediate cleanup)
     * @returns Promise<{deletedCount: number, errors: string[]}>
     */
    public static async manualCleanup(): Promise<{deletedCount: number, errors: string[]}> {
        try {
            console.log('🗑️  Manual trash cleanup triggered...');
            const result = await FileService.cleanupOldTrashFiles();
            
            console.log(`🗑️  Manual cleanup completed: ${result.deletedCount} expired files deleted`);
            
            if (result.errors.length > 0) {
                console.warn(`🗑️  Manual cleanup completed with ${result.errors.length} errors:`, result.errors);
            }
            
            return result;
        } catch (error) {
            console.error('🗑️  Error during manual trash cleanup:', error);
            throw error;
        }
    }

    /**
     * Check if cleanup scheduler is running
     */
    public static isRunning(): boolean {
        return this.cleanupInterval !== null;
    }
}

export default TrashCleanupService;
