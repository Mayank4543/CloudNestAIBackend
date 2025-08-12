declare module 'mammoth' {
  export interface ConversionOptions {
    path?: string;
    buffer?: Buffer;
    arrayBuffer?: ArrayBuffer;
  }
  
  export interface ConversionResult {
    value: string;
    messages: any[];
  }

  /**
   * Extract raw text from a Word document.
   * @param options The options for extraction.
   * @returns A promise resolving to the extraction result.
   */
  export function extractRawText(options: ConversionOptions): Promise<ConversionResult>;
  
  /**
   * Convert a Word document to HTML.
   * @param options The options for conversion.
   * @returns A promise resolving to the conversion result.
   */
  export function convertToHtml(options: ConversionOptions): Promise<ConversionResult>;
}
