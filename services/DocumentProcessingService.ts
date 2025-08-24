import * as FileSystem from 'expo-file-system';
import { PDFService } from './PDFService';
import { MistralOCRService } from './MistralOCRService';
import { OnlineOCRService } from './OnlineOCRService';
import { OCRService } from './OCRService';
import { OfflineOCRService } from './OfflineOCRService';
import { SmartOCRService } from './SmartOCRService';
import { EnhancedPDFService } from './EnhancedPDFService';
import { EnhancedDOCXService } from './EnhancedDOCXService';
import { EnhancedPPTXService } from './EnhancedPPTXService';

export interface ProcessedDocument {
  id: string;
  name: string;
  type: string;
  extractedText: string;
  imageDescriptions: string[];
  pageCount?: number;
  processingTime: number;
  wordCount: number;
  processingMethod?: string;
  warnings?: string[];
}

export interface BatchProcessingResult {
  documents: ProcessedDocument[];
  combinedText: string;
  totalWordCount: number;
  totalProcessingTime: number;
  summary: string;
}

export class DocumentProcessingService {
  /**
   * Process a single document with comprehensive text and image extraction
   */
  static async processDocument(
    documentUri: string,
    documentName: string,
    documentType: string,
    useOnlineOCR: boolean = false
  ): Promise<ProcessedDocument> {
    const startTime = Date.now();
    let extractedText = '';
    let imageDescriptions: string[] = [];
    let pageCount: number | undefined;

    console.log(`🔄 Processing document: ${documentName} (${documentType})`);

    let processingMethod = 'Unknown';
    let warnings: string[] = [];

    try {
      if (documentType.includes('pdf')) {
        const result = await this.processPDF(documentUri, useOnlineOCR);
        extractedText = result.text;
        imageDescriptions = result.imageDescriptions;
        pageCount = result.pageCount;
        processingMethod = result.processingMethod;
        warnings = result.warnings;
      } else if (documentType.includes('word') || documentType.includes('officedocument.wordprocessingml')) {
        const result = await this.processDOCX(documentUri, useOnlineOCR);
        extractedText = result.text;
        imageDescriptions = result.imageDescriptions;
        processingMethod = result.processingMethod;
        warnings = result.warnings;
      } else if (documentType.includes('powerpoint') || documentType.includes('presentationml')) {
        const result = await this.processPPTX(documentUri, useOnlineOCR);
        extractedText = result.text;
        imageDescriptions = result.imageDescriptions;
      } else if (documentType.includes('image')) {
        extractedText = await this.processImage(documentUri, useOnlineOCR);
      } else if (documentType.includes('text')) {
        extractedText = await this.processTextFile(documentUri);
      } else {
        throw new Error(`Unsupported document type: ${documentType}`);
      }

      const processingTime = Date.now() - startTime;
      const wordCount = extractedText.split(/\s+/).filter(word => word.length > 0).length;

      console.log(`✅ Document processed: ${wordCount} words, ${imageDescriptions.length} images, ${processingTime}ms`);

      return {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        name: documentName,
        type: documentType,
        extractedText,
        imageDescriptions,
        pageCount,
        processingTime,
        wordCount,
        processingMethod,
        warnings,
      };
    } catch (error) {
      console.error(`❌ Error processing document ${documentName}:`, error);
      throw error;
    }
  }

  /**
   * Process multiple documents in batch and combine results
   */
  static async processBatch(
    documents: Array<{ uri: string; name: string; type: string }>,
    useOnlineOCR: boolean = false
  ): Promise<BatchProcessingResult> {
    const startTime = Date.now();
    const processedDocuments: ProcessedDocument[] = [];
    
    console.log(`🔄 Starting batch processing of ${documents.length} documents...`);

    // Process each document
    for (const doc of documents) {
      try {
        const processed = await this.processDocument(doc.uri, doc.name, doc.type, useOnlineOCR);
        processedDocuments.push(processed);
      } catch (error) {
        console.error(`❌ Failed to process ${doc.name}:`, error);
        // Continue with other documents
      }
    }

    // Combine all content
    const combinedText = this.combineDocumentContent(processedDocuments);
    const totalWordCount = processedDocuments.reduce((sum, doc) => sum + doc.wordCount, 0);
    const totalProcessingTime = Date.now() - startTime;
    
    const summary = this.generateBatchSummary(processedDocuments);

    console.log(`✅ Batch processing complete: ${processedDocuments.length}/${documents.length} documents, ${totalWordCount} total words`);

    return {
      documents: processedDocuments,
      combinedText,
      totalWordCount,
      totalProcessingTime,
      summary,
    };
  }

