import path from 'path';
import fs from 'fs';

/**
 * Get the correct upload directory path for both development and production
 * In development: points to src/upload
 * In production: points to dist/upload (relative to project root)
 */
export const getUploadDir = (): string => {
    // Get project root directory (where package.json is located)
    const projectRoot = path.resolve(__dirname, '../..');

    // In production, we'll create uploads folder at project root level
    // In development, we can use the existing src/upload folder
    const isDevelopment = process.env.NODE_ENV !== 'production';

    if (isDevelopment) {
        // Development: use src/upload
        return path.join(projectRoot, 'src', 'upload');
    } else {
        // Production: use uploads folder at project root
        return path.join(projectRoot, 'uploads');
    }
};

/**
 * Ensure the upload directory exists
 */
export const ensureUploadDir = (): void => {
    const uploadDir = getUploadDir();

    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
        console.log(`✅ Created upload directory: ${uploadDir}`);
    } else {
        console.log(`✅ Upload directory exists: ${uploadDir}`);
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
