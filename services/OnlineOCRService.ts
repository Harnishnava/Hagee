import { getAPIConfig } from '@/config/apiConfig';

export interface OnlineOCRResult {
  text: string;
  confidence: number;
  method: 'mistral' | 'openai';
}

export class OnlineOCRService {
  /**
   * Extract text from image using Mistral AI Vision
   */
  static async extractTextWithMistral(imageUri: string): Promise<OnlineOCRResult> {
    const config = getAPIConfig();
    
    if (!config.mistral.apiKey) {
      throw new Error('Mistral API key not configured');
    }

    try {
      // Convert image to base64
      const base64Image = await this.imageToBase64(imageUri);
      
      const response = await fetch(`${config.mistral.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.mistral.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'mistral-large-latest', // Use Mistral's vision model
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Extract all text from this image. Return only the extracted text, no additional commentary or formatting.'
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:image/jpeg;base64,${base64Image}`
                  }
                }
              ]
            }
          ],
          max_tokens: 4000,
          temperature: 0.1
        })
      });

      if (!response.ok) {
        throw new Error(`Mistral API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const extractedText = data.choices[0]?.message?.content || '';

      return {
        text: extractedText,
        confidence: 0.95, // Mistral vision models are generally very accurate
        method: 'mistral',
      };
    } catch (error) {
      console.error('Mistral OCR failed:', error);
      throw error;
    }
  }

  /**
   * Extract text from image using OpenAI Vision (fallback)
   */
  static async extractTextWithOpenAI(imageUri: string): Promise<OnlineOCRResult> {
    const config = getAPIConfig();
    
    if (!config.openai?.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      const base64Image = await this.imageToBase64(imageUri);
      
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.openai.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4-vision-preview',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Extract all text from this image. Return only the extracted text, no additional commentary.'
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:image/jpeg;base64,${base64Image}`
                  }
                }
              ]
            }
          ],
          max_tokens: 4000,
          temperature: 0.1
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const extractedText = data.choices[0]?.message?.content || '';

      return {
        text: extractedText,
        confidence: 0.9,
        method: 'openai',
      };
    } catch (error) {
      console.error('OpenAI OCR failed:', error);
      throw error;
    }
  }

  /**
   * Extract text from image with fallback between services
   */
  static async extractText(imageUri: string): Promise<OnlineOCRResult> {
    const config = getAPIConfig();
    
    // Only try Mistral if API key is available
    if (config.mistral.apiKey) {
      try {
        return await this.extractTextWithMistral(imageUri);
      } catch (error) {
        console.error('Mistral OCR failed:', error);
        
        // If Mistral fails and OpenAI key is available, try OpenAI
        if (config.openai?.apiKey) {
          console.warn('Mistral OCR failed, trying OpenAI fallback:', error);
          try {
            return await this.extractTextWithOpenAI(imageUri);
          } catch (openaiError) {
            console.error('OpenAI OCR failed:', openaiError);
            throw new Error(`Both OCR services failed. Mistral: ${(error as Error).message}, OpenAI: ${(openaiError as Error).message}`);
          }
        } else {
          throw new Error(`Mistral OCR failed: ${(error as Error).message}. No OpenAI API key configured for fallback.`);
        }
      }
    } else if (config.openai?.apiKey) {
      // Only OpenAI available
      try {
        return await this.extractTextWithOpenAI(imageUri);
      } catch (error) {
        throw new Error(`OpenAI OCR failed: ${(error as Error).message}`);
      }
    } else {
      throw new Error('No OCR API keys configured. Please add Mistral or OpenAI API key to .env file.');
    }
  }

  /**
   * Process multiple document pages
   */
  static async processDocument(imageUris: string[]): Promise<string> {
    const results: string[] = [];
    
    for (const uri of imageUris) {
      try {
        const ocrResult = await this.extractText(uri);
        if (ocrResult.text.trim()) {
          results.push(ocrResult.text);
        }
      } catch (error) {
        console.error(`Failed to process page: ${uri}`, error);
      }
    }
    
    return results.join('\n\n');
  }

  /**
   * Convert image URI to base64
   */
  private static async imageToBase64(imageUri: string): Promise<string> {
    try {
      const response = await fetch(imageUri);
      const blob = await response.blob();
      
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      throw new Error(`Failed to convert image to base64: ${error}`);
    }
  }
}
