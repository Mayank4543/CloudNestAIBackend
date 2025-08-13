import { EmbeddingService } from './EmbeddingService';
import { TextExtractorService, TextExtractionInput } from './TextExtractorService';
import { SemanticSearchService } from './SemanticSearchService';
import fs from 'fs';
import path from 'path';
import File, { IFile } from '../models/File';
import { Types } from 'mongoose';

/**
 * Interface for metadata to be saved with semantic embedding
 */
export interface FileMetadataWithEmbedding {
  fileId: Types.ObjectId | string;
  embedding: number[];
  textContent?: string; // Optional for debugging
}

/**
 * Interface for file embedding processing input
 */
export interface FileEmbeddingInput {
  // Either filePath or buffer must be provided
  filePath?: string;
  buffer?: Buffer;
  // If buffer is provided, these are required
  mimetype?: string;
  filename?: string;
  // File ID is always required
  fileId: string | Types.ObjectId;
}

/**
 * Service for handling semantic embedding operations
 */
export class SemanticFileService {
  /**
   * Process a file to extract text and generate embedding
   * Support both file path and buffer input
   * @param input - FileEmbeddingInput with file information
   * @returns Promise<FileMetadataWithEmbedding> - File metadata with embedding
   */
  public static async processFileForEmbedding(input: FileEmbeddingInput): Promise<FileMetadataWithEmbedding> {
    try {
      // Check that we have either filePath or buffer
      if (!input.filePath && !input.buffer) {
        throw new Error('Either filePath or buffer must be provided');
      }

      // Check if buffer has required metadata
      if (input.buffer && (!input.mimetype || !input.filename)) {
        throw new Error('mimetype and filename must be provided when processing buffer');
      }

      // Determine file type support
      let fileExtension: string;
      if (input.filePath) {
        fileExtension = path.extname(input.filePath).toLowerCase();
      } else if (input.filename) {
        fileExtension = path.extname(input.filename).toLowerCase();
      } else {
        throw new Error('Cannot determine file type');
      }

      // Check if file type is supported for text extraction
      const supportedExtensions = ['.pdf', '.docx', '.txt'];
      if (!supportedExtensions.includes(fileExtension)) {
        throw new Error(`Unsupported file type for text extraction: ${fileExtension}`);
      }

      // Prepare extraction input
      const extractionInput: TextExtractionInput = {
        filePath: input.filePath,
        buffer: input.buffer,
        mimetype: input.mimetype,
        filename: input.filename
      };

      // Extract text from file or buffer
      console.log(`Extracting text from ${input.filePath || input.filename}`);
      const text = await TextExtractorService.extractText(extractionInput);

      if (!text || text.trim().length === 0) {
        throw new Error('No text content could be extracted from the file');
      }

      // Generate embedding from text
      console.log('Generating embedding from extracted text');
      const embedding = await EmbeddingService.generateEmbedding(text);

      // Prepare metadata
      const metadata: FileMetadataWithEmbedding = {
        fileId: input.fileId,
        embedding,
        textContent: text.substring(0, 1000) // Store a preview of the text (first 1000 chars)
      };

      return metadata;
    } catch (error) {
      console.error('Error processing file for embedding:', error);
      throw new Error(`Failed to process file for embedding: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Legacy method for backward compatibility
   * @param filePath - Path to the file
   * @param fileId - MongoDB ID of the file
   * @returns Promise<FileMetadataWithEmbedding> - File metadata with embedding
   */
  public static async processFileFromPath(filePath: string, fileId: string | Types.ObjectId): Promise<FileMetadataWithEmbedding> {
    return this.processFileForEmbedding({
      filePath,
      fileId
    });
  }

  /**
   * Save file metadata with embedding to MongoDB
   * @param metadata - File metadata with embedding
   * @returns Promise<IFile> - Updated file document
   */
  public static async saveFileMetadata(metadata: FileMetadataWithEmbedding): Promise<IFile> {
    try {
      // Validate ObjectId format
      if (!Types.ObjectId.isValid(metadata.fileId.toString())) {
        throw new Error('Invalid file ID format');
      }

      // Update file document with embedding
      const fileId = new Types.ObjectId(metadata.fileId.toString());

      const updatedFile = await File.findByIdAndUpdate(
        fileId,
        {
          embedding: metadata.embedding,
          textContent: metadata.textContent || ''
        },
        { new: true }
      );

      if (!updatedFile) {
        throw new Error(`File not found with ID: ${fileId}`);
      }

      return updatedFile;
    } catch (error) {
      console.error('Error saving file metadata with embedding:', error);
      throw new Error(`Failed to save file metadata: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Search for files using semantic search
   * @param query - Search query text
   * @param userId - User ID to filter files by ownership
   * @param includePublic - Whether to include public files in search
   * @param limit - Maximum number of results to return
   * @returns Promise<Array> - Search results
   */
  public static async searchFiles(query: string, userId: string, includePublic = true, limit = 10): Promise<any[]> {
    try {
      // Use SemanticSearchService to perform the search
      const searchOptions = {
        userId,
        includePublic,
        limit
      };

      const results = await SemanticSearchService.searchFiles(query, searchOptions);
      return results;
    } catch (error) {
      console.error('Error searching files:', error);
      throw new Error(`Failed to search files: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

export default SemanticFileService;