  /**
   * Process PDF with enhanced multi-page support and page-by-page OCR
   */
  private static async processPDF(
    uri: string,
    useOnlineOCR: boolean
  ): Promise<{ text: string; imageDescriptions: string[]; pageCount: number; processingMethod: string; warnings: string[] }> {
    try {
      console.log('📚 Processing multi-page PDF with enhanced service...');
      
      const pdfResult = await EnhancedPDFService.extractTextFromPDF(
        uri, 
        useOnlineOCR,
        (current, total, pageInfo) => {
          console.log(`📄 Processing page ${current}/${total}: ${pageInfo.wordCount} words`);
        }
      );

      // Generate image descriptions from page processing info
      const imageDescriptions = pdfResult.pages
        .filter(page => page.ocrUsed)
        .map(page => `Page ${page.pageNumber}: Processed with OCR (${page.wordCount} words)`);

      console.log(`✅ Enhanced PDF processing completed: ${pdfResult.totalPages} pages, ${pdfResult.totalWordCount} words`);

      return {
        text: pdfResult.combinedText,
        imageDescriptions,
        pageCount: pdfResult.totalPages,
        processingMethod: `Enhanced multi-page (${pdfResult.pages.filter(p => p.ocrUsed).length} pages used OCR)`,
        warnings: [pdfResult.summary]
      };

    } catch (error) {
      console.error('❌ Enhanced PDF processing failed, falling back to basic method:', error);
      
      // Fallback to basic PDF processing
      try {
        const text = await PDFService.extractTextFromPDF(uri);
        console.log(`📄 Basic PDF fallback: ${text.length} characters`);

        return {
          text,
          imageDescriptions: [],
          pageCount: 1,
          processingMethod: 'Basic fallback (enhanced processing failed)',
          warnings: [`Enhanced processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`]
        };
      } catch (fallbackError) {
        console.error('❌ Basic PDF processing also failed:', fallbackError);
        throw fallbackError;
      }
    }
  }

  /**
   * Process DOCX files with enhanced mammoth.js parsing and OCR fallback
   */
  private static async processDOCX(
    uri: string,
    useOnlineOCR: boolean
  ): Promise<{ text: string; imageDescriptions: string[]; processingMethod: string; warnings: string[] }> {
    try {
      console.log('📄 Processing DOCX with enhanced mammoth.js service...');
      
      const docxResult = await EnhancedDOCXService.extractTextFromDOCX(uri, useOnlineOCR);
      
      // Convert image info to descriptions
      const imageDescriptions = docxResult.images.map(img => img.description);
      
      console.log(`✅ Enhanced DOCX processing completed: ${docxResult.wordCount} words (method: ${docxResult.method})`);
      
      return {
        text: EnhancedDOCXService.cleanDOCXText(docxResult.text),
        imageDescriptions,
        processingMethod: docxResult.method === 'mammoth' ? 'Mammoth.js parsing' : 'OCR fallback',
        warnings: docxResult.warnings
      };

    } catch (error) {
      console.error('❌ Enhanced DOCX processing failed:', error);
      throw error;
    }
  }

