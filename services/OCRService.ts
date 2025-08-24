// Note: These imports will be available after proper native module setup
// For now, we'll create a mock implementation that can be replaced later

export interface OCRResult {
  text: string;
  confidence: number;
  method: 'mlkit' | 'tesseract' | 'online';
}

export class OCRService {
  /**
   * Extract text from image using ML Kit (primary method)
   * TODO: Implement after native module setup
   */
  static async extractTextWithMLKit(imageUri: string): Promise<OCRResult> {
    try {
      // Mock implementation - replace with actual ML Kit when available
      throw new Error('ML Kit not yet configured - use online OCR instead');
    } catch (error) {
      console.error('ML Kit OCR failed:', error);
      throw error;
    }
  }

  /**
   * Extract text from image using Tesseract (fallback method)
   * TODO: Implement after native module setup
   */
  static async extractTextWithTesseract(imageUri: string): Promise<OCRResult> {
    try {
      // Mock implementation - replace with actual Tesseract when available
      throw new Error('Tesseract not yet configured - use online OCR instead');
    } catch (error) {
      console.error('Tesseract OCR failed:', error);
      throw error;
    }
  }

  /**
   * Extract text from image with automatic fallback
   * Tries ML Kit first, falls back to Tesseract if needed
   */
  static async extractText(imageUri: string): Promise<OCRResult> {
    try {
      // Try ML Kit first (faster and more accurate)
      return await this.extractTextWithMLKit(imageUri);
    } catch (mlkitError) {
      console.warn('ML Kit failed, trying Tesseract fallback:', mlkitError);
      
      try {
        // Fallback to Tesseract
        return await this.extractTextWithTesseract(imageUri);
      } catch (tesseractError) {
        console.error('Both OCR methods failed:', { mlkitError, tesseractError });
        throw new Error('OCR extraction failed with both ML Kit and Tesseract');
      }
    }
  }

  /**
   * Process document pages and extract text from all
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
        // Continue with other pages even if one fails
      }
    }
    
    return results.join('\n\n');
  }

  /**
   * Clean and prepare extracted text for quiz generation
   */
  static cleanExtractedText(text: string): string {
    return text
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .replace(/\n\s*\n/g, '\n') // Remove empty lines
      .trim();
  }
}
