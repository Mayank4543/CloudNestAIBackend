import axios from 'axios';

/**
 * Interface for AI tagging response
 */
export interface AITaggingResult {
    success: boolean;
    tags: string[];
    error?: string;
}

/**
 * Interface for AI summary response
 */
export interface AISummaryResult {
    success: boolean;
    summary: string;
    error?: string;
}

/**
 * AI Service for auto-tagging files using free LLM APIs
 */
export class AIService {
    private static readonly OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
    private static readonly MAX_TEXT_LENGTH = 1500; // Limit text sent to API
    private static readonly MAX_TAGS = 7;
    private static readonly MIN_TAGS = 5;

    /**
     * Generate a comprehensive summary for file content using AI
     * @param textContent - Extracted text content from file
     * @param filename - Original filename for context
     * @returns Promise<AISummaryResult> - Generated summary or error
     */
    public static async generateSummary(textContent: string, filename: string): Promise<AISummaryResult> {
        try {
            // Check if API key is configured
            const apiKey = process.env.OPENROUTER_API_KEY;
            if (!apiKey) {
                console.warn('OpenRouter API key not configured, skipping AI summary generation');
                return {
                    success: false,
                    summary: '',
                    error: 'API key not configured'
                };
            }

            // Truncate text to avoid API limits
            const truncatedText = this.truncateTextForSummary(textContent);

            // Create the summary prompt
            const prompt = this.createSummaryPrompt(truncatedText, filename);

            // Call the AI API for summary
            const response = await this.callOpenRouterAPIForSummary(prompt, apiKey);

            // Clean and validate summary
            const summary = this.cleanAndValidateSummary(response);

            return {
                success: true,
                summary
            };

        } catch (error) {
            console.error('Error generating AI summary:', error);
            return {
                success: false,
                summary: '',
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
    /**
     * Generate tags for file content using AI
     * @param textContent - Extracted text content from file
     * @param filename - Original filename for context
     * @returns Promise<AITaggingResult> - Generated tags or error
     */
    public static async generateTags(textContent: string, filename: string): Promise<AITaggingResult> {
        try {
            // Check if API key is configured
            const apiKey = process.env.OPENROUTER_API_KEY;
            if (!apiKey) {
                console.warn('OpenRouter API key not configured, skipping AI tagging');
                return {
                    success: false,
                    tags: [],
                    error: 'API key not configured'
                };
            }

            // Truncate text to avoid API limits
            const truncatedText = this.truncateText(textContent);

            // Create the prompt
            const prompt = this.createTaggingPrompt(truncatedText, filename);

            // Call the AI API
            const response = await this.callOpenRouterAPI(prompt, apiKey);

            // Parse and validate tags
            const tags = this.parseAndValidateTags(response);

            return {
                success: true,
                tags
            };

        } catch (error) {
            console.error('Error generating AI tags:', error);
            return {
                success: false,
                tags: [],
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    /**
     * Call OpenRouter API for summary generation
     * @param prompt - The summary prompt to send to the AI
     * @param apiKey - OpenRouter API key
     * @returns Promise<string> - AI response
     */
    private static async callOpenRouterAPIForSummary(prompt: string, apiKey: string): Promise<string> {
        try {
            // Use a better model for summary generation (still free)
            const model = 'mistralai/mistral-7b-instruct'; // Free model with good comprehension

            const response = await axios.post(
                this.OPENROUTER_API_URL,
                {
                    model: model,
                    messages: [
                        {
                            role: 'system',
                            content: 'You are a helpful assistant that creates comprehensive, well-structured summaries of documents. Provide detailed summaries with proper paragraphs, highlighting key points, main ideas, and important details. Write in a professional and clear manner.'
                        },
                        {
                            role: 'user',
                            content: prompt
                        }
                    ],
                    max_tokens: 1000, // Allow more tokens for comprehensive summaries
                    temperature: 0.4, // Slightly higher for more natural language
                    top_p: 0.9
                },
                {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json',
                        'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
                        'X-Title': 'CloudNest AI Summary Generation'
                    },
                    timeout: 60000 // 60 second timeout for longer summaries
                }
            );

            if (response.data && response.data.choices && response.data.choices[0]) {
                return response.data.choices[0].message.content.trim();
            } else {
                throw new Error('Invalid response from OpenRouter API');
            }

        } catch (error) {
            if (axios.isAxiosError(error)) {
                if (error.response?.status === 401) {
                    throw new Error('Invalid API key');
                } else if (error.response?.status === 429) {
                    throw new Error('Rate limit exceeded');
                } else if (error.response?.data?.error) {
                    throw new Error(`API Error: ${error.response.data.error.message}`);
                }
            }
            throw error;
        }
    }

    /**
     * Call OpenRouter API with the tagging prompt
     * @param prompt - The prompt to send to the AI
     * @param apiKey - OpenRouter API key
     * @returns Promise<string> - AI response
     */
    private static async callOpenRouterAPI(prompt: string, apiKey: string): Promise<string> {
        try {
            // Use a free model - you can change this to other free models
            const model = 'mistralai/mistral-7b-instruct'; // Free model

            const response = await axios.post(
                this.OPENROUTER_API_URL,
                {
                    model: model,
                    messages: [
                        {
                            role: 'system',
                            content: 'You are a helpful assistant that generates concise, relevant tags for documents. Always respond with only the tags, one per line, no explanations.'
                        },
                        {
                            role: 'user',
                            content: prompt
                        }
                    ],
                    max_tokens: 200,
                    temperature: 0.3, // Lower temperature for more consistent results
                    top_p: 0.9
                },
                {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json',
                        'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
                        'X-Title': 'CloudNest AI Tagging'
                    },
                    timeout: 30000 // 30 second timeout
                }
            );

            if (response.data && response.data.choices && response.data.choices[0]) {
                return response.data.choices[0].message.content.trim();
            } else {
                throw new Error('Invalid response from OpenRouter API');
            }

        } catch (error) {
            if (axios.isAxiosError(error)) {
                if (error.response?.status === 401) {
                    throw new Error('Invalid API key');
                } else if (error.response?.status === 429) {
                    throw new Error('Rate limit exceeded');
                } else if (error.response?.data?.error) {
                    throw new Error(`API Error: ${error.response.data.error.message}`);
                }
            }
            throw error;
        }
    }

    /**
     * Create the summary prompt for comprehensive document analysis
     * @param textContent - Truncated text content
     * @param filename - Original filename
     * @returns string - Formatted summary prompt
     */
    private static createSummaryPrompt(textContent: string, filename: string): string {
        return `Please provide a comprehensive and well-structured summary of the following document. The summary should be organized into clear paragraphs and include:

Document Overview: Brief introduction of what this document is about
Main Content: Key points, important findings, and primary topics covered  
Key Details: Specific information, data, statistics, or important facts mentioned
Conclusions: Any conclusions, recommendations, or final thoughts presented

Requirements:
- Write in professional, clear language
- Use proper paragraph structure
- Aim for 250-400 words for adequate detail
- Focus on the most important and relevant information
- Maintain objectivity and accuracy

Document: ${filename}
Content: ${textContent}

Summary:`;
    }

    /**
     * Create the tagging prompt
     * @param textContent - Truncated text content
     * @param filename - Original filename
     * @returns string - Formatted prompt
     */
    private static createTaggingPrompt(textContent: string, filename: string): string {
        return `Generate ${this.MIN_TAGS}-${this.MAX_TAGS} short descriptive tags for the following document content. 

Requirements:
- Tags should be lowercase
- Use hyphens for multi-word concepts (e.g., "machine-learning", "data-analysis")
- No spaces unless single words
- No special characters except hyphens
- Each tag should be 1-3 words maximum
- Tags should be relevant and descriptive of the content
- Respond with only the tags, one per line

Document: ${filename}
Content: ${textContent}

Tags:`;
    }

    /**
     * Truncate text to fit API limits for summary generation
     * @param text - Original text content
     * @returns string - Truncated text
     */
    private static truncateTextForSummary(text: string): string {
        const MAX_SUMMARY_TEXT_LENGTH = 6000; // Allow more text for better summaries
        
        if (text.length <= MAX_SUMMARY_TEXT_LENGTH) {
            return text;
        }

        // Try to truncate at a sentence boundary for better context
        const truncated = text.substring(0, MAX_SUMMARY_TEXT_LENGTH);
        const lastSentence = Math.max(
            truncated.lastIndexOf('.'),
            truncated.lastIndexOf('!'),
            truncated.lastIndexOf('?')
        );

        if (lastSentence > MAX_SUMMARY_TEXT_LENGTH * 0.7) {
            return truncated.substring(0, lastSentence + 1);
        }

        // If no good sentence boundary, try word boundary
        const lastSpace = truncated.lastIndexOf(' ');
        if (lastSpace > MAX_SUMMARY_TEXT_LENGTH * 0.8) {
            return truncated.substring(0, lastSpace) + '...';
        }

        return truncated + '...';
    }

    /**
     * Truncate text to fit API limits
     * @param text - Original text content
     * @returns string - Truncated text
     */
    private static truncateText(text: string): string {
        if (text.length <= this.MAX_TEXT_LENGTH) {
            return text;
        }

        // Try to truncate at a word boundary
        const truncated = text.substring(0, this.MAX_TEXT_LENGTH);
        const lastSpace = truncated.lastIndexOf(' ');

        if (lastSpace > this.MAX_TEXT_LENGTH * 0.8) {
            return truncated.substring(0, lastSpace) + '...';
        }

        return truncated + '...';
    }

    /**
     * Clean and validate the generated summary
     * @param aiResponse - Raw response from AI
     * @returns string - Cleaned and validated summary
     */
    private static cleanAndValidateSummary(aiResponse: string): string {
        try {
            // Clean up the response
            let summary = aiResponse
                .trim()
                // Remove any leftover prompt text
                .replace(/^(Summary:|Please provide|Generate|Create).*?:/i, '')
                // Remove excessive whitespace
                .replace(/\s{2,}/g, ' ')
                // Normalize line breaks
                .replace(/\n{3,}/g, '\n\n')
                // Remove leading/trailing quotes if present
                .replace(/^["']+|["']+$/g, '')
                .trim();

            // Ensure we have a meaningful summary
            if (summary.length < 50) {
                return 'Unable to generate a comprehensive summary for this document.';
            }

            // Limit summary length to reasonable size (one page equivalent)
            const MAX_SUMMARY_LENGTH = 2000;
            if (summary.length > MAX_SUMMARY_LENGTH) {
                // Try to truncate at sentence boundary
                const truncated = summary.substring(0, MAX_SUMMARY_LENGTH);
                const lastSentence = Math.max(
                    truncated.lastIndexOf('.'),
                    truncated.lastIndexOf('!'),
                    truncated.lastIndexOf('?')
                );

                if (lastSentence > MAX_SUMMARY_LENGTH * 0.8) {
                    summary = truncated.substring(0, lastSentence + 1);
                } else {
                    summary = truncated + '...';
                }
            }

            return summary;

        } catch (error) {
            console.error('Error cleaning summary:', error);
            return 'Summary generation completed but formatting failed.';
        }
    }
    /**
     * Parse and validate tags from AI response
     * @param aiResponse - Raw response from AI
     * @returns string[] - Cleaned and validated tags
     */
    private static parseAndValidateTags(aiResponse: string): string[] {
        try {
            // Split by lines and clean up
            const lines = aiResponse.split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0)
                .map(line => {
                    // Remove common prefixes like "1.", "2.", "-", "*"
                    return line.replace(/^[\d\-*\.\s]+/, '').trim();
                })
                .filter(line => line.length > 0);

            // Clean and validate each tag
            const validTags = lines
                .map(tag => this.cleanTag(tag))
                .filter(tag => tag.length > 0 && tag.length <= 50) // Reasonable tag length
                .slice(0, this.MAX_TAGS); // Limit to max tags

            // Ensure we have minimum number of tags
            if (validTags.length < this.MIN_TAGS) {
                console.warn(`Generated only ${validTags.length} tags, expected ${this.MIN_TAGS}-${this.MAX_TAGS}`);
            }

            return validTags;

        } catch (error) {
            console.error('Error parsing AI tags:', error);
            return [];
        }
    }

    /**
     * Clean and format a single tag
     * @param tag - Raw tag from AI
     * @returns string - Cleaned tag
     */
    private static cleanTag(tag: string): string {
        return tag
            .toLowerCase()
            .trim()
            // Replace spaces with hyphens for multi-word concepts
            .replace(/\s+/g, '-')
            // Remove special characters except hyphens and alphanumeric
            .replace(/[^a-z0-9\-]/g, '')
            // Remove multiple consecutive hyphens
            .replace(/-+/g, '-')
            // Remove leading/trailing hyphens
            .replace(/^-+|-+$/g, '');
    }

    /**
     * Get alternative free models available
     * @returns string[] - List of free model names
     */
    public static getAvailableModels(): string[] {
        return [
            'mistralai/mistral-7b-instruct', // Free
            'meta-llama/llama-3-8b-instruct', // Free
            'google/gemma-2-9b-it', // Free
            'microsoft/phi-3-mini-4k-instruct', // Free
            'huggingfaceh4/zephyr-7b-beta' // Free
        ];
    }

    /**
     * Test the AI summary service with a sample text
     * @param sampleText - Text to test with
     * @returns Promise<AISummaryResult> - Test result
     */
    public static async testSummary(sampleText: string): Promise<AISummaryResult> {
        return this.generateSummary(sampleText, 'test-document.txt');
    }

    /**
     * Test the AI service with a sample text
     * @param sampleText - Text to test with
     * @returns Promise<AITaggingResult> - Test result
     */
    public static async testTagging(sampleText: string): Promise<AITaggingResult> {
        return this.generateTags(sampleText, 'test-document.txt');
    }
}

export default AIService;
