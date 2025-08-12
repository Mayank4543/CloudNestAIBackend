import { EmbeddingService } from './EmbeddingService';
import { TextExtractorService } from './TextExtractorService';
import { SemanticSearchService } from './SemanticSearchService'
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
 * Service for handling semantic embedding operations
 */
export class SemanticFileService {
  /**
   * Process a file to extract text and generate embedding
   * @param filePath - Path to the file
   * @param fileId - MongoDB ID of the file
   * @returns Promise<FileMetadataWithEmbedding> - File metadata with embedding
   */
  public static async processFileForEmbedding(filePath: string, fileId: string | Types.ObjectId): Promise<FileMetadataWithEmbedding> {
    try {
      // Validate file exists
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      // Get file extension
      const ext = path.extname(filePath).toLowerCase();

      // Check if file type is supported for text extraction
      const supportedExtensions = ['.pdf', '.docx', '.txt'];
      if (!supportedExtensions.includes(ext)) {
        throw new Error(`Unsupported file type for text extraction: ${ext}`);
      }

      // Extract text from file
      console.log(`Extracting text from ${filePath}`);
      const text = await TextExtractorService.extractTextFromFile(filePath);

      if (!text || text.trim().length === 0) {
        throw new Error('No text content could be extracted from the file');
      }

      // Generate embedding from text
      console.log('Generating embedding from extracted text');
      const embedding = await EmbeddingService.generateEmbedding(text);

      // Prepare metadata
      const metadata: FileMetadataWithEmbedding = {
        fileId,
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