  /**
   * Process PPTX files with enhanced slide-by-slide extraction
   */
  private static async processPPTX(
    uri: string,
    useOnlineOCR: boolean
  ): Promise<{ text: string; imageDescriptions: string[]; processingMethod: string; warnings: string[] }> {
    try {
      console.log('📊 Processing PPTX with enhanced slide extraction service...');
      
      const pptxResult = await EnhancedPPTXService.extractTextFromPPTX(uri, useOnlineOCR);
      
      console.log(`✅ Enhanced PPTX processing completed: ${pptxResult.totalSlides} slides, ${pptxResult.totalWordCount} words`);
      
      return {
        text: pptxResult.combinedText,
        imageDescriptions: [], // PPTX doesn't extract image descriptions yet
        processingMethod: `Slide-by-slide extraction (${pptxResult.slides.filter(s => s.ocrUsed).length} slides used OCR)`,
        warnings: pptxResult.totalWordCount < 100 ? ['Low text content extracted - presentation may be image-heavy'] : []
      };

    } catch (error) {
      console.error('❌ Enhanced PPTX processing failed:', error);
      
      // Fallback to instruction text
      const fallbackText = `PowerPoint file detected: ${uri.split('/').pop()}
      
To process PowerPoint files:
1. Export slides as images (PNG/JPG) from PowerPoint
2. Upload the individual slide images for OCR processing
3. Or convert the PowerPoint to PDF format first

Current file cannot be processed directly as it contains structured presentation data, not image data.`;

      return {
        text: fallbackText,
        imageDescriptions: [],
        processingMethod: 'Fallback instructions',
        warnings: ['PPTX processing failed - showing manual instructions']
      };
    }
  }

  /**
   * Process image files with Smart OCR (handles rate limiting and fallbacks)
   */
  private static async processImage(uri: string, useOnlineOCR: boolean): Promise<string> {
    try {
      console.log(`📷 Processing image with SMART OCR (${useOnlineOCR ? 'AUTO' : 'OFFLINE'} mode)...`);
      
      const ocrMode = useOnlineOCR ? 'auto' : 'offline';
      const result = await SmartOCRService.extractTextFromImage(uri, ocrMode);
      
      if (!result.text || result.text.trim().length === 0) {
        console.log('⚠️ Smart OCR returned empty text');
        return `Image processed but no text was detected.

OCR Source: ${result.source}
Processing Time: ${result.processingTime}ms
Fallback Used: ${result.fallbackUsed ? 'Yes' : 'No'}

Possible reasons:
1. Image quality is too low or blurry
2. Text is too small or at an angle  
3. Image contains handwriting (harder to recognize)
4. No text present in the image

${result.source === 'offline' ? 'Try online mode for better accuracy.' : 'Image may not contain readable text.'}`;
      }
      
      console.log(`✅ Smart OCR extracted ${result.text.length} characters (source: ${result.source}, fallback: ${result.fallbackUsed})`);
      return result.text;
    } catch (error) {
      console.error('❌ Smart OCR error:', error);
      throw error;
    }
  }

  /**
   * Process plain text files
   */
  private static async processTextFile(uri: string): Promise<string> {
    try {
      console.log('📄 Reading text file...');
      return await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
    } catch (error) {
      console.error('❌ Text file reading error:', error);
      throw error;
    }
  }

  /**
   * Combine content from multiple processed documents
   */
  private static combineDocumentContent(documents: ProcessedDocument[]): string {
    return documents
      .map(doc => {
        let content = `=== ${doc.name} ===\n${doc.extractedText}`;
        if (doc.imageDescriptions.length > 0) {
          content += `\n\nImage Descriptions:\n${doc.imageDescriptions.join('\n')}`;
        }
        return content;
      })
      .join('\n\n');
  }

  /**
   * Chunk large text content to fit within API token limits
   * Groq free tier: ~500k tokens/day, ~100k tokens per request safe limit
   */
  static chunkTextForAPI(text: string, maxChunkSize: number = 50000): string[] {
    if (text.length <= maxChunkSize) {
      return [text];
    }

    const chunks: string[] = [];
    let currentIndex = 0;

    while (currentIndex < text.length) {
      let chunkEnd = currentIndex + maxChunkSize;
      
      // Try to break at sentence boundaries to maintain context
      if (chunkEnd < text.length) {
        const lastPeriod = text.lastIndexOf('.', chunkEnd);
        const lastNewline = text.lastIndexOf('\n', chunkEnd);
        const breakPoint = Math.max(lastPeriod, lastNewline);
        
        if (breakPoint > currentIndex + maxChunkSize * 0.7) {
          chunkEnd = breakPoint + 1;
        }
      }

      chunks.push(text.slice(currentIndex, chunkEnd).trim());
      currentIndex = chunkEnd;
    }

    console.log(`📄 Text chunked into ${chunks.length} parts for API processing`);
    return chunks;
  }

