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
      // Prepare the base MongoDB query filter
      const baseFilter: FilterQuery<IFile> = {};

      // Apply user filter - show user's files and optionally public files
      if (options.userId) {
        if (options.includePublic) {
          baseFilter.$or = [
            { userId: new Types.ObjectId(options.userId) },
            { isPublic: true }
          ];
        } else {
          baseFilter.userId = new Types.ObjectId(options.userId);
        }
      }

      // Set default limit if not provided
      const limit = options.limit || 10;

      // Prepare resources reused across strategies
      // Generate embedding for the search query once so all strategies can reuse it
      const queryEmbedding = await EmbeddingService.generateEmbedding(query);

      // For vector search, we need files with embeddings
      const vectorFilter = {
        ...baseFilter,
        embedding: { $exists: true }
      };

      try {
        // First try Atlas Search with your existing embeddingVectorIndex
        console.log(`Attempting Atlas Search with embeddingVectorIndex for query: "${query}"`);

        // Execute Atlas Search using $search.knnBeta with your existing index
        const results = await File.aggregate([
          {
            $search: {
              index: "embeddingVectorIndex", // Your existing Atlas Search index
              knnBeta: {
                vector: queryEmbedding,
                path: "embedding",
                k: limit
              }
            }
          },
          {
            $match: vectorFilter
          },
          {
            $project: {
              _id: 1,
              filename: 1,
              originalname: 1,
              size: 1,
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
          size: file.size,
          url: file.r2Url || file.path,
          relevanceScore: file.score,
          isPublic: file.isPublic,
          tags: file.tags || [],
          r2Url: file.r2Url
        }));
      } catch (atlasSearchError) {
        // If Atlas Search fails, fall back to traditional text search
        console.error('Atlas Search failed, falling back to text search:', atlasSearchError);

        // Fallback to keyword search
        console.log(`Falling back to keyword search for query: "${query}"`);

        // Create a text search filter
        const searchWords = query.toLowerCase().split(/\s+/).filter(word => word.length > 0);

        // Create regex patterns for each search word
        const regexPatterns = searchWords.map(word => new RegExp(word, 'i'));

        // Define a proper type for our search conditions to avoid TypeScript errors
        interface SearchCondition {
          filename?: { $in: RegExp[] };
          originalname?: { $in: RegExp[] };
          tags?: { $in: string[] };
        }

        // Create text search conditions with proper typing
        const textSearchConditions: SearchCondition[] = [
          { filename: { $in: regexPatterns } },
          { originalname: { $in: regexPatterns } }
        ];

        // Add tag search condition if there are words to search
        if (searchWords.length > 0) {
          textSearchConditions.push({ tags: { $in: searchWords } });
        }

        // Combine with the base filter
        const fullFilter = {
          ...baseFilter,
          $or: textSearchConditions
        };

        // Execute text search
        const results = await File.find(fullFilter)
          .sort({ createdAt: -1 })
          .limit(limit)
          .lean();

        // Format results for consistency with vector search
        return results.map(file => ({
          fileId: file._id.toString(),
          filename: file.filename,
          originalname: file.originalname,
          size: file.size,
          url: file.r2Url || file.path,
          relevanceScore: 1.0, // Default score for text search results
          isPublic: file.isPublic,
          tags: file.tags || [],
          r2Url: file.r2Url
        }));
      }
    } catch (error) {
      console.error('Error performing search:', error);

      // Last resort - return empty results instead of throwing an error
      // This prevents the API from returning a 500 error
      console.log('Returning empty results as last resort');
      return [];

      // Uncomment this to throw the error instead of returning empty results
      // throw new Error(`Failed to search files: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

export default SemanticSearchService;
