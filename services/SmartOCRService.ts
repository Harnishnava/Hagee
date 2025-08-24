import { MistralOCRService } from './MistralOCRService';
import { OnlineOCRService } from './OnlineOCRService';
import { OfflineOCRService } from './OfflineOCRService';

export interface OCRResult {
  text: string;
  source: 'mistral' | 'online' | 'offline';
  confidence: number;
  processingTime: number;
  fallbackUsed: boolean;
}

/**
 * Smart OCR service that automatically handles fallbacks and rate limiting
 */
export class SmartOCRService {
  private static consecutiveFailures = 0;
  private static readonly MAX_CONSECUTIVE_FAILURES = 2;
  private static isTemporarilyOffline = false;
  private static offlineUntil = 0;
  private static readonly OFFLINE_COOLDOWN = 5 * 60 * 1000; // 5 minutes

  /**
   * Extract text with smart fallback logic
   */
  static async extractTextFromImage(
    imageUri: string,
    preferredMode: 'online' | 'offline' | 'auto' = 'auto'
  ): Promise<OCRResult> {
    const startTime = Date.now();

    // Check if we're in temporary offline mode due to repeated failures
    if (this.isTemporarilyOffline && Date.now() < this.offlineUntil) {
      console.log('🔄 Using offline mode due to recent API failures');
      return this.performOfflineOCR(imageUri, startTime, true);
    }

    // Reset temporary offline mode if cooldown expired
    if (this.isTemporarilyOffline && Date.now() >= this.offlineUntil) {
      console.log('✅ API cooldown expired, re-enabling online OCR');
      this.isTemporarilyOffline = false;
      this.consecutiveFailures = 0;
    }

    // Handle explicit mode preferences
    if (preferredMode === 'offline') {
      return this.performOfflineOCR(imageUri, startTime, false);
    }

    if (preferredMode === 'online') {
      return this.performOnlineOCR(imageUri, startTime);
    }

    // Auto mode: try online first, fallback to offline on failure
    try {
      const result = await this.performOnlineOCR(imageUri, startTime);
      
      // Reset failure counter on success
      this.consecutiveFailures = 0;
      return result;
    } catch (error) {
      console.log('🔄 Online OCR failed, attempting offline fallback...');
      
      // Track consecutive failures
      this.consecutiveFailures++;
      
      // Check if we should enter temporary offline mode
      if (this.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) {
        console.log(`🚫 ${this.consecutiveFailures} consecutive API failures. Entering temporary offline mode for ${this.OFFLINE_COOLDOWN / 60000} minutes.`);
        this.isTemporarilyOffline = true;
        this.offlineUntil = Date.now() + this.OFFLINE_COOLDOWN;
      }

      // Attempt offline fallback
      try {
        return await this.performOfflineOCR(imageUri, startTime, true);
      } catch (offlineError) {
        console.error('❌ Both online and offline OCR failed:', offlineError);
        
        // Return error result instead of throwing
        return {
          text: `OCR processing failed for this image.

Online Error: ${error}
Offline Error: ${offlineError}

Suggestions:
1. Check your internet connection and API keys
2. Ensure the image is clear and contains readable text
3. Try again in a few minutes`,
          source: 'offline',
          confidence: 0,
          processingTime: Date.now() - startTime,
          fallbackUsed: true,
        };
      }
    }
  }

  /**
   * Perform online OCR with Mistral API
   */
  private static async performOnlineOCR(imageUri: string, startTime: number): Promise<OCRResult> {
    try {
      console.log('🌐 Attempting online OCR with Mistral...');
      const text = await MistralOCRService.extractTextFromImage(imageUri);
      
      return {
        text,
        source: 'mistral',
        confidence: 0.9, // High confidence for successful API calls
        processingTime: Date.now() - startTime,
        fallbackUsed: false,
      };
    } catch (error) {
      // Check if it's a rate limit error
      if (error && typeof error === 'object' && 'message' in error) {
        const errorMessage = (error as Error).message;
        if (errorMessage.includes('429')) {
          console.log('🚫 Mistral API rate limited, will try fallback');
        }
      }
      throw error;
    }
  }

  /**
   * Perform offline OCR with device ML Kit
   */
  private static async performOfflineOCR(
    imageUri: string, 
    startTime: number, 
    fallbackUsed: boolean
  ): Promise<OCRResult> {
    console.log('📱 Performing device-only OCR...');
    
    const result = await OfflineOCRService.extractTextFromImage(imageUri);
    
    return {
      text: result.text,
      source: 'offline',
      confidence: result.confidence,
      processingTime: Date.now() - startTime,
      fallbackUsed,
    };
  }

