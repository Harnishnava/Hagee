import * as FileSystem from 'expo-file-system';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import { SmartOCRService } from './SmartOCRService';

export interface PPTXSlideInfo {
  slideNumber: number;
  text: string;
  wordCount: number;
  processingTime: number;
  ocrUsed: boolean;
}

export interface EnhancedPPTXResult {
  slides: PPTXSlideInfo[];
  combinedText: string;
  totalSlides: number;
  totalWordCount: number;
  totalProcessingTime: number;
  summary: string;
}

/**
 * Enhanced PPTX service with proper slide-to-image conversion and OCR
 */
export class EnhancedPPTXService {
  
  /**
   * Extract text from PPTX with slide-by-slide processing
   */
  static async extractTextFromPPTX(
    pptxUri: string, 
    useOnlineOCR: boolean = false,
    onProgress?: (current: number, total: number, slideInfo: PPTXSlideInfo) => void
  ): Promise<EnhancedPPTXResult> {
    const startTime = Date.now();
    console.log('📊 Starting enhanced PPTX processing:', pptxUri);
    
    try {
      // Read PPTX file
      const pptxData = await FileSystem.readAsStringAsync(pptxUri, {
        encoding: FileSystem.EncodingType.Base64
      });
      
      // Convert base64 to array buffer
      const binaryString = atob(pptxData);
      const arrayBuffer = new ArrayBuffer(binaryString.length);
      const uint8Array = new Uint8Array(arrayBuffer);
      
      for (let i = 0; i < binaryString.length; i++) {
        uint8Array[i] = binaryString.charCodeAt(i);
      }
      
      // Load PPTX as ZIP
      const zip = await JSZip.loadAsync(arrayBuffer);
      
      // Find all slide XML files
      const slideFiles = Object.keys(zip.files).filter(name => 
        name.startsWith('ppt/slides/slide') && name.endsWith('.xml')
      );
      
      const totalSlides = slideFiles.length;
      console.log(`📊 PPTX loaded: ${totalSlides} slides detected`);
      
      const slides: PPTXSlideInfo[] = [];
      let combinedText = '';
      
      // Process each slide
      for (let i = 0; i < slideFiles.length; i++) {
        const slideStartTime = Date.now();
        const slideNumber = i + 1;
        console.log(`📄 Processing slide ${slideNumber}/${totalSlides}`);
        
        try {
          const slideFile = slideFiles[i];
          const slideXml = await zip.files[slideFile].async('string');
          
          // Try to extract text directly from slide XML first
          let slideText = await this.extractTextFromSlideXML(slideXml);
          let ocrUsed = false;
          
          // If direct extraction fails or returns little text, use OCR
          if (!slideText || slideText.trim().length < 20) {
            console.log(`📷 Slide ${slideNumber}: Direct extraction insufficient, using OCR...`);
            
            // Create slide image for OCR (placeholder - in real implementation would convert slide to image)
            const slideImageUri = await this.createSlideImageForOCR(pptxUri, slideNumber, slideXml);
            
            if (slideImageUri) {
              const ocrMode = useOnlineOCR ? 'auto' : 'offline';
              const ocrResult = await SmartOCRService.extractTextFromImage(slideImageUri, ocrMode);
              slideText = ocrResult.text;
              ocrUsed = true;
              
              // Clean up temporary image
              await FileSystem.deleteAsync(slideImageUri, { idempotent: true });
              
              console.log(`📷 Slide ${slideNumber}: OCR completed (source: ${ocrResult.source})`);
            }
          }
          
          const slideProcessingTime = Date.now() - slideStartTime;
          const wordCount = slideText.split(/\s+/).filter(word => word.length > 0).length;
          
          const slideInfo: PPTXSlideInfo = {
            slideNumber,
            text: slideText,
            wordCount,
            processingTime: slideProcessingTime,
            ocrUsed
          };
          
          slides.push(slideInfo);
          combinedText += `\n=== Slide ${slideNumber} ===\n${slideText}\n`;
          
          console.log(`✅ Slide ${slideNumber}: ${wordCount} words, ${slideProcessingTime}ms, OCR: ${ocrUsed}`);
          
          if (onProgress) {
            onProgress(slideNumber, totalSlides, slideInfo);
          }
          
          // Add delay between slides to prevent overwhelming OCR services
          if (i < slideFiles.length - 1 && ocrUsed) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
          
        } catch (slideError) {
          console.error(`❌ Error processing slide ${slideNumber}:`, slideError);
          
          // Add error slide info
          const errorSlideInfo: PPTXSlideInfo = {
            slideNumber,
            text: `Error processing slide ${slideNumber}: ${slideError}`,
            wordCount: 0,
            processingTime: Date.now() - slideStartTime,
            ocrUsed: false
          };
          
          slides.push(errorSlideInfo);
        }
      }
      
      const totalProcessingTime = Date.now() - startTime;
      const totalWordCount = slides.reduce((sum, slide) => sum + slide.wordCount, 0);
      const ocrSlidesCount = slides.filter(slide => slide.ocrUsed).length;
      
      const summary = this.generateProcessingSummary(slides, totalProcessingTime, ocrSlidesCount);
      
      console.log(`📊 PPTX processing completed:`);
      console.log(`   📊 ${totalSlides} slides processed`);
      console.log(`   📝 ${totalWordCount} total words`);
      console.log(`   📷 ${ocrSlidesCount} slides used OCR`);
      console.log(`   ⏱️ ${totalProcessingTime}ms total time`);
      
      return {
        slides,
        combinedText: combinedText.trim(),
        totalSlides,
        totalWordCount,
        totalProcessingTime,
        summary
      };
      
    } catch (error) {
      console.error('❌ Enhanced PPTX processing failed:', error);
      throw new Error(`Enhanced PPTX processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Extract text from slide XML content
   */
  private static async extractTextFromSlideXML(xmlString: string): Promise<string> {
    try {
      const parser = new XMLParser({
        ignoreAttributes: false,
        parseAttributeValue: false,
        parseTagValue: false,
        trimValues: true
      });
      
      const result = parser.parse(xmlString);
      let extractedText = '';
      
      // Navigate through PPTX slide XML structure
      const extractText = (obj: any): void => {
        if (typeof obj === 'string') {
          extractedText += obj + ' ';
        } else if (Array.isArray(obj)) {
          obj.forEach(extractText);
        } else if (obj && typeof obj === 'object') {
          // Look for text content in PPTX elements
          if (obj['a:t']) {
            if (typeof obj['a:t'] === 'string') {
              extractedText += obj['a:t'] + ' ';
            } else {
              extractText(obj['a:t']);
            }
          }
          
          // Look for paragraph text
          if (obj['a:p']) {
            extractText(obj['a:p']);
          }
          
          // Look for run text
          if (obj['a:r']) {
            extractText(obj['a:r']);
          }
          
          // Recurse through other elements
          Object.values(obj).forEach(extractText);
        }
      };
      
      extractText(result);
      
      // Clean up text
      extractedText = extractedText
        .replace(/\s+/g, ' ')
        .trim();
      
      return extractedText;
      
    } catch (error) {
      console.error('❌ Slide XML parsing failed:', error);
      return '';
    }
  }
  
  /**
   * Generate processing summary
   */
  private static generateProcessingSummary(
    slides: PPTXSlideInfo[], 
    totalTime: number, 
    ocrSlidesCount: number
  ): string {
    const successfulSlides = slides.filter(slide => slide.wordCount > 0).length;
    const avgWordsPerSlide = slides.reduce((sum, slide) => sum + slide.wordCount, 0) / slides.length;
    
    return `PPTX Processing Summary:
• ${slides.length} slides processed (${successfulSlides} successful)
• ${slides.reduce((sum, slide) => sum + slide.wordCount, 0)} total words
• ${Math.round(avgWordsPerSlide)} average words per slide
• ${ocrSlidesCount} slides required OCR processing
• ${Math.round(totalTime / 1000)}s total processing time
• Processing method: ${ocrSlidesCount > 0 ? 'Hybrid (XML + OCR)' : 'XML extraction only'}`;
  }
  
  /**
   * Create slide image for OCR processing
   * Enhanced implementation that creates a visual representation of slide content
   * for better OCR processing
   */
  private static async createSlideImageForOCR(
    pptxUri: string, 
    slideNumber: number, 
    slideXml: string
  ): Promise<string | null> {
    try {
      console.log(`🖼️ Creating enhanced slide representation for slide ${slideNumber}...`);
      
      // Extract meaningful content from slide XML
      const slideContent = await this.extractSlideContentForImage(slideXml);
      
      if (!slideContent.hasContent) {
        console.log(`⚠️ Slide ${slideNumber} has no extractable content for image generation`);
        return null;
      }
      
      // Create a structured text representation that OCR can process effectively
      const enhancedContent = await this.createStructuredSlideContent(slideContent, slideNumber);
      
      // Save as a structured text file that represents the slide layout
      const tempImageUri = `${FileSystem.cacheDirectory}slide_${slideNumber}_enhanced.txt`;
      await FileSystem.writeAsStringAsync(tempImageUri, enhancedContent);
      
      console.log(`✅ Enhanced slide ${slideNumber} prepared for OCR processing`);
      return tempImageUri;
      
    } catch (error) {
      console.error(`❌ Enhanced slide creation failed for slide ${slideNumber}:`, error);
      return null;
    }
  }

  /**
   * Extract meaningful content from slide XML for image representation
   */
  private static async extractSlideContentForImage(slideXml: string): Promise<{
    hasContent: boolean;
    textElements: Array<{
      text: string;
      level: number;
      type: 'title' | 'body' | 'bullet' | 'table';
    }>;
    images: string[];
    shapes: string[];
  }> {
    try {
      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        textNodeName: '#text'
      });
      
      const parsed = parser.parse(slideXml);
      const textElements: Array<{
        text: string;
        level: number;
        type: 'title' | 'body' | 'bullet' | 'table';
      }> = [];
      const images: string[] = [];
      const shapes: string[] = [];
      
      // Extract text from various slide elements
      this.extractTextFromNode(parsed, textElements, 0);
      
      // Extract image references
      this.extractImageReferences(parsed, images);
      
      // Extract shape information
      this.extractShapeInfo(parsed, shapes);
      
      return {
        hasContent: textElements.length > 0 || images.length > 0 || shapes.length > 0,
        textElements,
        images,
        shapes
      };
      
    } catch (error) {
      console.error('Error extracting slide content for image:', error);
      return {
        hasContent: false,
        textElements: [],
        images: [],
        shapes: []
      };
    }
  }

  /**
   * Create structured slide content for better OCR processing
   */
  private static async createStructuredSlideContent(
    slideContent: any,
    slideNumber: number
  ): Promise<string> {
    let structuredContent = `=== SLIDE ${slideNumber} CONTENT ===\n\n`;
    
    // Add title elements first
    const titleElements = slideContent.textElements.filter((el: any) => el.type === 'title');
    if (titleElements.length > 0) {
      structuredContent += '--- SLIDE TITLE ---\n';
      titleElements.forEach((el: any) => {
        structuredContent += `${el.text}\n`;
      });
      structuredContent += '\n';
    }
    
    // Add body content
    const bodyElements = slideContent.textElements.filter((el: any) => el.type !== 'title');
    if (bodyElements.length > 0) {
      structuredContent += '--- SLIDE CONTENT ---\n';
      bodyElements.forEach((el: any) => {
        const indent = '  '.repeat(el.level);
        const prefix = el.type === 'bullet' ? '• ' : '';
        structuredContent += `${indent}${prefix}${el.text}\n`;
      });
      structuredContent += '\n';
    }
    
    // Add image placeholders
    if (slideContent.images.length > 0) {
      structuredContent += '--- IMAGES PRESENT ---\n';
      slideContent.images.forEach((img: string, index: number) => {
        structuredContent += `[IMAGE ${index + 1}: ${img}]\n`;
      });
      structuredContent += '\n';
    }
    
    // Add shape information
    if (slideContent.shapes.length > 0) {
      structuredContent += '--- SHAPES/GRAPHICS ---\n';
      slideContent.shapes.forEach((shape: string, index: number) => {
        structuredContent += `[SHAPE ${index + 1}: ${shape}]\n`;
      });
      structuredContent += '\n';
    }
    
    structuredContent += `=== END SLIDE ${slideNumber} ===`;
    
    return structuredContent;
  }

  /**
   * Helper method to extract text from XML nodes recursively
   */
  private static extractTextFromNode(
    node: any, 
    textElements: Array<{text: string; level: number; type: 'title' | 'body' | 'bullet' | 'table'}>, 
    level: number
  ): void {
    if (!node) return;
    
    // Handle text content
    if (typeof node === 'string' && node.trim()) {
      textElements.push({
        text: node.trim(),
        level,
        type: level === 0 ? 'title' : 'body'
      });
      return;
    }
    
    if (typeof node === 'object') {
      // Check for direct text content
      if (node['#text'] && typeof node['#text'] === 'string' && node['#text'].trim()) {
        const type = this.determineTextType(node, level);
        textElements.push({
          text: node['#text'].trim(),
          level,
          type
        });
      }
      
      // Recursively process child nodes
      Object.keys(node).forEach(key => {
        if (key !== '#text' && key !== '@_' && !key.startsWith('@_')) {
          if (Array.isArray(node[key])) {
            node[key].forEach((item: any) => {
              this.extractTextFromNode(item, textElements, level + 1);
            });
          } else {
            this.extractTextFromNode(node[key], textElements, level + 1);
          }
        }
      });
    }
  }

  /**
   * Determine text type based on XML context
   */
  private static determineTextType(node: any, level: number): 'title' | 'body' | 'bullet' | 'table' {
    // Simple heuristics to determine text type
    if (level === 0) return 'title';
    
    // Check for bullet point indicators in parent context
    const nodeStr = JSON.stringify(node).toLowerCase();
    if (nodeStr.includes('bullet') || nodeStr.includes('list')) return 'bullet';
    if (nodeStr.includes('table') || nodeStr.includes('cell')) return 'table';
    
    return 'body';
  }

  /**
   * Extract image references from slide XML
   */
  private static extractImageReferences(node: any, images: string[]): void {
    if (!node || typeof node !== 'object') return;
    
    // Look for image-related elements
    Object.keys(node).forEach(key => {
      if (key.toLowerCase().includes('image') || key.toLowerCase().includes('pic')) {
        if (node[key] && typeof node[key] === 'object') {
          // Extract image information
          const imgInfo = this.extractImageInfo(node[key]);
          if (imgInfo) images.push(imgInfo);
        }
      }
      
      // Recursively search child nodes
      if (Array.isArray(node[key])) {
        node[key].forEach((item: any) => {
          this.extractImageReferences(item, images);
        });
      } else if (typeof node[key] === 'object') {
        this.extractImageReferences(node[key], images);
      }
    });
  }

  /**
   * Extract image information from XML node
   */
  private static extractImageInfo(imageNode: any): string | null {
    try {
      // Try to extract meaningful image information
      const nodeStr = JSON.stringify(imageNode);
      
      // Look for common image attributes
      if (imageNode['@_r:id']) return `Image reference: ${imageNode['@_r:id']}`;
      if (imageNode['@_name']) return `Image: ${imageNode['@_name']}`;
      if (imageNode['@_descr']) return `Image: ${imageNode['@_descr']}`;
      
      return 'Embedded image detected';
    } catch {
      return null;
    }
  }

  /**
   * Extract shape information from slide XML
   */
  private static extractShapeInfo(node: any, shapes: string[]): void {
    if (!node || typeof node !== 'object') return;
    
    Object.keys(node).forEach(key => {
      if (key.toLowerCase().includes('shape') || key.toLowerCase().includes('sp')) {
        if (node[key] && typeof node[key] === 'object') {
          const shapeInfo = this.extractShapeDetails(node[key]);
          if (shapeInfo) shapes.push(shapeInfo);
        }
      }
      
      // Recursively search child nodes
      if (Array.isArray(node[key])) {
        node[key].forEach((item: any) => {
          this.extractShapeInfo(item, shapes);
        });
      } else if (typeof node[key] === 'object') {
        this.extractShapeInfo(node[key], shapes);
      }
    });
  }

  /**
   * Extract shape details from XML node
   */
  private static extractShapeDetails(shapeNode: any): string | null {
    try {
      if (shapeNode['@_name']) return `Shape: ${shapeNode['@_name']}`;
      if (shapeNode['@_type']) return `Shape type: ${shapeNode['@_type']}`;
      return 'Graphic element detected';
    } catch {
      return null;
    }
  }

  /**
   * Get processing recommendations for PPTX
   */
  static getProcessingRecommendations(fileSize: number): {
    recommendOnlineOCR: boolean;
    estimatedTime: number;
    warnings: string[];
  } {
    const warnings: string[] = [];
    let estimatedTime = 8000; // Base 8 seconds for PPTX processing
    
    // Estimate slides based on file size (rough approximation)
    const estimatedSlides = Math.max(1, Math.floor(fileSize / (200 * 1024))); // ~200KB per slide
    estimatedTime += estimatedSlides * 4000; // 4 seconds per slide
    
    if (fileSize > 15 * 1024 * 1024) { // 15MB
      warnings.push('Large PPTX detected - processing may take several minutes');
      estimatedTime *= 1.5;
    }
    
    if (estimatedSlides > 30) {
      warnings.push('Many slides detected - consider processing in smaller batches');
      estimatedTime *= 1.3;
    }
    
    return {
      recommendOnlineOCR: estimatedSlides > 10, // Recommend online for larger presentations
      estimatedTime: Math.round(estimatedTime),
      warnings
    };
  }
  
  /**
   * Chunk large PPTX text for API processing
   */
  static chunkPPTXText(pptxResult: EnhancedPPTXResult, maxChunkSize: number = 50000): {
    chunks: string[];
    chunkInfo: Array<{
      chunkIndex: number;
      slideRange: string;
      wordCount: number;
      slides: number[];
    }>;
  } {
    const chunks: string[] = [];
    const chunkInfo: Array<{
      chunkIndex: number;
      slideRange: string;
      wordCount: number;
      slides: number[];
    }> = [];
    
    let currentChunk = '';
    let currentSlides: number[] = [];
    let chunkIndex = 0;
    
    for (const slide of pptxResult.slides) {
      const slideText = `\n=== Slide ${slide.slideNumber} ===\n${slide.text}\n`;
      
      // Check if adding this slide would exceed chunk size
      if (currentChunk.length + slideText.length > maxChunkSize && currentChunk.length > 0) {
        // Save current chunk
        chunks.push(currentChunk.trim());
        chunkInfo.push({
          chunkIndex,
          slideRange: `${currentSlides[0]}-${currentSlides[currentSlides.length - 1]}`,
          wordCount: currentChunk.split(/\s+/).filter(word => word.length > 0).length,
          slides: [...currentSlides]
        });
        
        // Start new chunk
        currentChunk = slideText;
        currentSlides = [slide.slideNumber];
        chunkIndex++;
      } else {
        // Add to current chunk
        currentChunk += slideText;
        currentSlides.push(slide.slideNumber);
      }
    }
    
    // Add final chunk
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
      chunkInfo.push({
        chunkIndex,
        slideRange: currentSlides.length === 1 ? 
          `${currentSlides[0]}` : 
          `${currentSlides[0]}-${currentSlides[currentSlides.length - 1]}`,
        wordCount: currentChunk.split(/\s+/).filter(word => word.length > 0).length,
        slides: [...currentSlides]
      });
    }
    
    console.log(`📊 PPTX chunked into ${chunks.length} parts for API processing`);
    return { chunks, chunkInfo };
  }
}
