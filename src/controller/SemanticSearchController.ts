import { Request, Response } from 'express';
import { SemanticFileService } from '../services/SemanticFileService';
import { getFileUrl, extractFilename } from '../utils/uploadPaths';

// Controller for semantic1 search operations
export class SemanticSearchController {
  /**
   * Search files using semantic search
   * @param req - Express request object
   * @param res - Express response object
   * @returns Promise<void>
   */
  public static async searchFiles(req: Request, res: Response): Promise<void> {
    try {
      const { q: query } = req.query;

      // Check if user is authenticated
      if (!req.user || !req.user._id) {
        res.status(401).json({
          success: false,
          message: 'User authentication required'
        });
        return;
      }

      if (!query || typeof query !== 'string') {
        res.status(400).json({
          success: false,
          message: 'Search query is required'
        });
        return;
      }

      // Extract other query parameters
      const limit = parseInt(req.query.limit as string) || 10;
      const includePublic = req.query.includePublic !== 'false';

      // Perform the semantic search
      const results = await SemanticFileService.searchFiles(
        query,
        req.user._id.toString(),
        includePublic,
        limit
      );

      // Add public URLs to the results if they don't have r2Url
      const resultsWithUrls = results.map((file) => {
        if (!file.url || (!file.url.startsWith('http') && !file.r2Url)) {
          const filename = extractFilename(file.url || file.filename);
          return {
            ...file,
            url: file.r2Url || getFileUrl(filename, req)
          };
        }
        return file;
      });

      res.status(200).json({
        success: true,
        message: 'Semantic search completed successfully',
        data: resultsWithUrls,
        query: query
      });
    } catch (error) {
      console.error('Error performing semantic search:', error);
      res.status(500).json({
        success: false,
        message: 'Error performing semantic search',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Process an existing file for semantic search
   * @param req - Express request object
   * @param res - Express response object
   * @returns Promise<void>
   */
  public static async processFile(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      // Check if user is authenticated
      if (!req.user || !req.user._id) {
        res.status(401).json({
          success: false,
          message: 'User authentication required'
        });
        return;
      }

      // First, get the file to verify ownership and get the path
      const File = require('../models/File').default;
      const file = await File.findOne({ 
        _id: id,
        userId: req.user._id 
      });

      if (!file) {
        res.status(404).json({
          success: false,
          message: 'File not found or access denied'
        });
        return;
      }

      // Check if file is a supported type
      const supportedTypes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain'
      ];

      if (!supportedTypes.includes(file.mimetype)) {
        res.status(400).json({
          success: false,
          message: `File type ${file.mimetype} is not supported for text extraction`
        });
        return;
      }

      // Start the processing
      res.status(202).json({
        success: true,
        message: 'File processing for semantic search started',
        data: {
          fileId: file._id,
          status: 'processing'
        }
      });

      // Process the file asynchronously
      try {
        // Need to get the local file path from R2 or other storage
        const TextExtractorService = require('../services/TextExtractorService').TextExtractorService;
        const EmbeddingService = require('../services/EmbeddingService').EmbeddingService;
        const SemanticFileService = require('../services/SemanticFileService').SemanticFileService;
        
        // Extract text (implementation depends on your system)
        // This might require downloading from R2 first
        const text = await TextExtractorService.extractTextFromFile(file.path);
        
        // Generate embedding
        const embedding = await EmbeddingService.generateEmbedding(text);
        
        // Save to database
        await SemanticFileService.saveFileMetadata({
          fileId: file._id,
          embedding,
          textContent: text.substring(0, 1000)
        });
        
        console.log(`File ${file._id} processed successfully for semantic search`);
      } catch (processingError) {
        console.error(`Error processing file ${file._id} for semantic search:`, processingError);
        // We already sent a 202 response, so this error handling is just for logging
      }
    } catch (error) {
      console.error('Error processing file for semantic search:', error);
      res.status(500).json({
        success: false,
        message: 'Error processing file for semantic search',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}

export default SemanticSearchController;