  /**
   * Get processing recommendations based on text size
   */
  static getProcessingRecommendation(textLength: number): {
    shouldChunk: boolean;
    estimatedTokens: number;
    recommendation: string;
  } {
    // Rough estimate: 1 token ≈ 4 characters for English text
    const estimatedTokens = Math.ceil(textLength / 4);
    
    if (estimatedTokens > 400000) {
      return {
        shouldChunk: true,
        estimatedTokens,
        recommendation: 'Document is very large. Consider using offline mode or chunking for online processing.'
      };
    } else if (estimatedTokens > 100000) {
      return {
        shouldChunk: true,
        estimatedTokens,
        recommendation: 'Document is large. Will be chunked for online processing.'
      };
    } else {
      return {
        shouldChunk: false,
        estimatedTokens,
        recommendation: 'Document size is optimal for processing.'
      };
    }
  }

  /**
   * Generate a summary of batch processing results
   */
  private static generateBatchSummary(documents: ProcessedDocument[]): string {
    const totalDocs = documents.length;
    const totalWords = documents.reduce((sum, doc) => sum + doc.wordCount, 0);
    const totalImages = documents.reduce((sum, doc) => sum + doc.imageDescriptions.length, 0);
    const avgWordsPerDoc = Math.round(totalWords / totalDocs);

    const typeBreakdown = documents.reduce((acc, doc) => {
      const type = doc.type.includes('pdf') ? 'PDF' :
                   doc.type.includes('word') ? 'DOCX' :
                   doc.type.includes('powerpoint') ? 'PPTX' :
                   doc.type.includes('image') ? 'Image' : 'Other';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    let summary = `Batch Processing Summary:\n`;
    summary += `• ${totalDocs} documents processed\n`;
    summary += `• ${totalWords} total words (avg: ${avgWordsPerDoc} per doc)\n`;
    summary += `• ${totalImages} images processed\n`;
    summary += `• Document types: ${Object.entries(typeBreakdown).map(([type, count]) => `${count} ${type}`).join(', ')}\n`;

    return summary;
  }

  /**
   * Check if document type is supported
   */
  static isSupportedDocument(mimeType: string): boolean {
    const supportedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'image/jpeg',
      'image/png',
      'image/jpg',
      'image/webp',
    ];

    return supportedTypes.some(type => mimeType.includes(type.split('/')[1]));
  }

  /**
   * Get processing recommendations based on document types
   */
  static getProcessingRecommendations(documents: Array<{ type: string; size: number }>): {
    recommendOnlineOCR: boolean;
    estimatedTime: number;
    warnings: string[];
  } {
    const totalSize = documents.reduce((sum, doc) => sum + doc.size, 0);
    const hasLargeFiles = documents.some(doc => doc.size > 10 * 1024 * 1024); // 10MB
    const hasComplexFormats = documents.some(doc => 
      doc.type.includes('powerpoint') || doc.type.includes('word')
    );

    const warnings: string[] = [];
    let estimatedTime = documents.length * 2000; // Base 2 seconds per document

    if (hasLargeFiles) {
      warnings.push('Large files detected - processing may take longer');
      estimatedTime *= 2;
    }

    if (hasComplexFormats) {
      warnings.push('Complex document formats detected - OCR fallback will be used');
      estimatedTime *= 1.5;
    }

    if (totalSize > 50 * 1024 * 1024) { // 50MB total
      warnings.push('Large batch size - consider processing in smaller groups');
    }

    return {
      recommendOnlineOCR: hasComplexFormats || hasLargeFiles,
      estimatedTime: Math.round(estimatedTime),
      warnings,
    };
  }
}
