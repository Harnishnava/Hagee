import TextRecognition from '@react-native-ml-kit/text-recognition';
import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';

export interface OfflineOCRResult {
  text: string;
  confidence: number;
  processingTime: number;
  blocks?: TextBlock[];
}

export interface TextBlock {
  text: string;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence: number;
}

/**
 * True offline OCR service using React Native ML Kit
 * Works entirely on-device without any internet connection
 */
export class OfflineOCRService {
  private static isInitialized = false;

  /**
   * Initialize the ML Kit text recognition service
   */
  static async initialize(): Promise<boolean> {
    try {
      if (this.isInitialized) return true;

      console.log('🔧 Initializing ML Kit Text Recognition...');
      
      // ML Kit doesn't require explicit initialization in React Native
      // The service is ready when the module is imported
      this.isInitialized = true;
      
      console.log('✅ ML Kit Text Recognition initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize ML Kit:', error);
      return false;
    }
  }

  /**
   * Extract text from image using device-only ML Kit OCR
   * NEVER touches the internet - works in airplane mode
   */
  static async extractTextFromImage(imageUri: string): Promise<OfflineOCRResult> {
    const startTime = Date.now();
    
    try {
      console.log('📱 Starting DEVICE-ONLY OCR for:', imageUri.substring(0, 50) + '...');
      
      // Ensure ML Kit is initialized
      const initialized = await this.initialize();
      if (!initialized) {
        throw new Error('ML Kit initialization failed');
      }

      // Validate image exists
      const fileInfo = await FileSystem.getInfoAsync(imageUri);
      if (!fileInfo.exists) {
        throw new Error(`Image file not found: ${imageUri}`);
      }

      console.log('📷 Processing image with ML Kit (100% offline)...');
      
      // Perform OCR using ML Kit - completely offline
      const result = await TextRecognition.recognize(imageUri);
      
      const processingTime = Date.now() - startTime;
      const extractedText = result.text || '';
      
      // Extract text blocks with bounding boxes if available
      const blocks: TextBlock[] = [];
      if (result.blocks) {
        for (const block of result.blocks) {
          blocks.push({
            text: block.text,
            boundingBox: {
              x: (block.frame as any)?.x || 0,
              y: (block.frame as any)?.y || 0,
              width: (block.frame as any)?.width || 0,
              height: (block.frame as any)?.height || 0,
            },
            confidence: (block as any).confidence || 0.5,
          });
        }
      }

      const confidence = this.calculateOverallConfidence(blocks);

      console.log('✅ Device OCR completed successfully');
      console.log(`📊 Results: ${extractedText.length} chars, ${blocks.length} blocks, ${processingTime}ms`);
      console.log('📝 Text preview:', extractedText.substring(0, 100) + '...');

      return {
        text: extractedText,
        confidence,
        processingTime,
        blocks,
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error('❌ Device OCR failed:', error);
      
      // Return empty result instead of throwing to allow graceful fallback
      return {
        text: '',
        confidence: 0,
        processingTime,
        blocks: [],
      };
    }
  }

  /**
   * Process multiple images in batch with progress tracking
   */
  static async extractTextFromImages(
    imageUris: string[],
    onProgress?: (current: number, total: number, currentImage: string) => void
  ): Promise<OfflineOCRResult[]> {
    console.log(`📱 Starting batch device OCR for ${imageUris.length} images`);
    
    const results: OfflineOCRResult[] = [];
    
    for (let i = 0; i < imageUris.length; i++) {
      const imageUri = imageUris[i];
      
      if (onProgress) {
        onProgress(i + 1, imageUris.length, imageUri);
      }
      
      try {
        const result = await this.extractTextFromImage(imageUri);
        results.push(result);
        
        // Small delay between images to prevent overwhelming the device
        if (i < imageUris.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        console.error(`❌ Failed to process image ${i + 1}:`, error);
        // Add empty result to maintain array consistency
        results.push({
          text: '',
          confidence: 0,
          processingTime: 0,
          blocks: [],
        });
      }
    }
    
    console.log(`✅ Batch device OCR completed: ${results.length} images processed`);
    return results;
  }

  /**
   * Check if device OCR is available on this platform
   */
  static async isAvailable(): Promise<boolean> {
    try {
      // ML Kit is available on both iOS and Android
      if (Platform.OS === 'ios' || Platform.OS === 'android') {
        return await this.initialize();
      }
      
      console.log('⚠️ Device OCR not available on platform:', Platform.OS);
      return false;
    } catch (error) {
      console.error('❌ Device OCR availability check failed:', error);
      return false;
    }
  }

  /**
   * Get device OCR capabilities and performance info
   */
  static async getCapabilities(): Promise<{
    isAvailable: boolean;
    platform: string;
    supportsMultipleLanguages: boolean;
    estimatedSpeed: string;
  }> {
    const isAvailable = await this.isAvailable();
    
    return {
      isAvailable,
      platform: Platform.OS,
      supportsMultipleLanguages: true, // ML Kit supports 100+ languages
      estimatedSpeed: Platform.OS === 'ios' ? 'Fast' : 'Medium',
    };
  }

  /**
   * Test device OCR with a simple validation
   */
  static async testOCR(): Promise<{
    success: boolean;
    message: string;
    processingTime?: number;
  }> {
    try {
      console.log('🧪 Testing device OCR functionality...');
      
      const available = await this.isAvailable();
      if (!available) {
        return {
          success: false,
          message: 'Device OCR not available on this platform',
        };
      }

      // Note: We can't test with a real image here without one
      // This test just verifies the service is properly initialized
      return {
        success: true,
        message: 'Device OCR is ready and available',
        processingTime: 0,
      };
    } catch (error) {
      return {
        success: false,
        message: `Device OCR test failed: ${error}`,
      };
    }
  }

  /**
   * Calculate overall confidence from text blocks
   */
  private static calculateOverallConfidence(blocks: TextBlock[]): number {
    if (blocks.length === 0) return 0.5; // Default confidence
    
    const totalConfidence = blocks.reduce((sum, block) => sum + block.confidence, 0);
    return totalConfidence / blocks.length;
  }

  /**
   * Clean and format extracted text
   */
  static cleanExtractedText(text: string): string {
    return text
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .replace(/\n\s*\n/g, '\n') // Remove empty lines
      .trim();
  }

  /**
   * Get processing recommendations based on image characteristics
   */
  static getProcessingRecommendations(imageUri: string): {
    shouldPreprocess: boolean;
    recommendations: string[];
  } {
    const recommendations: string[] = [];
    let shouldPreprocess = false;

    // Basic recommendations - could be enhanced with actual image analysis
    recommendations.push('Ensure good lighting and contrast');
    recommendations.push('Keep text horizontal and unrotated');
    recommendations.push('Avoid blurry or low-resolution images');

    return {
      shouldPreprocess,
      recommendations,
    };
  }
}
