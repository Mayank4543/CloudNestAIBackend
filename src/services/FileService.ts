import File, { IFile } from '../models/File';
import { FilterQuery, Types } from 'mongoose';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'fs';
import path from 'path';

// Interface for file creation data
export interface CreateFileData {
  filename: string;
  originalname: string;
  mimetype: string;
  size: number;
  path?: string;  // Optional now, since we might use buffer
  userId: string;
  isPublic?: boolean;
  tags?: string[];
  r2Key?: string; // Optional field to store R2 object key
  buffer?: Buffer; // For memory storage uploads
}

// Interface for file query options
export interface FileQueryOptions {
  page?: number;
  limit?: number;
  mimetype?: string;
  tags?: string[];
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  searchKeyword?: string;
  userId?: string;
  isPublic?: boolean;
}

// Interface for pagination result
export interface PaginatedFiles {
  files: IFile[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalFiles: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    limit: number;
  };
}

// Interface for file statistics
export interface FileStats {
  totalFiles: number;
  totalSize: number;
  averageSize: number;
  mimetypeDistribution: { [mimetype: string]: number };
  tagDistribution: { [tag: string]: number };
  mostCommonMimeTypes: Array<{ mimetype: string; count: number }>;
  mostCommonTags: Array<{ tag: string; count: number }>;
}

/**
 * FileService class handles business logic for file operations in the personal cloud storage project.
 * It interacts with the MongoDB File model to perform CRUD operations.
 */
export class FileService {

  /**
   * Configure S3 client for Cloudflare R2
   */
  private static getR2Client(): S3Client {
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const endpoint = process.env.R2_ENDPOINT;

    if (!accessKeyId || !secretAccessKey || !endpoint) {
      throw new Error('Missing required Cloudflare R2 configuration');
    }

    return new S3Client({
      region: 'auto', // Cloudflare R2 uses 'auto' for region
      endpoint,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      forcePathStyle: true, // Required for Cloudflare R2
    });
  }

  /**
   * Generate a pre-signed URL for accessing a file in R2
   * @param objectKey - The key (filename) of the object in R2
   * @param expiresInSeconds - How long the URL should be valid (default: 24 hours)
   * @returns Promise<string> - Pre-signed URL
   */
  public static async generatePresignedUrl(objectKey: string, expiresInSeconds: number = 86400): Promise<string> {
    try {
      const r2Client = this.getR2Client();
      const bucketName = process.env.R2_BUCKET_NAME;

      if (!bucketName) {
        throw new Error('R2_BUCKET_NAME is not defined');
      }

      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: objectKey,
      });

      // Generate a pre-signed URL that expires after the specified time
      const signedUrl = await getSignedUrl(r2Client, command, { expiresIn: expiresInSeconds });

