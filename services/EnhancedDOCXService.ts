import * as FileSystem from 'expo-file-system';
import mammoth from 'mammoth';
import { SmartOCRService } from './SmartOCRService';
import { OfflineDOCXParser } from './OfflineDOCXParser';

export interface DOCXProcessingResult {
  text: string;
  wordCount: number;
  processingTime: number;
  method: 'mammoth' | 'offline_parser' | 'ocr_fallback';
  images: Array<{
    description: string;
    altText?: string;
  }>;
  warnings: string[];
}

/**
 * Enhanced DOCX service with proper text extraction using mammoth.js
 */
export class EnhancedDOCXService {
  
  /**
   * Extract text from DOCX with proper parsing and OCR fallback
   */
  static async extractTextFromDOCX(
    docxUri: string,
    useOnlineOCR: boolean = false
  ): Promise<DOCXProcessingResult> {
    const startTime = Date.now();
    console.log('📄 Starting enhanced DOCX processing:', docxUri);
    
    try {
      // First attempt: Use mammoth.js for proper DOCX parsing
      const mammothResult = await this.extractWithMammoth(docxUri);
      
      if (mammothResult.success && mammothResult.text.length > 50) {
        console.log('✅ Mammoth extraction successful:', mammothResult.text.length, 'characters');
        
        return {
          text: mammothResult.text,
          wordCount: mammothResult.text.split(/\s+/).filter(word => word.length > 0).length,
          processingTime: Date.now() - startTime,
          method: 'mammoth',
          images: mammothResult.images,
          warnings: mammothResult.warnings
        };
      } else {
        console.log('⚠️ Mammoth extraction insufficient, trying offline parser...');
        return await this.extractWithOfflineParser(docxUri, useOnlineOCR, startTime, mammothResult.warnings);
      }
      
    } catch (error) {
      console.error('❌ Mammoth extraction failed:', error);
      console.log('🔄 Falling back to offline parser...');
      
      return await this.extractWithOfflineParser(docxUri, useOnlineOCR, startTime, [
        `Mammoth parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      ]);
    }
  }
  
  /**
   * Extract text using mammoth.js
   */
  private static async extractWithMammoth(docxUri: string): Promise<{
    success: boolean;
    text: string;
    images: Array<{ description: string; altText?: string }>;
    warnings: string[];
  }> {
    try {
      console.log('📄 Attempting mammoth.js extraction...');
      
      // Read DOCX file as array buffer
      const fileContent = await FileSystem.readAsStringAsync(docxUri, {
        encoding: FileSystem.EncodingType.Base64
      });
      
      // Convert base64 to array buffer
      const binaryString = atob(fileContent);
      const arrayBuffer = new ArrayBuffer(binaryString.length);
      const uint8Array = new Uint8Array(arrayBuffer);
      
      for (let i = 0; i < binaryString.length; i++) {
        uint8Array[i] = binaryString.charCodeAt(i);
      }
      
      // Extract text with mammoth
      const result = await mammoth.extractRawText({ arrayBuffer });
      
      // Process images if any
      const images: Array<{ description: string; altText?: string }> = [];
      
      // Try to extract images info (mammoth doesn't extract images directly in React Native)
      // This is a placeholder for image handling
      if (result.messages && result.messages.length > 0) {
        for (const message of result.messages) {
          if (message.type === 'warning' && message.message.includes('image')) {
            images.push({
              description: 'Image found in document (not extracted)',
              altText: message.message
            });
          }
        }
      }
      
      const warnings = result.messages?.map(msg => `${msg.type}: ${msg.message}`) || [];
      
      console.log('📄 Mammoth extraction completed:', result.value.length, 'characters');
      if (warnings.length > 0) {
        console.log('⚠️ Mammoth warnings:', warnings);
      }
      
      return {
        success: result.value.length > 0,
        text: result.value,
        images,
        warnings
      };
      
    } catch (error) {
      console.error('❌ Mammoth extraction error:', error);
      return {
        success: false,
        text: '',
        images: [],
        warnings: [`Mammoth error: ${error instanceof Error ? error.message : 'Unknown error'}`]
      };
    }
  }
  
  /**
   * Extract text using offline parser (no OCR)
   */
  private static async extractWithOfflineParser(
    docxUri: string,
    useOnlineOCR: boolean,
    startTime: number,
    existingWarnings: string[] = []
  ): Promise<DOCXProcessingResult> {
    try {
      console.log('📄 Using offline DOCX parser (no OCR)...');
      
      const offlineResult = await OfflineDOCXParser.extractTextOffline(docxUri);
      
      if (offlineResult.text.length > 50) {
        console.log('✅ Offline parser successful:', offlineResult.text.length, 'characters');
        
        return {
          text: offlineResult.text,
          wordCount: offlineResult.wordCount,
          processingTime: Date.now() - startTime,
          method: 'offline_parser',
          images: [], // Offline parser doesn't extract images
          warnings: [...existingWarnings, ...offlineResult.warnings]
        };
      } else {
        console.log('⚠️ Offline parser returned insufficient text, falling back to OCR...');
        return await this.extractWithOCRFallback(docxUri, useOnlineOCR, startTime, [
          ...existingWarnings,
          ...offlineResult.warnings,
          'Offline parser returned insufficient text'
        ]);
      }
      
    } catch (error) {
      console.error('❌ Offline parser failed:', error);
      console.log('🔄 Final fallback to OCR...');
      
      return await this.extractWithOCRFallback(docxUri, useOnlineOCR, startTime, [
        ...existingWarnings,
        `Offline parser failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      ]);
    }
  }
  
