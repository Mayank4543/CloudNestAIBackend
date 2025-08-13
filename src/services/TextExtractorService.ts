import fs from 'fs';
import path from 'path';
import * as pdf from 'pdf-parse';
import { extname } from 'path';
import * as mammoth from 'mammoth';
import { CsvProcessorService } from './CsvProcessorService';
import { ImageProcessorService } from './ImageProcessorService';

/**
 * Input for text extraction - either file path or buffer with mimetype
 */
export interface TextExtractionInput {
  filePath?: string;
  buffer?: Buffer;
  mimetype?: string;
  filename?: string;
}

/**
 * Service for extracting text from different file formats
 */
export class TextExtractorService {
  /**
   * Extract text from a file or buffer based on its file extension or mimetype
   * @param input - TextExtractionInput containing either filePath or buffer+mimetype
   * @returns Promise<string> - Extracted text
   */
  public static async extractText(input: TextExtractionInput): Promise<string> {
    try {
      // Determine if using file path or buffer
      if (input.filePath) {
        return this.extractTextFromFile(input.filePath);
      } else if (input.buffer) {
        if (!input.mimetype && !input.filename) {
          throw new Error('Either mimetype or filename must be provided when extracting from buffer');
        }

        return this.extractTextFromBuffer(input.buffer, input.mimetype, input.filename);
      } else {
        throw new Error('Either filePath or buffer must be provided');
      }
    } catch (error) {
      console.error('Error extracting text:', error);
      throw new Error(`Failed to extract text: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract text from a file based on its file extension
   * @param filePath - Path to the file
   * @returns Promise<string> - Extracted text
   */
  public static async extractTextFromFile(filePath: string): Promise<string> {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const extension = extname(filePath).toLowerCase();

      switch (extension) {
        case '.pdf':
          return await this.extractTextFromPdfFile(filePath);
        case '.docx':
          return await this.extractTextFromDocxFile(filePath);
        case '.txt':
          return await this.extractTextFromTxtFile(filePath);
        case '.csv':
          return await this.extractTextFromCsvFile(filePath);
        case '.jpg':
        case '.jpeg':
        case '.png':
        case '.bmp':
        case '.tiff':
        case '.webp':
          return await this.extractTextFromImageFile(filePath);
        default:
          throw new Error(`Unsupported file type: ${extension}`);
      }
    } catch (error) {
      console.error('Error extracting text from file:', error);
      throw new Error(`Failed to extract text: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract text from a buffer based on mimetype or filename
   * @param buffer - File data as buffer
   * @param mimetype - MIME type of the file
   * @param filename - Optional filename to determine file type if mimetype is not provided
   * @returns Promise<string> - Extracted text
   */
  public static async extractTextFromBuffer(
    buffer: Buffer,
    mimetype?: string,
    filename?: string
  ): Promise<string> {
    try {
      // Determine file type from mimetype or filename
      let fileType: 'pdf' | 'docx' | 'txt' | 'csv' | 'image';

      if (mimetype) {
        // Determine from mimetype
        if (mimetype === 'application/pdf') {
          fileType = 'pdf';
        } else if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
          fileType = 'docx';
        } else if (mimetype === 'text/plain') {
          fileType = 'txt';
        } else if (mimetype === 'text/csv') {
          fileType = 'csv';
        } else if (mimetype.startsWith('image/')) {
          fileType = 'image';
        } else {
          throw new Error(`Unsupported MIME type: ${mimetype}`);
        }
      } else if (filename) {
        // Determine from filename extension
        const extension = extname(filename).toLowerCase();

        if (extension === '.pdf') {
          fileType = 'pdf';
        } else if (extension === '.docx') {
          fileType = 'docx';
        } else if (extension === '.txt') {
          fileType = 'txt';
        } else if (extension === '.csv') {
          fileType = 'csv';
        } else if (['.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.webp'].includes(extension)) {
          fileType = 'image';
        } else {
          throw new Error(`Unsupported file extension: ${extension}`);
        }
      } else {
        throw new Error('Either mimetype or filename must be provided');
      }

      // Extract text based on determined file type
      switch (fileType) {
        case 'pdf':
          return await this.extractTextFromPdfBuffer(buffer);
        case 'docx':
          return await this.extractTextFromDocxBuffer(buffer);
        case 'txt':
          return this.extractTextFromTxtBuffer(buffer);
        case 'csv':
          return await this.extractTextFromCsvBuffer(buffer, filename || 'unknown.csv');
        case 'image':
          return await this.extractTextFromImageBuffer(buffer, filename || 'unknown.jpg');
        default:
          throw new Error(`Unsupported file type: ${fileType}`);
      }
    } catch (error) {
      console.error('Error extracting text from buffer:', error);
      throw new Error(`Failed to extract text from buffer: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract text from a CSV file
   * @param filePath - Path to the CSV file
   * @returns Promise<string> - Extracted text
   */
  private static async extractTextFromCsvFile(filePath: string): Promise<string> {
    try {
      const result = await CsvProcessorService.processCsvFile(filePath);
      return result.text;
    } catch (error) {
      console.error('Error extracting text from CSV file:', error);
      throw new Error(`Failed to extract text from CSV file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract text from a CSV buffer
   * @param buffer - CSV file content as buffer
   * @param filename - Original filename
   * @returns Promise<string> - Extracted text
   */
  private static async extractTextFromCsvBuffer(buffer: Buffer, filename: string): Promise<string> {
    try {
      const result = await CsvProcessorService.processCsvBuffer(buffer, filename);
      return result.text;
    } catch (error) {
      console.error('Error extracting text from CSV buffer:', error);
      throw new Error(`Failed to extract text from CSV buffer: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract text from an image file
   * @param filePath - Path to the image file
   * @returns Promise<string> - Extracted text
   */
  private static async extractTextFromImageFile(filePath: string): Promise<string> {
    try {
      const result = await ImageProcessorService.processImageFile(filePath);
      return result.text;
    } catch (error) {
      console.error('Error extracting text from image file:', error);
      throw new Error(`Failed to extract text from image file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract text from an image buffer
   * @param buffer - Image file content as buffer
   * @param filename - Original filename
   * @returns Promise<string> - Extracted text
   */
  private static async extractTextFromImageBuffer(buffer: Buffer, filename: string): Promise<string> {
    try {
      const result = await ImageProcessorService.processImageBuffer(buffer, filename);
      return result.text;
    } catch (error) {
      console.error('Error extracting text from image buffer:', error);
      throw new Error(`Failed to extract text from image buffer: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract text from a PDF file
   * @param filePath - Path to the PDF file
   * @returns Promise<string> - Extracted text
   */
  private static async extractTextFromPdfFile(filePath: string): Promise<string> {
    try {
      const dataBuffer = fs.readFileSync(filePath);
      return await this.extractTextFromPdfBuffer(dataBuffer);
    } catch (error) {
      console.error('Error extracting text from PDF file:', error);
      throw new Error(`Failed to extract text from PDF file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract text from a PDF buffer
   * @param buffer - PDF file content as buffer
   * @returns Promise<string> - Extracted text
   */
  private static async extractTextFromPdfBuffer(buffer: Buffer): Promise<string> {
    try {
      const pdfData = await pdf.default(buffer);
      return pdfData.text || '';
    } catch (error) {
      console.error('Error extracting text from PDF buffer:', error);
      throw new Error(`Failed to extract text from PDF buffer: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract text from a DOCX file
   * @param filePath - Path to the DOCX file
   * @returns Promise<string> - Extracted text
   */
  private static async extractTextFromDocxFile(filePath: string): Promise<string> {
    try {
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value || '';
    } catch (error) {
      console.error('Error extracting text from DOCX file:', error);
      throw new Error(`Failed to extract text from DOCX file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract text from a DOCX buffer
   * @param buffer - DOCX file content as buffer
   * @returns Promise<string> - Extracted text
   */
  private static async extractTextFromDocxBuffer(buffer: Buffer): Promise<string> {
    try {
      const result = await mammoth.extractRawText({ buffer: buffer });
      return result.value || '';
    } catch (error) {
      console.error('Error extracting text from DOCX buffer:', error);
      throw new Error(`Failed to extract text from DOCX buffer: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract text from a TXT file
   * @param filePath - Path to the TXT file
   * @returns Promise<string> - Extracted text
   */
  private static async extractTextFromTxtFile(filePath: string): Promise<string> {
    try {
      return fs.readFileSync(filePath, 'utf8');
    } catch (error) {
      console.error('Error extracting text from TXT file:', error);
      throw new Error(`Failed to extract text from TXT file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract text from a TXT buffer
   * @param buffer - TXT file content as buffer
   * @returns string - Extracted text
   */
  private static extractTextFromTxtBuffer(buffer: Buffer): string {
    try {
      return buffer.toString('utf8');
    } catch (error) {
      console.error('Error extracting text from TXT buffer:', error);
      throw new Error(`Failed to extract text from TXT buffer: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get supported file types
   * @returns string[] - Array of supported file extensions
   */
  public static getSupportedFileTypes(): string[] {
    return ['.pdf', '.docx', '.txt', '.csv', '.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.webp'];
  }

  /**
   * Get supported MIME types
   * @returns string[] - Array of supported MIME types
   */
  public static getSupportedMimeTypes(): string[] {
    return [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/csv',
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/bmp',
      'image/tiff',
      'image/webp'
    ];
  }
}

export default TextExtractorService;
