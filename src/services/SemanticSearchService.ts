import { FilterQuery, Types } from 'mongoose';
import File, { IFile } from '../models/File';
import { EmbeddingService } from './EmbeddingService';

/**
 * Interface for search results
 */
export interface SearchResult {
  fileId: string;
  filename: string;
  originalname: string;
  url: string;
  relevanceScore: number;
  isPublic: boolean;
  tags: string[];
  r2Url?: string;
}

/**
 * Interface for search options
 */
export interface SearchOptions {
  limit?: number;
  userId?: string;
  includePublic?: boolean;
}

/**
 * Service for semantic search functionality
 */
export class SemanticSearchService {
  /**
   * Search for files using semantic search
   * @param query - Search query text
   * @param options - Search options
   * @returns Promise<SearchResult[]> - Array of search results
   */
  public static async searchFiles(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    try {
      // Generate embedding for the search query
      const queryEmbedding = await EmbeddingService.generateEmbedding(query);
      
      // Prepare the MongoDB query filter
      const filter: FilterQuery<IFile> = {};
      
      // Include only files that have embeddings
      filter.embedding = { $exists: true };
      
      // Apply user filter - show user's files and optionally public files
      if (options.userId) {
        if (options.includePublic) {
          filter.$or = [
            { userId: new Types.ObjectId(options.userId) },
            { isPublic: true }
          ];
        } else {
          filter.userId = new Types.ObjectId(options.userId);
        }
      }
      
      // Set default limit if not provided
      const limit = options.limit || 10;
      
      // Execute vector search using $vectorSearch operator
      const results = await File.aggregate([
        {
          $search: {
            knnBeta: {
              vector: queryEmbedding,
              path: "embedding",
              k: limit,
            }
          }
        },
        {
          $match: filter
        },
        {
          $project: {
            _id: 1,
            filename: 1,
            originalname: 1,
            isPublic: 1,
            r2Url: 1,
            path: 1,
            tags: 1,
            score: { $meta: "searchScore" }
          }
        },
        {
          $sort: { score: -1 }
        },
        {
          $limit: limit
        }
      ]);

      
      // Format results
      return results.map(file => ({
        fileId: file._id.toString(),
        filename: file.filename,
        originalname: file.originalname,
        url: file.r2Url || file.path,
        relevanceScore: file.score,
        isPublic: file.isPublic,
        tags: file.tags || [],
        r2Url: file.r2Url
      }));
    } catch (error) {
      console.error('Error performing semantic search:', error);
      throw new Error(`Failed to search files: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

export default SemanticSearchService;