      return signedUrl;
    } catch (error) {
      console.error('Failed to generate pre-signed URL:', error);
      throw new Error(`Failed to generate pre-signed URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract the object key from an R2 URL
   * @param r2Url - The full R2 URL
   * @returns string - The object key
   */
  public static extractObjectKeyFromUrl(r2Url: string): string {
    try {
      // Parse the URL
      const url = new URL(r2Url);

      // Get the pathname
      const pathname = url.pathname;

      // Remove the leading slash and the bucket name if present
      const bucketName = process.env.R2_BUCKET_NAME;
      if (bucketName && pathname.startsWith(`/${bucketName}/`)) {
        return pathname.substring(`/${bucketName}/`.length);
      }

      // If bucket name is not in the path, return the pathname without the leading slash
      return pathname.startsWith('/') ? pathname.substring(1) : pathname;
    } catch (error) {
      console.error('Failed to extract object key from URL:', error);
      // Return the original URL as fallback
      return r2Url;
    }
  }

  /**
   * Upload a file to Cloudflare R2
   * @param fileBuffer - File content as a Buffer (memory storage)
   * @param fileName - Original file name to use in R2
   * @param contentType - MIME type of the file
   * @returns Promise<{url: string, objectKey: string, virtualPath: string}> - Public URL, object key, and virtual path of the uploaded file
   */
  public static async uploadFileToR2(fileBuffer: Buffer, fileName: string, contentType: string): Promise<{ url: string, objectKey: string, virtualPath: string }> {
    try {
      // Check that all required env variables are set
      const accessKeyId = process.env.R2_ACCESS_KEY_ID;
      const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
      const endpoint = process.env.R2_ENDPOINT;
      const bucketName = process.env.R2_BUCKET_NAME;

      if (!accessKeyId || !secretAccessKey || !endpoint || !bucketName) {
        throw new Error('Missing required Cloudflare R2 configuration');
      }

      const r2Client = this.getR2Client();

      // Generate a unique key for the file in R2 (with original filename)
      // Use path.basename to get filename without path
      const fileBaseName = path.basename(fileName);
      const uniqueFileName = `${Date.now()}-${fileBaseName}`;

      console.log(`Uploading file to R2: ${uniqueFileName}`);
      console.log(`Bucket: ${bucketName}`);
      console.log(`Content Type: ${contentType}`);

      // Upload to R2 directly from buffer
      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: uniqueFileName,
        Body: fileBuffer,
        ContentType: contentType,
      });

      const result = await r2Client.send(command);
      console.log('File uploaded to R2 successfully:', result);

      // Store the object key for future reference
      const objectKey = uniqueFileName;

      // Generate a pre-signed URL that's valid for 24 hours (or customize as needed)
      const presignedUrl = await this.generatePresignedUrl(objectKey);

      console.log(`Generated pre-signed URL for R2 file: ${presignedUrl}`);

      // Create a virtual path to simulate local file system (for compatibility)
      const virtualPath = path.join(process.env.NODE_ENV === 'production' ? 'uploads' : 'src/upload', uniqueFileName);

      // Return the pre-signed URL, object key, and virtual path
      return {
        url: presignedUrl,
        objectKey,
        virtualPath
      };
    } catch (error) {
      console.error('Failed to upload file to R2:', error);

      // Check for specific error types from AWS SDK to provide better error messages
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage.includes('InvalidAccessKeyId')) {
        throw new Error('Invalid R2 access key ID. Please check your R2_ACCESS_KEY_ID environment variable.');
      } else if (errorMessage.includes('SignatureDoesNotMatch')) {
        throw new Error('Invalid R2 secret key. Please check your R2_SECRET_ACCESS_KEY environment variable.');
      } else if (errorMessage.includes('NoSuchBucket')) {
        throw new Error(`The bucket '${process.env.R2_BUCKET_NAME}' does not exist or you don't have permission to access it.`);
      } else if (errorMessage.includes('NetworkingError') || errorMessage.includes('ENOTFOUND')) {
        throw new Error(`Could not connect to R2 endpoint at '${process.env.R2_ENDPOINT}'. Please check your network connection or R2_ENDPOINT value.`);
      } else {
        throw new Error(`Failed to upload file to R2: ${errorMessage}`);
      }
    }
  }

  /**
   * Save a new file document to the database
   * @param fileData - File data to save
   * @returns Promise<IFile> - Saved file document
   */
  public static async saveFile(fileData: CreateFileData): Promise<IFile> {
    try {
      // Validate required fields
      if (!fileData.filename || !fileData.originalname || !fileData.mimetype || !fileData.path || !fileData.userId) {
        throw new Error('Missing required file data fields');
      }

      if (fileData.size < 0) {
        throw new Error('File size cannot be negative');
      }

      // Validate userId format
      if (!Types.ObjectId.isValid(fileData.userId)) {
        throw new Error('Invalid user ID format');
      }

      // Validate and clean tags
      const cleanTags = fileData.tags
        ? fileData.tags.filter(tag => tag.trim().length > 0).map(tag => tag.trim().toLowerCase())
        : [];

      let r2Url = '';
      let r2ObjectKey = '';
      let virtualPath = fileData.path || ''; // Keep original path as fallback

      // Check if this is a Buffer upload (memory storage) or path (disk storage)
      // fileData.buffer will be present if using memory storage
      if (fileData.buffer) {
        try {
          // Upload file directly from memory buffer to R2
          const r2Result = await this.uploadFileToR2(
            fileData.buffer,
            fileData.originalname,
            fileData.mimetype
          );
          r2Url = r2Result.url;
          r2ObjectKey = r2Result.objectKey;
          virtualPath = r2Result.virtualPath; // Use the virtual path from R2 upload
          console.log('Successfully uploaded file to R2 from memory:', r2Url);
          console.log('R2 Object Key:', r2ObjectKey);
        } catch (uploadError) {
          console.error('Failed to upload to R2 from memory:', uploadError);
          throw new Error(`Failed to upload file: ${uploadError instanceof Error ? uploadError.message : 'Unknown error'}`);
        }
      } else if (fileData.path) {
        // Legacy path-based upload (disk storage)
        try {
          // Read file from disk and upload to R2
          const fileContent = fs.readFileSync(fileData.path);
          const r2Result = await this.uploadFileToR2(
            fileContent,
            fileData.originalname,
            fileData.mimetype
          );
          r2Url = r2Result.url;
          r2ObjectKey = r2Result.objectKey;
          virtualPath = r2Result.virtualPath;
          console.log('Successfully uploaded file to R2 from disk:', r2Url);
          console.log('R2 Object Key:', r2ObjectKey);

          // Optionally delete the local file after successful R2 upload
          try {
            fs.unlinkSync(fileData.path);
            console.log('Deleted local file after R2 upload:', fileData.path);
          } catch (unlinkError) {
            console.error('Failed to delete local file:', unlinkError);
            // Non-critical error, continue
          }
        } catch (uploadError) {
          console.error('Failed to upload to R2 from disk:', uploadError);
          // For disk storage, we'll keep the file as fallback
          console.log('Keeping local file as fallback');
        }
      } else {
        throw new Error('Neither file buffer nor path provided for upload');
      }

      // Create new file document
      const newFile = new File({
        filename: fileData.filename,
        originalname: fileData.originalname,
        mimetype: fileData.mimetype,
        size: fileData.size,
        path: virtualPath, // Use virtual path for consistency
        userId: new Types.ObjectId(fileData.userId),
        isPublic: fileData.isPublic || false,
        tags: cleanTags,
        r2Url: r2Url || undefined, // Store R2 URL if available
        r2ObjectKey: r2ObjectKey || undefined // Store R2 object key if available
      });

      // Save and return the file
      const savedFile = await newFile.save();
      return savedFile;

    } catch (error) {
      throw new Error(`Failed to save file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get a list of files based on filters like mimetype, tags, and search keyword
   * @param options - Query options for filtering and pagination
   * @returns Promise<PaginatedFiles> - Paginated files result
   */
  public static async getFiles(options: FileQueryOptions = {}): Promise<PaginatedFiles> {
    try {
      // Set default values
      const page = Math.max(options.page || 1, 1);
      const limit = Math.min(Math.max(options.limit || 10, 1), 100); // Between 1-100 files per page
      const sortBy = options.sortBy || 'createdAt';
      const sortOrder = options.sortOrder || 'desc';
      const skip = (page - 1) * limit;

      // Build filter object
      const filter: FilterQuery<IFile> = {};

      // Filter by user ownership or public files
      if (options.isPublic === true) {
        // Return only public files
        filter.isPublic = true;
      } else if (options.userId) {
        // Return files owned by the specific user
        if (!Types.ObjectId.isValid(options.userId)) {
          throw new Error('Invalid user ID format');
        }
        filter.userId = new Types.ObjectId(options.userId);
      }

      // Filter by mimetype (case-insensitive partial match)
      if (options.mimetype) {
        filter.mimetype = { $regex: options.mimetype.trim(), $options: 'i' };
      }

      // Filter by tags (match any of the provided tags)
      if (options.tags && options.tags.length > 0) {
        const cleanTags = options.tags.map(tag => tag.trim().toLowerCase()).filter(tag => tag.length > 0);
        if (cleanTags.length > 0) {
          filter.tags = { $in: cleanTags };
        }
      }

      // Filter by search keyword (search in filename and originalname)
      if (options.searchKeyword) {
        const searchRegex = { $regex: options.searchKeyword.trim(), $options: 'i' };
        filter.$or = [
          { filename: searchRegex },
          { originalname: searchRegex }
        ];
      }

      // Build sort object
      const sortObj: any = {};
      sortObj[sortBy] = sortOrder === 'asc' ? 1 : -1;

      try {
        // Execute queries in parallel
        const [files, totalCount] = await Promise.all([
          File.find(filter)
            .sort(sortObj)
            .skip(skip)
            .limit(limit)
            .select('-__v')
            .lean(),
          File.countDocuments(filter)
        ]);

        // Ensure files is always an array
        const filesArray = Array.isArray(files) ? files : [];
        const validTotalCount = typeof totalCount === 'number' ? totalCount : 0;

        // Calculate pagination info
        const totalPages = Math.ceil(validTotalCount / limit);

        return {
          files: filesArray as IFile[],
          pagination: {
            currentPage: page,
            totalPages,
            totalFiles: validTotalCount,
            hasNextPage: page < totalPages,
            hasPreviousPage: page > 1,
            limit
          }
        };
      } catch (dbError) {
        console.error('Database query error:', dbError);
        // Return empty result on database errors
        return {
          files: [],
          pagination: {
            currentPage: page,
            totalPages: 0,
            totalFiles: 0,
            hasNextPage: false,
            hasPreviousPage: false,
            limit
          }
        };
      }

    } catch (error) {
      throw new Error(`Failed to get files: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get a specific file's details by its ID
   * @param id - File ID (MongoDB ObjectId)
   * @param userId - Optional user ID to validate ownership
   * @returns Promise<IFile | null> - File document or null if not found
   */
  public static async getFileById(id: string, userId?: string): Promise<IFile | null> {
    try {
      // Validate ObjectId format
      if (!Types.ObjectId.isValid(id)) {
        throw new Error('Invalid file ID format');
      }

      const filter: FilterQuery<IFile> = { _id: id };

      // If userId is provided, check ownership or public access
      if (userId) {
        if (!Types.ObjectId.isValid(userId)) {
          throw new Error('Invalid user ID format');
        }
        filter.$or = [
          { userId: new Types.ObjectId(userId) },
          { isPublic: true }
        ];
      }

      const file = await File.findOne(filter).select('-__v').lean();
      return file as IFile | null;

    } catch (error) {
      throw new Error(`Failed to get file by ID: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete a file by its ID (with ownership validation)
   * @param id - File ID (MongoDB ObjectId)
   * @param userId - User ID to validate ownership
   * @returns Promise<IFile | null> - Deleted file document or null if not found
   */
  public static async deleteFileById(id: string, userId: string): Promise<IFile | null> {
    try {
      // Validate ObjectId format
      if (!Types.ObjectId.isValid(id)) {
        throw new Error('Invalid file ID format');
      }

      if (!Types.ObjectId.isValid(userId)) {
        throw new Error('Invalid user ID format');
      }

      // Delete only if the user owns the file
      const deletedFile = await File.findOneAndDelete({
        _id: id,
        userId: new Types.ObjectId(userId)
      }).select('-__v');

      return deletedFile;

    } catch (error) {
      throw new Error(`Failed to delete file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update tags for a specific file (with ownership validation)
   * @param id - File ID (MongoDB ObjectId)
   * @param tags - New tags array
   * @param userId - User ID to validate ownership
   * @returns Promise<IFile | null> - Updated file document or null if not found
   */
  public static async updateFileTags(id: string, tags: string[], userId: string): Promise<IFile | null> {
    try {
      // Validate ObjectId format
      if (!Types.ObjectId.isValid(id)) {
        throw new Error('Invalid file ID format');
      }

      if (!Types.ObjectId.isValid(userId)) {
        throw new Error('Invalid user ID format');
      }

      // Validate and clean tags
      if (!Array.isArray(tags)) {
        throw new Error('Tags must be an array');
      }

      const cleanTags = tags
        .filter(tag => typeof tag === 'string' && tag.trim().length > 0)
        .map(tag => tag.trim().toLowerCase());

      // Update only if the user owns the file
      const updatedFile = await File.findOneAndUpdate(
        { _id: id, userId: new Types.ObjectId(userId) },
        { tags: cleanTags },
        { new: true, runValidators: true }
      ).select('-__v');

      return updatedFile;

    } catch (error) {
      throw new Error(`Failed to update file tags: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update the public status of a specific file (with ownership validation)
   * @param id - File ID (MongoDB ObjectId)
   * @param isPublic - New public status
   * @param userId - User ID to validate ownership
   * @returns Promise<IFile | null> - Updated file document or null if not found
   */
  public static async updateFilePublicStatus(id: string, isPublic: boolean, userId: string): Promise<IFile | null> {
    try {
      // Validate ObjectId format
      if (!Types.ObjectId.isValid(id)) {
        throw new Error('Invalid file ID format');
      }

      if (!Types.ObjectId.isValid(userId)) {
        throw new Error('Invalid user ID format');
      }

      // Update only if the user owns the file
      const updatedFile = await File.findOneAndUpdate(
        { _id: id, userId: new Types.ObjectId(userId) },
        { isPublic: Boolean(isPublic) },
        { new: true, runValidators: true }
      ).select('-__v');

      return updatedFile;

    } catch (error) {
      throw new Error(`Failed to update file public status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get file statistics like total count, most common mime types, etc.
   * @returns Promise<FileStats> - File statistics
   */
  public static async getFileStats(): Promise<FileStats> {
    try {
      // Execute aggregation pipelines in parallel
      const [
        totalStats,
        mimetypeStats,
        tagStats
      ] = await Promise.all([
        // Get total count and size statistics
        File.aggregate([
          {
            $group: {
              _id: null,
              totalFiles: { $sum: 1 },
              totalSize: { $sum: '$size' },
              averageSize: { $avg: '$size' }
            }
          }
        ]),
        // Get mimetype distribution
        File.aggregate([
          {
            $group: {
              _id: '$mimetype',
              count: { $sum: 1 }
            }
          },
          {
            $sort: { count: -1 }
          }
        ]),
        // Get tag distribution
        File.aggregate([
          {
            $unwind: '$tags'
          },
          {
            $group: {
              _id: '$tags',
              count: { $sum: 1 }
            }
          },
          {
            $sort: { count: -1 }
          }
        ])
      ]);

      // Process results
      const baseTotalStats = totalStats[0] || { totalFiles: 0, totalSize: 0, averageSize: 0 };

      const mimetypeDistribution: { [mimetype: string]: number } = {};
      const mostCommonMimeTypes = mimetypeStats.map(item => ({
        mimetype: item._id,
        count: item.count
      }));

      mimetypeStats.forEach(item => {
        mimetypeDistribution[item._id] = item.count;
      });

      const tagDistribution: { [tag: string]: number } = {};
      const mostCommonTags = tagStats.map(item => ({
        tag: item._id,
        count: item.count
      }));

      tagStats.forEach(item => {
        tagDistribution[item._id] = item.count;
      });

      return {
        totalFiles: baseTotalStats.totalFiles,
        totalSize: baseTotalStats.totalSize,
        averageSize: Math.round(baseTotalStats.averageSize || 0),
        mimetypeDistribution,
        tagDistribution,
        mostCommonMimeTypes: mostCommonMimeTypes.slice(0, 10), // Top 10
        mostCommonTags: mostCommonTags.slice(0, 10) // Top 10
      };

    } catch (error) {
      throw new Error(`Failed to get file statistics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get files by specific tags
   * @param tags - Array of tags to search for
   * @param matchAll - Whether to match all tags (AND) or any tag (OR)
   * @returns Promise<IFile[]> - Array of matching files
   */
  public static async getFilesByTags(tags: string[], matchAll: boolean = false): Promise<IFile[]> {
    try {
      if (!Array.isArray(tags) || tags.length === 0) {
        return [];
      }

      const cleanTags = tags.map(tag => tag.trim().toLowerCase()).filter(tag => tag.length > 0);
      if (cleanTags.length === 0) {
        return [];
      }

      const filter: FilterQuery<IFile> = matchAll
        ? { tags: { $all: cleanTags } }
        : { tags: { $in: cleanTags } };

      const files = await File.find(filter)
        .sort({ createdAt: -1 })
        .select('-__v')
        .lean();

      return files as IFile[];

    } catch (error) {
      throw new Error(`Failed to get files by tags: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Search files by keyword in filename or originalname
   * @param searchTerm - Search keyword
   * @param options - Additional query options
   * @returns Promise<PaginatedFiles> - Paginated search results
   */
  public static async searchFiles(searchTerm: string, options: FileQueryOptions = {}): Promise<PaginatedFiles> {
    try {
      if (!searchTerm || searchTerm.trim().length === 0) {
        return this.getFiles(options);
      }

      const searchOptions = {
        ...options,
        searchKeyword: searchTerm.trim()
      };

      const result = await this.getFiles(searchOptions);

      // Ensure result has proper structure
      if (!result || !result.files) {
        return {
          files: [],
          pagination: {
            currentPage: 1,
            totalPages: 0,
            totalFiles: 0,
            hasNextPage: false,
            hasPreviousPage: false,
            limit: options.limit || 10
          }
        };
      }

      return result;

    } catch (error) {
      throw new Error(`Failed to search files: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if a file exists by filename
   * @param filename - Filename to check
   * @returns Promise<boolean> - True if file exists
   */
  public static async fileExists(filename: string): Promise<boolean> {
    try {
      const count = await File.countDocuments({ filename });
      return count > 0;
    } catch (error) {
      throw new Error(`Failed to check if file exists: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get files by mimetype
   * @param mimetype - Mimetype to filter by
   * @param options - Additional query options
   * @returns Promise<PaginatedFiles> - Paginated files of specified mimetype
   */
  public static async getFilesByMimetype(mimetype: string, options: FileQueryOptions = {}): Promise<PaginatedFiles> {
    try {
      const mimetypeOptions = {
        ...options,
        mimetype
      };

      return this.getFiles(mimetypeOptions);

    } catch (error) {
      throw new Error(`Failed to get files by mimetype: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

export default FileService;