  /**
   * Fallback to OCR processing
   */
  private static async extractWithOCRFallback(
    docxUri: string,
    useOnlineOCR: boolean,
    startTime: number,
    existingWarnings: string[] = []
  ): Promise<DOCXProcessingResult> {
    try {
      console.log('📷 Using OCR fallback for DOCX...');
      
      const ocrMode = useOnlineOCR ? 'auto' : 'offline';
      const ocrResult = await SmartOCRService.extractTextFromImage(docxUri, ocrMode);
      
      const warnings = [
        ...existingWarnings,
        'Document processed using OCR fallback - text extraction may be less accurate',
        `OCR source: ${ocrResult.source}`,
        ocrResult.fallbackUsed ? 'OCR fallback was used due to API issues' : ''
      ].filter(Boolean);
      
      console.log('📷 OCR fallback completed:', ocrResult.text.length, 'characters');
      
      return {
        text: ocrResult.text,
        wordCount: ocrResult.text.split(/\s+/).filter(word => word.length > 0).length,
        processingTime: Date.now() - startTime,
        method: 'ocr_fallback',
        images: [], // OCR doesn't extract image descriptions for DOCX
        warnings
      };
      
    } catch (error) {
      console.error('❌ OCR fallback also failed:', error);
      
      return {
        text: `Failed to extract text from DOCX document.

Mammoth parsing failed: ${existingWarnings[0] || 'Unknown error'}
OCR fallback failed: ${error instanceof Error ? error.message : 'Unknown error'}

Suggestions:
1. Ensure the DOCX file is not corrupted
2. Try converting the document to PDF format
3. Export individual pages as images for OCR processing`,
        wordCount: 0,
        processingTime: Date.now() - startTime,
        method: 'ocr_fallback',
        images: [],
        warnings: [
          ...existingWarnings,
          `OCR fallback failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        ]
      };
    }
  }
  
  /**
   * Get processing recommendations for DOCX files
   */
  static getProcessingRecommendations(fileSize: number): {
    recommendOnlineOCR: boolean;
    estimatedTime: number;
    warnings: string[];
  } {
    const warnings: string[] = [];
    let estimatedTime = 3000; // Base 3 seconds for mammoth processing
    
    if (fileSize > 5 * 1024 * 1024) { // 5MB
      warnings.push('Large DOCX file - processing may take longer');
      estimatedTime += 5000;
    }
    
    if (fileSize > 20 * 1024 * 1024) { // 20MB
      warnings.push('Very large DOCX file - consider splitting into smaller documents');
      estimatedTime += 10000;
    }
    
    // Recommend online OCR for larger files as fallback
    const recommendOnlineOCR = fileSize > 2 * 1024 * 1024; // 2MB
    
    return {
      recommendOnlineOCR,
      estimatedTime,
      warnings
    };
  }
  
  /**
   * Validate DOCX file
   */
  static async validateDOCXFile(docxUri: string): Promise<{
    isValid: boolean;
    fileSize: number;
    error?: string;
  }> {
    try {
      const fileInfo = await FileSystem.getInfoAsync(docxUri);
      
      if (!fileInfo.exists) {
        return {
          isValid: false,
          fileSize: 0,
          error: 'File does not exist'
        };
      }
      
      const fileSize = fileInfo.size || 0;
      
      // Basic validation - check if it's likely a DOCX file
      if (fileSize < 1000) { // Less than 1KB is suspicious for DOCX
        return {
          isValid: false,
          fileSize,
          error: 'File too small to be a valid DOCX document'
        };
      }
      
      return {
        isValid: true,
        fileSize
      };
      
    } catch (error) {
      return {
        isValid: false,
        fileSize: 0,
        error: `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
  
  /**
   * Clean and format extracted DOCX text
   */
  static cleanDOCXText(text: string): string {
    return text
      .replace(/\r\n/g, '\n') // Normalize line endings
      .replace(/\n{3,}/g, '\n\n') // Remove excessive line breaks
      .replace(/\t+/g, ' ') // Replace tabs with spaces
      .replace(/ {2,}/g, ' ') // Replace multiple spaces with single space
      .trim();
  }
}
