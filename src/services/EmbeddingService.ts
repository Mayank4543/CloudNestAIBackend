import { pipeline } from '@xenova/transformers';
import fs from 'fs';
import path from 'path';
import { extname } from 'path';
import { TextExtractorService } from './TextExtractorService';

/**
 * Service class for generating embeddings from text using Hugging Face models
 */
export class EmbeddingService {
  private static pipeline: any = null;
  private static MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';
  private static isInitializing = false;
  private static initPromise: Promise<void> | null = null;

  /**
   * Initializes the embedding pipeline using the Hugging Face model
   * @returns Promise<void>
   */
  public static async initializeModel(): Promise<void> {
    if (this.pipeline) {
      return;
    }

    if (this.isInitializing && this.initPromise) {
      return this.initPromise;
    }

    this.isInitializing = true;

    this.initPromise = new Promise<void>(async (resolve, reject) => {
      try {
        console.log(`📚 Initializing embedding model: ${this.MODEL_NAME}`);
        this.pipeline = await pipeline('feature-extraction', this.MODEL_NAME);
        console.log('✅ Embedding model loaded successfully');
        this.isInitializing = false;
        resolve();
      } catch (error) {
        console.error('❌ Failed to initialize embedding model:', error);
        this.isInitializing = false;
        reject(error);
      }
    });

    return this.initPromise;
  }

  /**
   * Generates an embedding vector for the input text
   * @param text - Text to generate embedding for
   * @returns Promise<number[]> - Embedding vector as an array of numbers
   */
  public static async generateEmbedding(text: string): Promise<number[]> {
    try {
      // Handle empty text gracefully
      if (!text || text.trim().length === 0) {
        console.warn('Empty text provided for embedding generation, returning zeros');
        // Return a vector of zeros with the expected dimensions for the model (384 for all-MiniLM-L6-v2)
        return new Array(384).fill(0);
      }

      // Initialize model if needed
      if (!this.pipeline) {
        await this.initializeModel();
      }

      // Clean and truncate the text
      const cleanedText = this.preprocessText(text);

      // Generate embedding with timeout to prevent hanging
      const output = await this.generateEmbeddingWithTimeout(cleanedText);

      // Convert to array
      const embedding = Array.from(output.data) as number[];

      return embedding;
    } catch (error) {
      console.error('Error generating embedding:', error);
      
      // Rather than throw an error, return a zero vector
      // This allows the application to continue even if embedding generation fails
      console.warn('Returning zero embedding as fallback');
      return new Array(384).fill(0); // 384 dimensions for all-MiniLM-L6-v2
    }
  }
  
  /**
   * Wrapper for embedding generation with timeout to prevent hanging
   * @param text - Preprocessed text to generate embedding for
   * @returns Promise - Embedding output
   */
  private static async generateEmbeddingWithTimeout(text: string, timeoutMs = 30000): Promise<any> {
    return new Promise(async (resolve, reject) => {
      // Set timeout to prevent hanging
      const timer = setTimeout(() => {
        reject(new Error(`Embedding generation timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      
      try {
        // Generate embedding
        const output = await this.pipeline(text, {
          pooling: 'mean',
          normalize: true,
        });
        
        clearTimeout(timer);
        resolve(output);
      } catch (error) {
        clearTimeout(timer);
        reject(error);
      }
    });
  }

  /**
   * Extract text from a file based on its type
   * @param filePath - Path to the file
   * @returns Promise<string> - Extracted text
   */
  public static async extractTextFromFile(filePath: string): Promise<string> {
    return TextExtractorService.extractTextFromFile(filePath);
  }

  /**
   * Clean and preprocess text for embedding generation
   * @param text - Raw text input
   * @returns string - Preprocessed text
   */
  private static preprocessText(text: string): string {
    if (!text) return '';

    // Remove excessive whitespace
    let processedText = text.replace(/\s+/g, ' ').trim();

    // Truncate if necessary - max 512 tokens (roughly 2000 chars)
    const MAX_LENGTH = 2000;
    if (processedText.length > MAX_LENGTH) {
      processedText = processedText.substring(0, MAX_LENGTH);
    }

    return processedText;
  }
}

export default EmbeddingService;
