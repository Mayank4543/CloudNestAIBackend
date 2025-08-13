import Papa from 'papaparse';
import * as csvParser from 'csv-parser';
import { Readable } from 'stream';

/**
 * Interface for CSV processing results
 */
export interface CsvProcessingResult {
  text: string;
  rows: any[];
  headers: string[];
  totalRows: number;
  metadata: {
    filename: string;
    size: number;
    columns: number;
  };
}

/**
 * Service for processing CSV files
 */
export class CsvProcessorService {
  /**
   * Process CSV file from buffer and extract text content
   * @param buffer - CSV file content as buffer
   * @param filename - Original filename
   * @returns Promise<CsvProcessingResult> - Processed CSV data
   */
  public static async processCsvBuffer(buffer: Buffer, filename: string): Promise<CsvProcessingResult> {
    try {
      console.log(`Processing CSV file: ${filename}`);
      
      // Convert buffer to string
      const csvString = buffer.toString('utf8');
      
      // Parse CSV using Papa Parse
      const parseResult = Papa.parse(csvString, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header) => header.trim(),
        transform: (value) => value.trim()
      });

      if (parseResult.errors.length > 0) {
        console.warn('CSV parsing warnings:', parseResult.errors);
      }

      const rows = parseResult.data as any[];
      const headers = parseResult.meta.fields || [];
      
      // Convert CSV data to searchable text
      const text = this.convertCsvToText(rows, headers);
      
      return {
        text,
        rows,
        headers,
        totalRows: rows.length,
        metadata: {
          filename,
          size: buffer.length,
          columns: headers.length
        }
      };
    } catch (error) {
      console.error('Error processing CSV buffer:', error);
      throw new Error(`Failed to process CSV: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Process CSV file from file path
   * @param filePath - Path to the CSV file
   * @returns Promise<CsvProcessingResult> - Processed CSV data
   */
  public static async processCsvFile(filePath: string): Promise<CsvProcessingResult> {
    try {
      const fs = require('fs');
      const buffer = fs.readFileSync(filePath);
      const filename = require('path').basename(filePath);
      return await this.processCsvBuffer(buffer, filename);
    } catch (error) {
      console.error('Error processing CSV file:', error);
      throw new Error(`Failed to process CSV file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Convert CSV rows and headers to searchable text
   * @param rows - Array of CSV rows
   * @param headers - Array of column headers
   * @returns string - Searchable text representation
   */
  private static convertCsvToText(rows: any[], headers: string[]): string {
    try {
      let text = '';
      
      // Add headers as text
      if (headers.length > 0) {
        text += `Columns: ${headers.join(', ')}\n\n`;
      }
      
      // Add each row as text
      rows.forEach((row, index) => {
        text += `Row ${index + 1}: `;
        
        const rowValues = headers.map(header => {
          const value = row[header];
          return value ? String(value) : '';
        }).filter(value => value.trim() !== '');
        
        text += rowValues.join(' | ') + '\n';
      });
      
      return text.trim();
    } catch (error) {
      console.error('Error converting CSV to text:', error);
      return 'Error processing CSV data';
    }
  }

  /**
   * Get CSV metadata without processing the full content
   * @param buffer - CSV file content as buffer
   * @returns Promise<{ headers: string[], totalRows: number }> - CSV metadata
   */
  public static async getCsvMetadata(buffer: Buffer): Promise<{ headers: string[], totalRows: number }> {
    try {
      const csvString = buffer.toString('utf8');
      
      // Parse just the first few lines to get headers and estimate row count
      const lines = csvString.split('\n').filter(line => line.trim() !== '');
      const headers = lines.length > 0 ? Papa.parse(lines[0], { header: false }).data[0] as string[] : [];
      
      // Count non-empty lines (excluding header)
      const totalRows = Math.max(0, lines.length - 1);
      
      return {
        headers: headers.map(h => h.trim()),
        totalRows
      };
    } catch (error) {
      console.error('Error getting CSV metadata:', error);
      return { headers: [], totalRows: 0 };
    }
  }
}

export default CsvProcessorService;
