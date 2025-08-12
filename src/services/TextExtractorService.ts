import fs from 'fs';
import path from 'path';
import * as pdf from 'pdf-parse';
import { extname } from 'path';
import * as mammoth from 'mammoth';

/**
 * Service for extracting text from different file formats
 */
export class TextExtractorService {
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
          return await this.extractTextFromPdf(filePath);
        case '.docx':
          return await this.extractTextFromDocx(filePath);
        case '.txt':
          return await this.extractTextFromTxt(filePath);
        default:
          throw new Error(`Unsupported file type: ${extension}`);
      }
    } catch (error) {
      console.error('Error extracting text from file:', error);
      throw new Error(`Failed to extract text: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract text from a PDF file
   * @param filePath - Path to the PDF file
   * @returns Promise<string> - Extracted text
   */
  private static async extractTextFromPdf(filePath: string): Promise<string> {
    try {
      const dataBuffer = fs.readFileSync(filePath);
      const pdfData = await pdf.default(dataBuffer);
      return pdfData.text || '';
    } catch (error) {
      console.error('Error extracting text from PDF:', error);
      throw new Error(`Failed to extract text from PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract text from a DOCX file
   * @param filePath - Path to the DOCX file
   * @returns Promise<string> - Extracted text
   */
  private static async extractTextFromDocx(filePath: string): Promise<string> {
    try {
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value || '';
    } catch (error) {
      console.error('Error extracting text from DOCX:', error);
      throw new Error(`Failed to extract text from DOCX: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract text from a TXT file
   * @param filePath - Path to the TXT file
   * @returns Promise<string> - Extracted text
   */
  private static async extractTextFromTxt(filePath: string): Promise<string> {
    try {
      return fs.readFileSync(filePath, 'utf8');
    } catch (error) {
      console.error('Error extracting text from TXT:', error);
      throw new Error(`Failed to extract text from TXT: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

export default TextExtractorService;
