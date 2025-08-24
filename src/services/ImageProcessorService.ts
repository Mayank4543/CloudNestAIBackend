import * as Tesseract from 'tesseract.js';
import sharp from 'sharp';
import imageSize from 'image-size';

/**
 * Interface for image processing results
 */
export interface ImageProcessingResult {
  text: string;
  metadata: {
    filename: string;
    size: number;
    width: number;
    height: number;
    format: string;
    hasText: boolean;
  };
}

/**
 * Service for processing images with OCR
 */
export class ImageProcessorService {
  /**
   * Process image from buffer and extract text using OCR
   * @param buffer - Image file content as buffer
   * @param filename - Original filename
   * @returns Promise<ImageProcessingResult> - Processed image data
   */
  public static async processImageBuffer(buffer: Buffer, filename: string): Promise<ImageProcessingResult> {
    try {
      console.log(`Processing image file: ${filename}`);
      
      // Get image metadata
      const metadata = await this.getImageMetadata(buffer, filename);
      
      // Extract text using OCR
      const text = await this.extractTextFromImage(buffer);
      
      return {
        text,
        metadata: {
          ...metadata,
          hasText: text.trim().length > 0 && text !== 'No text found in image'
        }
      };
    } catch (error) {
      console.error('Error processing image buffer:', error);
      throw new Error(`Failed to process image: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Process image from file path
   * @param filePath - Path to the image file
   * @returns Promise<ImageProcessingResult> - Processed image data
   */
  public static async processImageFile(filePath: string): Promise<ImageProcessingResult> {
    try {
      const fs = require('fs');
      const buffer = fs.readFileSync(filePath);
      const filename = require('path').basename(filePath);
      return await this.processImageBuffer(buffer, filename);
    } catch (error) {
      console.error('Error processing image file:', error);
      throw new Error(`Failed to process image file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract text from image using OCR
   * @param buffer - Image file content as buffer
   * @returns Promise<string> - Extracted text
   */
  private static async extractTextFromImage(buffer: Buffer): Promise<string> {
    try {
      // Preprocess image for better OCR results
      const processedBuffer = await this.preprocessImage(buffer);
      
      // Perform OCR using Tesseract.js
      const result = await Tesseract.recognize(processedBuffer, 'eng', {
        logger: m => {
          // Only log progress for debugging
          if (m.status === 'recognizing text') {
            console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
          }
        }
      });

      const extractedText = result.data.text.trim();
      
      // Check if any meaningful text was extracted
      if (!extractedText || extractedText.length < 3) {
        return 'No text found in image';
      }
      
      return extractedText;
    } catch (error) {
      console.error('Error extracting text from image:', error);
      return 'No text found in image';
    }
  }

  /**
   * Preprocess image for better OCR results
   * @param buffer - Original image buffer
   * @returns Promise<Buffer> - Preprocessed image buffer
   */
  private static async preprocessImage(buffer: Buffer): Promise<Buffer> {
    try {
      // Try using Sharp to preprocess the image
      try {
        const processedBuffer = await sharp(buffer)
          .grayscale() // Convert to grayscale for better OCR
          .normalize() // Normalize contrast
          .sharpen() // Sharpen the image
          .png() // Convert to PNG format
          .toBuffer();
        
        return processedBuffer;
      } catch (sharpError) {
        // If Sharp fails, log it and use fallback method
        console.warn('Sharp preprocessing failed, using fallback method:', sharpError);
        
        // Fallback: For environments where Sharp might not work properly
        // Just return the original buffer - Tesseract will still work but with reduced accuracy
        return buffer;
      }
    } catch (error) {
      console.warn('Image preprocessing completely failed, using original:', error);
      return buffer;
    }
  }

  /**
   * Get image metadata
   * @param buffer - Image file content as buffer
   * @param filename - Original filename
   * @returns Promise<{ filename: string; size: number; width: number; height: number; format: string }> - Image metadata
   */
  private static async getImageMetadata(buffer: Buffer, filename: string): Promise<{
    filename: string;
    size: number;
    width: number;
    height: number;
    format: string;
  }> {
    try {
      const dimensions = imageSize(buffer);
      
      return {
        filename,
        size: buffer.length,
        width: dimensions.width || 0,
        height: dimensions.height || 0,
        format: dimensions.type || 'unknown'
      };
    } catch (error) {
      console.error('Error getting image metadata:', error);
      return {
        filename,
        size: buffer.length,
        width: 0,
        height: 0,
        format: 'unknown'
      };
    }
  }

  /**
   * Check if image contains text (quick check without full OCR)
   * @param buffer - Image file content as buffer
   * @returns Promise<boolean> - True if image likely contains text
   */
  public static async hasTextContent(buffer: Buffer): Promise<boolean> {
    try {
      // This is a simplified check - in a real implementation, you might use
      // more sophisticated methods to detect text regions
      const text = await this.extractTextFromImage(buffer);
      return text !== 'No text found in image' && text.trim().length > 0;
    } catch (error) {
      console.error('Error checking text content:', error);
      return false;
    }
  }

  /**
   * Get supported image formats
   * @returns string[] - Array of supported image formats
   */
  public static getSupportedFormats(): string[] {
    return ['jpg', 'jpeg', 'png', 'bmp', 'tiff', 'webp'];
  }
}

export default ImageProcessorService;
