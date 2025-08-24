import { getAPIConfig } from '@/config/apiConfig';

export interface MistralVisionResponse {
  id: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class MistralOCRService {
  private static lastRequestTime = 0;
  private static readonly MIN_REQUEST_INTERVAL = 5000; // 5 seconds between requests
  private static readonly MAX_RETRIES = 3;
  private static readonly BASE_DELAY = 2000; // Base delay for exponential backoff
  private static requestQueue: Array<() => Promise<any>> = [];
  private static isProcessingQueue = false;

  /**
   * Extract text from image using Mistral Vision API with enhanced rate limiting and retry logic
   */
  static async extractTextFromImage(imageUri: string): Promise<string> {
    return this.executeWithRetry(() => this.performOCR(imageUri));
  }

  /**
   * Execute OCR with exponential backoff retry logic
   */
  private static async executeWithRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < this.MAX_RETRIES; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        // Check if it's a rate limit error (429)
        if (error && typeof error === 'object' && 'message' in error) {
          const errorMessage = (error as Error).message;
          
          if (errorMessage.includes('429') && attempt < this.MAX_RETRIES - 1) {
            const delay = this.BASE_DELAY * Math.pow(2, attempt); // Exponential backoff
            console.log(`⏳ Rate limited (429). Retrying in ${delay}ms (attempt ${attempt + 1}/${this.MAX_RETRIES})`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        }
        
        // For non-429 errors, don't retry
        if (attempt === 0 && !lastError?.message.includes('429')) {
          throw error;
        }
      }
    }
    
    // If all retries failed, throw the last error
    throw lastError || new Error('OCR failed after all retries');
  }

  /**
   * Perform the actual OCR operation
   */
  private static async performOCR(imageUri: string): Promise<string> {
    const config = getAPIConfig();
    
    if (!config.mistral.apiKey) {
      throw new Error('Mistral API key not configured. Please add your API key to the .env file.');
    }

    // Enhanced rate limiting - wait if needed
    await this.enforceRateLimit();

    console.log('🔍 Starting Mistral OCR for image:', imageUri.substring(0, 50) + '...');

    try {
      // Convert image to base64
      const response = await fetch(imageUri);
      const blob = await response.blob();
      const base64 = await this.blobToBase64(blob);
      
      console.log('📷 Image converted to base64, size:', base64.length);

      const mistralResponse = await fetch(`${config.mistral.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.mistral.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'pixtral-12b-2409',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Extract all text from this image. Return only the extracted text without any additional commentary or formatting. If the image contains a document, extract all readable text maintaining the original structure as much as possible.'
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:image/jpeg;base64,${base64}`
                  }
                }
              ]
            }
          ],
          max_tokens: 4000,
          temperature: 0.1,
        }),
      });

      console.log('📡 Mistral OCR response status:', mistralResponse.status);

      if (!mistralResponse.ok) {
        const errorText = await mistralResponse.text().catch(() => 'Unable to read error response');
        console.log('❌ Mistral OCR error response:', errorText);
        
        // Enhanced error handling for rate limits
        if (mistralResponse.status === 429) {
          const retryAfter = mistralResponse.headers.get('retry-after');
          const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 5000;
          console.log(`🚫 Rate limited by Mistral API. Retry after: ${waitTime}ms`);
          throw new Error(`Mistral API rate limit: 429. Retry after ${waitTime}ms`);
        }
        
        throw new Error(`Mistral OCR API error: ${mistralResponse.status} ${mistralResponse.statusText}. ${errorText}`);
      }

      const data: MistralVisionResponse = await mistralResponse.json();
      const extractedText = data.choices[0]?.message?.content || '';
      
      console.log('✅ Mistral OCR completed, extracted text length:', extractedText.length);
      console.log('📝 OCR preview:', extractedText.substring(0, 200) + '...');
      
      return extractedText;
    } catch (error) {
      console.error('🚫 Mistral OCR failed:', error);
      throw error;
    }
  }

  /**
   * Enforce rate limiting with enhanced delays
   */
  private static async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.MIN_REQUEST_INTERVAL) {
      const waitTime = this.MIN_REQUEST_INTERVAL - timeSinceLastRequest;
      console.log(`⏳ Enhanced rate limiting: waiting ${waitTime}ms before Mistral OCR request`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
  }

  /**
   * Process multiple images with queue-based rate limiting
   */
  static async extractTextFromImages(
    imageUris: string[],
    onProgress?: (current: number, total: number, currentImage: string) => void
  ): Promise<string[]> {
    console.log(`🔄 Starting queued batch OCR for ${imageUris.length} images`);
    
    const results: string[] = [];
    
    for (let i = 0; i < imageUris.length; i++) {
      const imageUri = imageUris[i];
      
      if (onProgress) {
        onProgress(i + 1, imageUris.length, imageUri);
      }
      
      try {
        console.log(`📷 Processing image ${i + 1}/${imageUris.length}`);
        const result = await this.extractTextFromImage(imageUri);
        results.push(result);
        
        // Extra delay between batch items to prevent overwhelming API
        if (i < imageUris.length - 1) {
          console.log('⏳ Batch delay: waiting 3s before next image...');
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      } catch (error) {
        console.error(`❌ Failed to process image ${i + 1}:`, error);
        
        // Check if it's a persistent rate limit issue
        if (error && typeof error === 'object' && 'message' in error) {
          const errorMessage = (error as Error).message;
          if (errorMessage.includes('429')) {
            console.log('🚫 Persistent rate limiting detected. Consider switching to offline mode.');
          }
        }
        
        // Add empty result to maintain array consistency
        results.push('');
      }
    }
    
    console.log(`✅ Batch OCR completed: ${results.filter(r => r.length > 0).length}/${imageUris.length} successful`);
    return results;
  }

  /**
   * Check current rate limit status
   */
  static getRateLimitStatus(): {
    canMakeRequest: boolean;
    waitTimeMs: number;
    lastRequestTime: number;
  } {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    const canMakeRequest = timeSinceLastRequest >= this.MIN_REQUEST_INTERVAL;
    const waitTimeMs = canMakeRequest ? 0 : this.MIN_REQUEST_INTERVAL - timeSinceLastRequest;
    
    return {
      canMakeRequest,
      waitTimeMs,
      lastRequestTime: this.lastRequestTime,
    };
  }

  /**
   * Extract text from Word document using Mistral (placeholder - requires document parsing)
   */
  static async extractTextFromDocument(documentUri: string, mimeType: string): Promise<string> {
    console.log('📄 Mistral document OCR not yet implemented for:', mimeType);
    console.log('📄 Document URI:', documentUri);
    
    // For now, return a placeholder message
    // TODO: Implement document parsing with libraries like mammoth for .docx
    return `Document text extraction using Mistral OCR is not yet implemented for ${mimeType}. Please use image-based documents or implement document parsing.`;
  }

  /**
   * Convert blob to base64 string
   */
  private static blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Test Mistral Vision API connection
   */
  static async testConnection(): Promise<boolean> {
    try {
      const config = getAPIConfig();
      
      if (!config.mistral.apiKey) {
        console.log('❌ Mistral API key not configured');
        return false;
      }

      // Test with a simple API call
      const response = await fetch(`${config.mistral.baseUrl}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${config.mistral.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('🔍 Mistral API test response:', response.status);
      return response.ok;
    } catch (error) {
      console.error('🚫 Mistral connection test failed:', error);
      return false;
    }
  }
}
