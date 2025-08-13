/**
 * Script to process files stored in Cloudflare R2 for semantic search
 * Downloads files as buffers using presigned URLs, extracts text, generates embeddings,
 * and saves the embeddings to MongoDB
 */

import dotenv from 'dotenv';
import { Types } from 'mongoose';
import mongoose from 'mongoose';
import axios from 'axios';
import File from '../src/models/File';
import { FileService } from '../src/services/FileService';
import { SemanticFileService } from '../src/services/SemanticFileService';
import { TextExtractorService } from '../src/services/TextExtractorService';
import { EmbeddingService } from '../src/services/EmbeddingService';

dotenv.config();

// MongoDB connection string
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/cloudnest';

/**
 * Connect to MongoDB
 */
async function connectToMongoDB() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ Failed to connect to MongoDB:', error);
    process.exit(1);
  }
}

/**
 * Download file from R2 using presigned URL
 * @param url - Presigned URL to download the file
 * @returns Promise<Buffer> - Downloaded file as buffer
 */
async function downloadFileFromR2(url: string): Promise<Buffer> {
  try {
    console.log(`📥 Downloading file from: ${url}`);
    const response = await axios.get(url, {
      responseType: 'arraybuffer'
    });
    
    return Buffer.from(response.data);
  } catch (error) {
    console.error('❌ Failed to download file:', error);
    throw error;
  }
}

/**
 * Process a single file for embedding
 * @param fileId - MongoDB file ID
 * @returns Promise<boolean> - True if successful
 */
async function processFile(fileId: string): Promise<boolean> {
  try {
    // Find the file in the database
    const file = await File.findById(fileId) as (typeof File & { _id: Types.ObjectId | string, [key: string]: any }) | null;
    
    if (!file) {
      console.error(`❌ File not found with ID: ${fileId}`);
      return false;
    }
    
    // Check if file already has embedding
    if (file.embedding && file.embedding.length > 0) {
      console.log(`⏭️ File ${fileId} already has embedding, skipping...`);
      return true;
    }
    
    // Get file mimetype
    const mimetype = file.mimetype;
    
    // Check if file type is supported
    const supportedMimetypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ];
    
    if (!supportedMimetypes.includes(mimetype)) {
      console.log(`⏭️ File ${fileId} has unsupported mimetype: ${mimetype}, skipping...`);
      return false;
    }
    
    // Generate or refresh R2 URL if needed
    let fileUrl: string;
    
    if (file.r2ObjectKey) {
      // Generate a fresh presigned URL using the object key
      fileUrl = await FileService.generatePresignedUrl(file.r2ObjectKey);
    } else if (file.r2Url) {
      // Use the stored R2 URL (might be expired)
      fileUrl = file.r2Url;
      
      // Try to extract the object key from the URL and store it for future use
      try {
        const objectKey = FileService.extractObjectKeyFromUrl(file.r2Url);
        await File.updateOne({ _id: file._id.toString() }, { r2ObjectKey: objectKey });
        console.log(`✅ Updated file record with extracted r2ObjectKey: ${objectKey}`);
      } catch (extractError) {
        console.error('❌ Failed to extract object key from URL:', extractError);
      }
    } else if (file.path) {
      // Use local file path if available
      console.log(`🔍 File ${fileId} has local path: ${file.path}`);
      
      try {
        // Process using the existing path method
        await SemanticFileService.processFileFromPath(file.path, file._id.toString());
        console.log(`✅ Successfully processed file ${fileId} using local path`);
        return true;
      } catch (localProcessError) {
        console.error(`❌ Failed to process file ${fileId} using local path:`, localProcessError);
        return false;
      }
    } else {
      console.error(`❌ File ${fileId} has no R2 URL or local path`);
      return false;
    }
    
    // Download the file from R2
    const fileBuffer = await downloadFileFromR2(fileUrl);
    console.log(`✅ Downloaded file: ${file.filename} (${fileBuffer.length} bytes)`);
    
    // Process the file buffer for embedding
    const metadata = await SemanticFileService.processFileForEmbedding({
      buffer: fileBuffer,
      mimetype: file.mimetype,
      filename: file.filename,
      fileId: file._id.toString()
    });
    
    // Save the embedding metadata
    await SemanticFileService.saveFileMetadata(metadata);
    
    console.log(`✅ Successfully processed file ${fileId}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to process file ${fileId}:`, error);
    return false;
  }
}

/**
 * Process all files in the database that need embeddings
 * @param limit - Maximum number of files to process
 * @returns Promise<void>
 */
async function processAllFiles(limit = 10): Promise<void> {
  try {
    // Find files that don't have embeddings yet
    const files = await File.find({
      $or: [
        { embedding: { $exists: false } },
        { embedding: null },
        { embedding: { $size: 0 } }
      ]
    }).limit(limit) as Array<{
      _id: Types.ObjectId | string,
      filename: string,
      mimetype: string,
      embedding?: any[],
      r2ObjectKey?: string,
      r2Url?: string,
      path?: string
    }>;
    
    console.log(`🔍 Found ${files.length} files to process`);
    
    // Initialize embedding model
    await EmbeddingService.initializeModel();
    
    // Process files sequentially to avoid memory issues
    let successCount = 0;
    let failCount = 0;
    
    for (const file of files) {
      console.log(`⏳ Processing file ${file._id.toString()}: ${file.filename}`);
      
      const success = await processFile(file._id.toString());
      
      if (success) {
        successCount++;
      } else {
        failCount++;
      }
      
      // Add a small delay between files to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log(`✅ Processing complete: ${successCount} succeeded, ${failCount} failed`);
  } catch (error) {
    console.error('❌ Failed to process files:', error);
  }
}

/**
 * Process a specific file by ID
 * @param fileId - MongoDB file ID
 * @returns Promise<void>
 */
async function processSpecificFile(fileId: string): Promise<void> {
  try {
    // Initialize embedding model
    await EmbeddingService.initializeModel();
    
    // Process the specific file
    const success = await processFile(fileId);
    
    if (success) {
      console.log(`✅ Successfully processed file ${fileId}`);
    } else {
      console.error(`❌ Failed to process file ${fileId}`);
    }
  } catch (error) {
    console.error(`❌ Failed to process file ${fileId}:`, error);
  }
}

/**
 * Main function
 */
async function main() {
  try {
    // Connect to MongoDB
    await connectToMongoDB();
    
    // Check if a specific file ID was provided as a command-line argument
    const fileId = process.argv[2];
    
    if (fileId) {
      console.log(`🔍 Processing specific file: ${fileId}`);
      await processSpecificFile(fileId);
    } else {
      // Process a batch of files
      const limitArg = process.argv[3];
      const limit = limitArg ? parseInt(limitArg) : 10;
      
      console.log(`🔍 Processing up to ${limit} files without embeddings`);
      await processAllFiles(limit);
    }
    
    // Disconnect from MongoDB
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error in main process:', error);
    process.exit(1);
  }
}

// Run the main function
main();
