import path from 'path';
import fs from 'fs';

/**
 * Get the correct upload directory path for both development and production
 * In development: points to src/upload
 * In production: points to uploads folder at project root
 */
export const getUploadDir = (): string => {
    const isDevelopment = process.env.NODE_ENV !== 'production';

    if (isDevelopment) {
        // Development: use src/upload relative to current working directory
        return path.join(process.cwd(), 'src', 'upload');
    } else {
        // Production: use uploads folder at project root
        // process.cwd() gives us the project root where package.json is
        return path.join(process.cwd(), 'uploads');
    }
};

/**
 * Ensure the upload directory exists
 */
export const ensureUploadDir = (): void => {
    const uploadDir = getUploadDir();

    try {
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
            console.log(`✅ Created upload directory: ${uploadDir}`);
        } else {
            console.log(`✅ Upload directory exists: ${uploadDir}`);
        }

        // Test write permissions
        const testFile = path.join(uploadDir, '.test-write');
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
        console.log(`✅ Upload directory is writable: ${uploadDir}`);

    } catch (error) {
        console.error(`❌ Error with upload directory ${uploadDir}:`, error);
        throw new Error(`Failed to setup upload directory: ${uploadDir}`);
    }
};

/**
 * Get the static serve path for uploaded files
 */
export const getStaticServePath = (): string => {
    return getUploadDir();
};

/**
 * Generate a public URL for accessing an uploaded file
 * @param filename - The filename of the uploaded file
 * @param req - Express request object (optional, for dynamic host detection)
 */
export const getFileUrl = (filename: string, req?: any): string => {
    const baseUrl = req
        ? `${req.protocol}://${req.get('host')}`
        : process.env.BASE_URL || 'http://localhost:3000';

    return `${baseUrl}/uploads/${filename}`;
};

/**
 * Extract filename from full file path
 * @param filePath - Full path to the file
 */
export const extractFilename = (filePath: string): string => {
    return path.basename(filePath);
};