  /**
   * Process multiple images with smart fallback
   */
  static async extractTextFromImages(
    imageUris: string[],
    preferredMode: 'online' | 'offline' | 'auto' = 'auto',
    onProgress?: (current: number, total: number, result: OCRResult) => void
  ): Promise<OCRResult[]> {
    console.log(`🔄 Starting smart batch OCR for ${imageUris.length} images`);
    
    const results: OCRResult[] = [];
    let onlineFailures = 0;
    let offlineUsed = 0;

    for (let i = 0; i < imageUris.length; i++) {
      const imageUri = imageUris[i];
      
      try {
        console.log(`📷 Processing image ${i + 1}/${imageUris.length}`);
        const result = await this.extractTextFromImage(imageUri, preferredMode);
        results.push(result);

        // Track statistics
        if (result.source === 'offline') offlineUsed++;
        if (result.fallbackUsed) onlineFailures++;

        if (onProgress) {
          onProgress(i + 1, imageUris.length, result);
        }

        // Add delay between images to prevent overwhelming APIs
        if (i < imageUris.length - 1) {
          const delay = result.source === 'offline' ? 500 : 2000; // Shorter delay for offline
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      } catch (error) {
        console.error(`❌ Failed to process image ${i + 1}:`, error);
        
        // Add error result
        results.push({
          text: `Failed to process image ${i + 1}: ${error}`,
          source: 'offline',
          confidence: 0,
          processingTime: 0,
          fallbackUsed: true,
        });
      }
    }

    console.log(`✅ Smart batch OCR completed:`);
    console.log(`   📊 ${results.length} images processed`);
    console.log(`   🌐 ${results.length - offlineUsed} online OCR`);
    console.log(`   📱 ${offlineUsed} offline OCR`);
    console.log(`   🔄 ${onlineFailures} fallbacks used`);

    return results;
  }

  /**
   * Get current service status
   */
  static getStatus(): {
    isTemporarilyOffline: boolean;
    consecutiveFailures: number;
    offlineUntil: number;
    timeUntilOnline: number;
    canUseOnline: boolean;
  } {
    const now = Date.now();
    const timeUntilOnline = this.isTemporarilyOffline ? Math.max(0, this.offlineUntil - now) : 0;
    
    return {
      isTemporarilyOffline: this.isTemporarilyOffline,
      consecutiveFailures: this.consecutiveFailures,
      offlineUntil: this.offlineUntil,
      timeUntilOnline,
      canUseOnline: !this.isTemporarilyOffline || now >= this.offlineUntil,
    };
  }

  /**
   * Reset failure tracking (useful for testing or manual reset)
   */
  static resetFailureTracking(): void {
    console.log('🔄 Resetting OCR failure tracking');
    this.consecutiveFailures = 0;
    this.isTemporarilyOffline = false;
    this.offlineUntil = 0;
  }

  /**
   * Force temporary offline mode (useful for testing)
   */
  static forceOfflineMode(durationMs: number = this.OFFLINE_COOLDOWN): void {
    console.log(`🚫 Forcing offline mode for ${durationMs / 1000}s`);
    this.isTemporarilyOffline = true;
    this.offlineUntil = Date.now() + durationMs;
  }

  /**
   * Get processing recommendations based on current status
   */
  static getRecommendations(): {
    recommendedMode: 'online' | 'offline' | 'auto';
    reason: string;
    estimatedDelay: number;
  } {
    const status = this.getStatus();
    
    if (status.isTemporarilyOffline) {
      return {
        recommendedMode: 'offline',
        reason: `API temporarily disabled due to ${status.consecutiveFailures} consecutive failures. Will retry in ${Math.ceil(status.timeUntilOnline / 60000)} minutes.`,
        estimatedDelay: 1000, // Offline is fast
      };
    }

    if (status.consecutiveFailures > 0) {
      return {
        recommendedMode: 'auto',
        reason: `Recent API issues detected. Auto mode will try online first, then fallback to offline.`,
        estimatedDelay: 3000, // Account for potential retry delays
      };
    }

    return {
      recommendedMode: 'auto',
      reason: 'All systems operational. Auto mode recommended for best results.',
      estimatedDelay: 2000, // Normal online processing time
    };
  }
}
