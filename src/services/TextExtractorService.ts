import fs from 'fs';
import path from 'path';
import * as pdf from 'pdf-parse';
import { extname } from 'path';
import * as mammoth from 'mammoth';

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
      let fileType: 'pdf' | 'docx' | 'txt';

      if (mimetype) {
        // Determine from mimetype
        if (mimetype === 'application/pdf') {
          fileType = 'pdf';
        } else if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
          fileType = 'docx';
        } else if (mimetype === 'text/plain') {
          fileType = 'txt';
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
        default:
          throw new Error(`Unsupported file type: ${fileType}`);
      }
    } catch (error) {
      console.error('Error extracting text from buffer:', error);
      throw new Error(`Failed to extract text from buffer: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
}


export default TextExtractorService;
