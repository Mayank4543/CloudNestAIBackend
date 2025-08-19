import { AIService } from '../utils/ai';
import axios from 'axios';
import * as Tesseract from 'tesseract.js';
import fs from 'fs';

/**
 * Interface for sensitive data scanning result
 */
export interface SensitiveDataScanResult {
    success: boolean;
    containsSensitiveData: boolean;
    sensitiveDataTypes: string[];
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    confidence: number; // 0-1 scale
    details: string[];
    error?: string;
}

/**
 * Service for scanning files for sensitive information using AI
 */
export class SensitiveDataScanService {

    private static readonly SENSITIVE_PATTERNS = {
        // Credit Card Numbers (Luhn algorithm pattern)
        creditCard: /\b(?:\d{4}[\s-]?){3}\d{4}\b/g,

        // Social Security Numbers (US format)
        ssn: /\b\d{3}-?\d{2}-?\d{4}\b/g,

        // Phone Numbers (various formats)
        phone: /\b(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/g,

        // Email addresses
        email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,

        // Passport numbers (basic pattern)
        passport: /\b[A-Z]{1,2}[0-9]{6,9}\b/g,

        // Driver's License (varies by state, basic pattern)
        driversLicense: /\b[A-Z]{1,2}[0-9]{5,8}\b/g,

        // Bank Account Numbers (basic pattern)
        bankAccount: /\b[0-9]{8,17}\b/g,

        // IP Addresses
        ipAddress: /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g,

        // API Keys (basic pattern for common formats)
        apiKey: /\b[A-Za-z0-9]{32,}\b/g,

        // Password-like strings
        password: /(?:password|pwd|pass|secret|key)\s*[:=]\s*[\w@#$%^&*!]{6,}/gi
    };

    private static readonly SENSITIVE_KEYWORDS = [
        // Personal Information
        'social security', 'ssn', 'passport', 'driver license', 'drivers license',
        'birth date', 'date of birth', 'dob', 'mother maiden name',

        // Financial Information
        'credit card', 'debit card', 'bank account', 'routing number', 'iban',
        'account number', 'card number', 'cvv', 'cvc', 'pin code',
        'salary', 'income', 'tax return', 'w2', 'w-2', '1099',

        // Authentication & Security
        'password', 'username', 'login', 'credentials', 'api key', 'secret key',
        'access token', 'auth token', 'private key', 'public key',

        // Medical Information
        'medical record', 'patient id', 'insurance number', 'medicare',
        'medicaid', 'prescription', 'diagnosis', 'health insurance',

        // Legal Information
        'confidential', 'attorney-client', 'privileged', 'legal advice',
        'contract terms', 'non-disclosure', 'nda'
    ];

    /**
     * Extract text from image using OCR (Tesseract.js)
     * @param imagePath - Path to the image file
     * @param imageBuffer - Buffer containing image data (alternative to imagePath)
     * @returns Promise<string> - Extracted text content
     */
    public static async extractTextFromImage(imagePath?: string, imageBuffer?: Buffer): Promise<string> {
        try {
            const source = imagePath || imageBuffer;

            if (!source) {
                throw new Error('Either imagePath or imageBuffer must be provided');
            }

            console.log('Starting OCR text extraction...');

            const { data: { text } } = await Tesseract.recognize(
                source,
                'eng',
                {
                    logger: m => {
                        if (m.status === 'recognizing text') {
                            console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
                        }
                    }
                }
            );

            console.log(`OCR completed. Extracted ${text.length} characters.`);
            return text.trim();

        } catch (error) {
            console.error('Error extracting text from image:', error);
            throw new Error(`OCR failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Scan file for sensitive data with support for images (OCR)
     * @param filePath - Path to the file
     * @param fileBuffer - Buffer containing file data
     * @param filename - Original filename for context
     * @param mimetype - MIME type of the file
     * @returns Promise<SensitiveDataScanResult> - Scan result
     */
    public static async scanFileForSensitiveData(
        filePath: string | undefined,
        fileBuffer: Buffer | undefined,
        filename: string,
        mimetype: string
    ): Promise<SensitiveDataScanResult> {
        try {
            let textContent = '';

            // Check if it's an image file
            if (mimetype.includes('image/')) {
                console.log(`Processing image file: ${filename}`);
                try {
                    if (fileBuffer) {
                        textContent = await this.extractTextFromImage(undefined, fileBuffer);
                    } else if (filePath) {
                        textContent = await this.extractTextFromImage(filePath);
                    } else {
                        return {
                            success: false,
                            containsSensitiveData: false,
                            sensitiveDataTypes: [],
                            riskLevel: 'LOW',
                            confidence: 0,
                            details: [],
                            error: 'No file path or buffer provided for image processing'
                        };
                    }
                } catch (ocrError) {
                    console.error('OCR failed:', ocrError);
                    // Fallback to basic scan with filename only
                    textContent = filename;
                }
            } else if (mimetype.includes('text/') || mimetype.includes('application/json')) {
                // For text files, read content directly
                if (filePath && fs.existsSync(filePath)) {
                    textContent = fs.readFileSync(filePath, 'utf8');
                } else if (fileBuffer) {
                    textContent = fileBuffer.toString('utf8');
                } else {
                    textContent = filename; // Fallback to filename
                }
            } else {
                // For other file types, use filename as fallback
                textContent = filename;
            }

            if (!textContent || textContent.trim().length === 0) {
                textContent = filename; // Final fallback
            }

            // Now scan the extracted text
            return await this.scanForSensitiveData(textContent, filename);

        } catch (error) {
            console.error('Error in scanFileForSensitiveData:', error);
            return {
                success: false,
                containsSensitiveData: false,
                sensitiveDataTypes: [],
                riskLevel: 'LOW',
                confidence: 0,
                details: [],
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    /**
     * Scan text content for sensitive information using both pattern matching and AI
     * @param textContent - Text content to scan
     * @param filename - Original filename for context
     * @returns Promise<SensitiveDataScanResult> - Scan result
     */
    public static async scanForSensitiveData(
        textContent: string,
        filename: string
    ): Promise<SensitiveDataScanResult> {
        try {
            // Step 1: Pattern-based detection
            const patternResults = this.scanWithPatterns(textContent);

            // Step 2: Keyword-based detection
            const keywordResults = this.scanWithKeywords(textContent);

            // Step 3: AI-based detection (if available)
            const aiResults = await this.scanWithAI(textContent, filename);

            // Combine results
            const combinedResults = this.combineResults(patternResults, keywordResults, aiResults);

            return combinedResults;

        } catch (error) {
            console.error('Error scanning for sensitive data:', error);
            return {
                success: false,
                containsSensitiveData: false,
                sensitiveDataTypes: [],
                riskLevel: 'LOW',
                confidence: 0,
                details: [],
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    /**
     * Scan using regex patterns
     */
    private static scanWithPatterns(textContent: string): Partial<SensitiveDataScanResult> {
        const detectedTypes: string[] = [];
        const details: string[] = [];

        for (const [type, pattern] of Object.entries(this.SENSITIVE_PATTERNS)) {
            const matches = textContent.match(pattern);
            if (matches && matches.length > 0) {
                detectedTypes.push(type);
                details.push(`Found ${matches.length} potential ${type.replace(/([A-Z])/g, ' $1').toLowerCase().trim()} pattern(s)`);
            }
        }

        return {
            sensitiveDataTypes: detectedTypes,
            details,
            containsSensitiveData: detectedTypes.length > 0
        };
    }

    /**
     * Scan using keyword detection
     */
    private static scanWithKeywords(textContent: string): Partial<SensitiveDataScanResult> {
        const lowercaseContent = textContent.toLowerCase();
        const detectedKeywords: string[] = [];

        for (const keyword of this.SENSITIVE_KEYWORDS) {
            if (lowercaseContent.includes(keyword.toLowerCase())) {
                detectedKeywords.push(keyword);
            }
        }

        const keywordDetails = detectedKeywords.length > 0
            ? [`Found ${detectedKeywords.length} sensitive keyword(s): ${detectedKeywords.slice(0, 3).join(', ')}${detectedKeywords.length > 3 ? '...' : ''}`]
            : [];

        return {
            sensitiveDataTypes: detectedKeywords.length > 0 ? ['sensitive-keywords'] : [],
            details: keywordDetails,
            containsSensitiveData: detectedKeywords.length > 0
        };
    }

    /**
     * Scan using AI analysis
     */
    private static async scanWithAI(textContent: string, filename: string): Promise<Partial<SensitiveDataScanResult>> {
        try {
            // Check if AI service is available
            const apiKey = process.env.OPENROUTER_API_KEY;
            if (!apiKey) {
                console.warn('OpenRouter API key not configured, skipping AI sensitive data scan');
                return {
                    sensitiveDataTypes: [],
                    details: [],
                    containsSensitiveData: false
                };
            }

            // Create AI prompt for sensitive data detection
            const prompt = this.createSensitiveDataPrompt(textContent, filename);

            // Call AI service
            const response = await this.callAIForSensitiveDataScan(prompt, apiKey);

            // Parse AI response
            return this.parseAIResponse(response);

        } catch (error) {
            console.error('Error in AI sensitive data scan:', error);
            return {
                sensitiveDataTypes: [],
                details: ['AI scan failed - using pattern matching only'],
                containsSensitiveData: false
            };
        }
    }

    /**
     * Create prompt for AI sensitive data detection
     */
    private static createSensitiveDataPrompt(textContent: string, filename: string): string {
        const truncatedText = textContent.substring(0, 2000); // Limit for AI processing

        return `Analyze the following document content for sensitive personal information that should not be shared publicly:

Filename: ${filename}

Content:
${truncatedText}

Please identify if this document contains any of the following types of sensitive information:
1. Personal identifiers (SSN, passport numbers, driver's license numbers)
2. Financial information (credit card numbers, bank accounts, financial statements)
3. Authentication credentials (passwords, API keys, access tokens)
4. Medical information (patient records, insurance numbers, medical diagnoses)
5. Legal/confidential information (attorney-client privileged, NDAs, contracts)
6. Contact information (personal addresses, private phone numbers, personal emails)

Respond with a JSON object in this exact format:
{
    "containsSensitiveData": true/false,
    "riskLevel": "LOW"/"MEDIUM"/"HIGH",
    "sensitiveTypes": ["type1", "type2"],
    "confidence": 0.8,
    "explanation": "Brief explanation of findings"
}

Focus on information that could pose privacy or security risks if shared publicly.`;
    }

    /**
     * Call AI service for sensitive data scanning
     */
    private static async callAIForSensitiveDataScan(prompt: string, apiKey: string): Promise<string> {

        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: 'mistralai/mistral-7b-instruct',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a privacy and security expert that identifies sensitive information in documents. Always respond with valid JSON only.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                max_tokens: 500,
                temperature: 0.1, // Low temperature for consistent results
                top_p: 0.9
            },
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
                    'X-Title': 'CloudNest AI Sensitive Data Scan'
                },
                timeout: 30000
            }
        );

        if (response.data && response.data.choices && response.data.choices[0]) {
            return response.data.choices[0].message.content.trim();
        } else {
            throw new Error('Invalid response from AI service');
        }
    }

    /**
     * Parse AI response for sensitive data detection
     */
    private static parseAIResponse(aiResponse: string): Partial<SensitiveDataScanResult> {
        try {
            // Try to extract JSON from the response
            const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('No JSON found in AI response');
            }

            const parsed = JSON.parse(jsonMatch[0]);

            return {
                sensitiveDataTypes: parsed.sensitiveTypes || [],
                details: [parsed.explanation || 'AI analysis completed'],
                containsSensitiveData: parsed.containsSensitiveData || false,
                riskLevel: parsed.riskLevel || 'LOW',
                confidence: parsed.confidence || 0.5
            };

        } catch (error) {
            console.error('Error parsing AI response:', error);

            // Fallback: simple keyword analysis of AI response
            const lowercaseResponse = aiResponse.toLowerCase();
            const containsSensitive = lowercaseResponse.includes('sensitive') ||
                lowercaseResponse.includes('personal') ||
                lowercaseResponse.includes('confidential') ||
                lowercaseResponse.includes('private');

            return {
                sensitiveDataTypes: containsSensitive ? ['ai-detected'] : [],
                details: ['AI analysis completed (fallback parsing)'],
                containsSensitiveData: containsSensitive,
                confidence: 0.3
            };
        }
    }

    /**
     * Combine results from different scanning methods
     */
    private static combineResults(
        patternResults: Partial<SensitiveDataScanResult>,
        keywordResults: Partial<SensitiveDataScanResult>,
        aiResults: Partial<SensitiveDataScanResult>
    ): SensitiveDataScanResult {

        // Combine all detected types
        const allTypes = [
            ...(patternResults.sensitiveDataTypes || []),
            ...(keywordResults.sensitiveDataTypes || []),
            ...(aiResults.sensitiveDataTypes || [])
        ];

        const uniqueTypes = [...new Set(allTypes)];

        // Combine all details
        const allDetails = [
            ...(patternResults.details || []),
            ...(keywordResults.details || []),
            ...(aiResults.details || [])
        ];

        // Determine overall risk level
        const hasPatterns = (patternResults.sensitiveDataTypes?.length || 0) > 0;
        const hasKeywords = (keywordResults.sensitiveDataTypes?.length || 0) > 0;
        const aiRisk = aiResults.riskLevel || 'LOW';
        const aiConfidence = aiResults.confidence || 0;

        let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
        let confidence: number;

        if (hasPatterns) {
            // Pattern matches are high confidence
            riskLevel = 'HIGH';
            confidence = 0.9;
        } else if (aiRisk === 'HIGH' && aiConfidence > 0.7) {
            riskLevel = 'HIGH';
            confidence = aiConfidence;
        } else if (aiRisk === 'MEDIUM' || hasKeywords) {
            riskLevel = 'MEDIUM';
            confidence = Math.max(0.6, aiConfidence);
        } else {
            riskLevel = 'LOW';
            confidence = Math.max(0.3, aiConfidence);
        }

        const containsSensitiveData = uniqueTypes.length > 0;

        return {
            success: true,
            containsSensitiveData,
            sensitiveDataTypes: uniqueTypes,
            riskLevel,
            confidence,
            details: allDetails
        };
    }

    /**
     * Quick scan for common sensitive patterns (for real-time use)
     */
    public static quickScanPatterns(textContent: string): boolean {
        for (const pattern of Object.values(this.SENSITIVE_PATTERNS)) {
            if (pattern.test(textContent)) {
                return true;
            }
        }

        const lowercaseContent = textContent.toLowerCase();
        const criticalKeywords = [
            'social security', 'credit card', 'password', 'ssn', 'bank account'
        ];

        return criticalKeywords.some(keyword => lowercaseContent.includes(keyword));
    }
}

export default SensitiveDataScanService;


