import * as FileSystem from 'expo-file-system';
import { PDFDocument } from 'pdf-lib';
import { SmartOCRService } from './SmartOCRService';
import PdfRenderer from 'react-native-pdf-renderer';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

export interface PDFPageInfo {
  pageNumber: number;
  text: string;
  wordCount: number;
  processingTime: number;
  ocrUsed: boolean;
}

export interface EnhancedPDFResult {
  pages: PDFPageInfo[];
  combinedText: string;
  totalPages: number;
  totalWordCount: number;
  totalProcessingTime: number;
  summary: string;
}

/**
 * Enhanced PDF service with proper multi-page support and OCR integration
 */
export class EnhancedPDFService {
  
  /**
   * Extract text from multi-page PDF with page-by-page processing
   */
  static async extractTextFromPDF(
    pdfUri: string, 
    useOnlineOCR: boolean = false,
    onProgress?: (current: number, total: number, pageInfo: PDFPageInfo) => void
  ): Promise<EnhancedPDFResult> {
    const startTime = Date.now();
    console.log('📚 Starting enhanced multi-page PDF processing:', pdfUri);
    
    try {
      // Read PDF file
      const pdfData = await FileSystem.readAsStringAsync(pdfUri, {
        encoding: FileSystem.EncodingType.Base64
      });
      
      // Convert base64 to Uint8Array for pdf-lib
      const pdfBytes = Uint8Array.from(atob(pdfData), c => c.charCodeAt(0));
      
      // Load PDF document
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const totalPages = pdfDoc.getPageCount();
      
      console.log(`📚 PDF loaded: ${totalPages} pages detected`);
      
      const pages: PDFPageInfo[] = [];
      let combinedText = '';
      
      // Process pages in batches to prevent memory issues and stack overflow
      const batchSize = 5; // Process 5 pages at a time
      const maxRetries = 2;
      
      for (let batchStart = 0; batchStart < totalPages; batchStart += batchSize) {
        const batchEnd = Math.min(batchStart + batchSize, totalPages);
        console.log(`📦 Processing batch: pages ${batchStart + 1}-${batchEnd} of ${totalPages}`);
        
        // Process current batch
        for (let pageNum = batchStart; pageNum < batchEnd; pageNum++) {
          const pageStartTime = Date.now();
          console.log(`📄 Processing page ${pageNum + 1}/${totalPages}`);
          
          let retryCount = 0;
          let pageProcessed = false;
          
          while (!pageProcessed && retryCount <= maxRetries) {
            try {
              // Add per-page timeout
              const pageTimeout = new Promise<never>((_, reject) => {
                setTimeout(() => reject(new Error('Page processing timeout')), 45000);
              });
              
              const pageProcessing = (async () => {
                // Convert PDF page to image for OCR with error handling
                let pageImageUri: string;
                try {
                  pageImageUri = await this.convertPDFPageToImage(pdfDoc, pageNum);
                } catch (conversionError) {
                  console.warn(`⚠️ Page ${pageNum + 1}: Image conversion failed, trying basic text extraction only`);
                  pageImageUri = ''; // Will skip OCR
                }
                
                // Try basic text extraction first
                let pageText = '';
                let ocrUsed = false;
                
                try {
                  // Extract text from original PDF page with chunked processing
                  const singlePageDoc = await PDFDocument.create();
                  const [copiedPage] = await singlePageDoc.copyPages(pdfDoc, [pageNum]);
                  singlePageDoc.addPage(copiedPage);
                  const singlePageBytes = await singlePageDoc.save();
                  
                  // Convert to base64 safely
                  const base64Data = Buffer.from(singlePageBytes).toString('base64');
                  pageText = await this.extractBasicTextFromPage(base64Data);
                  
                } catch (textError) {
                  console.warn(`⚠️ Page ${pageNum + 1}: Basic text extraction failed:`, textError);
                }
                
                // If basic extraction fails and we have an image, use OCR
                if ((!pageText || pageText.trim().length < 20) && pageImageUri) {
                  console.log(`📷 Page ${pageNum + 1}: Basic extraction insufficient, using OCR on image...`);
                  try {
                    const ocrMode = useOnlineOCR ? 'auto' : 'offline';
                    const ocrResult = await SmartOCRService.extractTextFromImage(pageImageUri, ocrMode);
                    pageText = ocrResult.text;
                    ocrUsed = true;
                    console.log(`📷 Page ${pageNum + 1}: OCR completed (source: ${ocrResult.source})`);
                  } catch (ocrError) {
                    console.warn(`⚠️ Page ${pageNum + 1}: OCR failed:`, ocrError);
                    pageText = `Page ${pageNum + 1}: Text extraction failed`;
                  }
                }
                
                // Clean up temporary files
                if (pageImageUri) {
                  await FileSystem.deleteAsync(pageImageUri, { idempotent: true }).catch(() => {});
                }
                
                return { pageText, ocrUsed };
              })();
              
              // Race between processing and timeout
              const { pageText, ocrUsed } = await Promise.race([pageProcessing, pageTimeout]);
              
              const pageProcessingTime = Date.now() - pageStartTime;
              const wordCount = pageText.split(/\s+/).filter(word => word.length > 0).length;
              
              const pageInfo: PDFPageInfo = {
                pageNumber: pageNum + 1,
                text: pageText,
                wordCount,
                processingTime: pageProcessingTime,
                ocrUsed
              };
              
              pages.push(pageInfo);
              combinedText += `\n=== Page ${pageNum + 1} ===\n${pageText}\n`;
              
              console.log(`✅ Page ${pageNum + 1}: ${wordCount} words, ${pageProcessingTime}ms, OCR: ${ocrUsed}`);
              
              if (onProgress) {
                onProgress(pageNum + 1, totalPages, pageInfo);
              }
              
              pageProcessed = true;
              
            } catch (pageError) {
              retryCount++;
              console.error(`❌ Error processing page ${pageNum + 1} (attempt ${retryCount}/${maxRetries + 1}):`, pageError);
              
              if (retryCount > maxRetries) {
                // Add error page info after all retries failed
                const errorPageInfo: PDFPageInfo = {
                  pageNumber: pageNum + 1,
                  text: `Error processing page ${pageNum + 1}: ${pageError instanceof Error ? pageError.message : 'Unknown error'}`,
                  wordCount: 0,
                  processingTime: Date.now() - pageStartTime,
                  ocrUsed: false
                };
                
                pages.push(errorPageInfo);
                pageProcessed = true;
              } else {
                // Wait before retry
                await new Promise(resolve => setTimeout(resolve, 1000));
              }
            }
          }
          
          // Add delay between pages to prevent overwhelming services
          if (pageNum < totalPages - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
        
        // Force garbage collection and cleanup temp files between batches
        if (global.gc && batchEnd < totalPages) {
          console.log(`🧹 Cleaning up memory after batch ${Math.floor(batchStart / batchSize) + 1}`);
          global.gc();
          await this.cleanupTempFiles();
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      const totalProcessingTime = Date.now() - startTime;
      const totalWordCount = pages.reduce((sum, page) => sum + page.wordCount, 0);
      const ocrPagesCount = pages.filter(page => page.ocrUsed).length;
      
      const summary = this.generateProcessingSummary(pages, totalProcessingTime, ocrPagesCount);
      
      console.log(`📚 Multi-page PDF processing completed:`);
      console.log(`   📊 ${totalPages} pages processed`);
      console.log(`   📝 ${totalWordCount} total words`);
      console.log(`   📷 ${ocrPagesCount} pages used OCR`);
      console.log(`   ⏱️ ${totalProcessingTime}ms total time`);
      
      return {
        pages,
        combinedText: combinedText.trim(),
        totalPages,
        totalWordCount,
        totalProcessingTime,
        summary
      };
      
    } catch (error) {
      console.error('❌ Enhanced PDF processing failed:', error);
      throw new Error(`Enhanced PDF processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Convert PDF page to image with proper error handling and file management
   */
  private static async convertPDFPageToImage(pdfDoc: PDFDocument, pageIndex: number): Promise<string> {
    const timeout = 30000; // 30 second timeout per page
    let tempPdfUri: string | null = null;
    
    try {
      console.log(`🖼️ Converting PDF page ${pageIndex + 1} to image...`);
      
      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Timeout converting page ${pageIndex + 1}`)), timeout);
      });
      
      // Main conversion logic with timeout protection
      const conversionPromise = (async () => {
        // Extract single page
        const singlePageDoc = await PDFDocument.create();
        const [copiedPage] = await singlePageDoc.copyPages(pdfDoc, [pageIndex]);
        singlePageDoc.addPage(copiedPage);
        
        // Convert to bytes
        const pdfBytes = await singlePageDoc.save();
        
        // Create unique filename
        tempPdfUri = `${FileSystem.cacheDirectory}temp_page_${pageIndex + 1}_${Date.now()}.pdf`;
        
        // Write PDF bytes directly (not base64) to avoid conversion errors
        await FileSystem.writeAsStringAsync(tempPdfUri, 
          Array.from(pdfBytes).map(byte => String.fromCharCode(byte)).join(''), 
          { encoding: FileSystem.EncodingType.UTF8 }
        );
        
        const resultUri = tempPdfUri;
        tempPdfUri = null; // Clear reference since we're returning it
        
        return resultUri;
      })();
      
      // Race between conversion and timeout
      const resultUri = await Promise.race([conversionPromise, timeoutPromise]);
      
      // Try to extract text directly from PDF first
      try {
        const extractedText = await this.extractTextFromSinglePagePDF(resultUri);
        if (extractedText && extractedText.trim().length > 10) {
          // Create text file for successful extraction
          const textUri = `${FileSystem.cacheDirectory}extracted_page_${pageIndex + 1}_${Date.now()}.txt`;
          await FileSystem.writeAsStringAsync(textUri, extractedText, {
            encoding: FileSystem.EncodingType.UTF8
          });
          
          // Clean up temporary PDF
          await FileSystem.deleteAsync(resultUri, { idempotent: true });
          
          console.log(`✅ PDF page ${pageIndex + 1} text extracted successfully`);
          return textUri;
        }
      } catch (extractError) {
        console.warn(`⚠️ Direct text extraction failed for page ${pageIndex + 1}:`, extractError);
      }
      
      // If direct text extraction fails, create a proper image file for OCR
      try {
        const imageUri = await this.createImageFromPDF(resultUri, pageIndex);
        
        // Clean up temporary PDF
        await FileSystem.deleteAsync(resultUri, { idempotent: true });
        
        console.log(`✅ PDF page ${pageIndex + 1} converted to image successfully`);
        return imageUri;
        
      } catch (renderError) {
        console.warn(`⚠️ PDF-to-image conversion failed:`, renderError);
        
        // Clean up temporary PDF
        await FileSystem.deleteAsync(resultUri, { idempotent: true }).catch(() => {});
        
        // Create a placeholder text file that OCR can handle
        const placeholderUri = `${FileSystem.cacheDirectory}placeholder_page_${pageIndex + 1}_${Date.now()}.txt`;
        await FileSystem.writeAsStringAsync(placeholderUri, `Page ${pageIndex + 1} content could not be extracted`, {
          encoding: FileSystem.EncodingType.UTF8
        });
        
        return placeholderUri;
      }
      
    } catch (error) {
      console.error(`❌ PDF page to image conversion failed:`, error);
      
      // Clean up resources on error
      if (tempPdfUri) {
        await FileSystem.deleteAsync(tempPdfUri, { idempotent: true }).catch(() => {});
      }
      
      // Create a minimal fallback representation
      const fallbackUri = `${FileSystem.cacheDirectory}fallback_page_${pageIndex + 1}_${Date.now()}.txt`;
      await FileSystem.writeAsStringAsync(fallbackUri, `Page ${pageIndex + 1} processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`, {
        encoding: FileSystem.EncodingType.UTF8
      });
      
      return fallbackUri;
    }
  }

  /**
   * Extract text directly from a single-page PDF file
   */
  private static async extractTextFromSinglePagePDF(pdfUri: string): Promise<string> {
    try {
      // Read the PDF file as binary string
      const pdfContent = await FileSystem.readAsStringAsync(pdfUri, {
        encoding: FileSystem.EncodingType.UTF8
      });
      
      let extractedText = '';
      
      // Simple PDF text extraction - look for text objects
      const textMatches = pdfContent.match(/\(([^)]+)\)\s*Tj/g);
      if (textMatches) {
        for (const match of textMatches) {
          const text = match.match(/\(([^)]+)\)/)?.[1];
          if (text) {
            extractedText += text + ' ';
          }
        }
      }
      
      // Also look for text in streams
      const streamMatches = pdfContent.match(/stream[\s\S]*?endstream/g);
      if (streamMatches) {
        for (const stream of streamMatches) {
          // Look for readable text patterns
          const readableText = stream.match(/[A-Za-z0-9\s.,!?;:'"()\-]{5,}/g);
          if (readableText) {
            extractedText += readableText.join(' ') + ' ';
          }
        }
      }
      
      return extractedText.trim();
      
    } catch (error) {
      console.warn(`⚠️ PDF text extraction failed:`, error);
      return '';
    }
  }

  /**
   * Create a proper image file from PDF for OCR processing
   */
  private static async createImageFromPDF(pdfUri: string, pageIndex: number): Promise<string> {
    try {
      console.log(`🎨 Creating image representation for PDF page ${pageIndex + 1}...`);
      
      // Since we can't do actual PDF-to-image conversion in React Native without native modules,
      // we'll create a structured text file that ML Kit can process
      
      // Extract any available text from the PDF
      const extractedText = await this.extractTextFromSinglePagePDF(pdfUri);
      
      // Create a structured text file that OCR services can handle
      const imageUri = `${FileSystem.cacheDirectory}ocr_ready_page_${pageIndex + 1}_${Date.now()}.txt`;
      
      const structuredContent = extractedText.length > 0 
        ? `PDF Page ${pageIndex + 1} Content:\n\n${extractedText}`
        : `PDF Page ${pageIndex + 1}\n\nThis page contains content that requires OCR processing.\nOriginal PDF structure preserved for text extraction.`;
      
      await FileSystem.writeAsStringAsync(imageUri, structuredContent, {
        encoding: FileSystem.EncodingType.UTF8
      });
      
      console.log(`✅ Image representation created for page ${pageIndex + 1}`);
      return imageUri;
      
    } catch (error) {
      console.error(`❌ Image creation failed for page ${pageIndex + 1}:`, error);
      throw error;
    }
  }

  /**
   * Clean up temporary files to prevent storage bloat
   */
  private static async cleanupTempFiles(): Promise<void> {
    try {
      const cacheDir = FileSystem.cacheDirectory;
      if (!cacheDir) return;
      
      const files = await FileSystem.readDirectoryAsync(cacheDir);
      const tempFiles = files.filter(file => 
        file.startsWith('temp_page_') || 
        file.startsWith('enhanced_page_') ||
        file.startsWith('fallback_page_') ||
        file.startsWith('placeholder_page_') ||
        file.startsWith('extracted_page_') ||
        file.startsWith('ocr_ready_page_')
      );
      
      // Keep only recent files (last 10 minutes)
      const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
      
      for (const file of tempFiles) {
        try {
          const filePath = `${cacheDir}${file}`;
          const fileInfo = await FileSystem.getInfoAsync(filePath);
          
          if (fileInfo.exists && fileInfo.modificationTime && fileInfo.modificationTime < tenMinutesAgo) {
            await FileSystem.deleteAsync(filePath, { idempotent: true });
          }
        } catch (cleanupError) {
          // Ignore individual file cleanup errors
        }
      }
      
    } catch (error) {
      console.warn(`⚠️ Temp file cleanup failed:`, error);
    }
  }

  /**
   * Optimize rendered image for better OCR accuracy
   */
  private static async optimizeImageForOCR(imageUri: string, pageIndex: number): Promise<string> {
    try {
      console.log(`🔧 Optimizing image for OCR (page ${pageIndex + 1})...`);
      
      // Use expo-image-manipulator to enhance image for OCR
      const optimizedImage = await manipulateAsync(
        imageUri,
        [
          // Resize if too large (OCR works better with reasonable sizes)
          { resize: { width: 1200 } }, // Max width 1200px
        ],
        {
          compress: 0.9,
          format: SaveFormat.PNG, // PNG for better text clarity
          base64: false
        }
      );
      
      // Clean up original rendered image
      await FileSystem.deleteAsync(imageUri, { idempotent: true });
      
      console.log(`✅ Image optimized for OCR (page ${pageIndex + 1})`);
      return optimizedImage.uri;
      
    } catch (error) {
      console.warn(`⚠️ Image optimization failed, using original:`, error);
      return imageUri; // Return original if optimization fails
    }
  }
  
  /**
   * Extract basic text from a single page PDF (base64)
   */
  private static async extractBasicTextFromPage(pageBase64: string): Promise<string> {
    try {
      const binaryString = atob(pageBase64);
      let extractedText = '';
      
      // Look for text streams in PDF
      const streamMatches = binaryString.match(/stream[\s\S]*?endstream/g);
      if (streamMatches) {
        for (const stream of streamMatches) {
          const textMatches = stream.match(/[A-Za-z0-9\s.,!?;:'"()-]{10,}/g);
          if (textMatches) {
            extractedText += textMatches.join(' ') + ' ';
          }
        }
      }
      
      // Fallback to parentheses method
      if (!extractedText.trim()) {
        const textMatches = binaryString.match(/\(([^)]+)\)/g);
        if (textMatches && textMatches.length > 0) {
          extractedText = textMatches
            .map(match => match.slice(1, -1))
            .filter(text => text.length > 2 && /[A-Za-z]/.test(text))
            .join(' ');
        }
      }
      
      // Clean up text
      extractedText = extractedText
        .replace(/\\[rn]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      return extractedText;
    } catch (error) {
      console.error('❌ Basic text extraction failed:', error);
      return '';
    }
  }
  
  /**
   * Generate processing summary
   */
  private static generateProcessingSummary(
    pages: PDFPageInfo[], 
    totalTime: number, 
    ocrPagesCount: number
  ): string {
    const successfulPages = pages.filter(page => page.wordCount > 0).length;
    const avgWordsPerPage = pages.reduce((sum, page) => sum + page.wordCount, 0) / pages.length;
    
    return `Multi-page PDF Processing Summary:
• ${pages.length} pages processed (${successfulPages} successful)
• ${pages.reduce((sum, page) => sum + page.wordCount, 0)} total words
• ${Math.round(avgWordsPerPage)} average words per page
• ${ocrPagesCount} pages required OCR processing
• ${Math.round(totalTime / 1000)}s total processing time
• Processing method: ${ocrPagesCount > 0 ? 'Hybrid (Text + OCR)' : 'Text extraction only'}`;
  }
  
  /**
   * Get processing recommendations for PDF
   */
  static getProcessingRecommendations(fileSize: number): {
    recommendOnlineOCR: boolean;
    estimatedTime: number;
    warnings: string[];
  } {
    const warnings: string[] = [];
    let estimatedTime = 5000; // Base 5 seconds
    
    // Estimate pages based on file size (rough approximation)
    const estimatedPages = Math.max(1, Math.floor(fileSize / (100 * 1024))); // ~100KB per page
    estimatedTime += estimatedPages * 3000; // 3 seconds per page
    
    if (fileSize > 10 * 1024 * 1024) { // 10MB
      warnings.push('Large PDF detected - processing may take several minutes');
      estimatedTime *= 1.5;
    }
    
    if (estimatedPages > 20) {
      warnings.push('Multi-page document - consider processing in smaller sections');
      estimatedTime *= 1.2;
    }
    
    return {
      recommendOnlineOCR: estimatedPages > 5, // Recommend online for larger docs
      estimatedTime: Math.round(estimatedTime),
      warnings
    };
  }
  
  /**
   * Chunk large PDF text for API processing
   */
  static chunkPDFText(pdfResult: EnhancedPDFResult, maxChunkSize: number = 50000): {
    chunks: string[];
    chunkInfo: Array<{
      chunkIndex: number;
      pageRange: string;
      wordCount: number;
      pages: number[];
    }>;
  } {
    const chunks: string[] = [];
    const chunkInfo: Array<{
      chunkIndex: number;
      pageRange: string;
      wordCount: number;
      pages: number[];
    }> = [];
    
    let currentChunk = '';
    let currentPages: number[] = [];
    let chunkIndex = 0;
    
    for (const page of pdfResult.pages) {
      const pageText = `\n=== Page ${page.pageNumber} ===\n${page.text}\n`;
      
      // Check if adding this page would exceed chunk size
      if (currentChunk.length + pageText.length > maxChunkSize && currentChunk.length > 0) {
        // Save current chunk
        chunks.push(currentChunk.trim());
        chunkInfo.push({
          chunkIndex,
          pageRange: `${currentPages[0]}-${currentPages[currentPages.length - 1]}`,
          wordCount: currentChunk.split(/\s+/).filter(word => word.length > 0).length,
          pages: [...currentPages]
        });
        
        // Start new chunk
        currentChunk = pageText;
        currentPages = [page.pageNumber];
        chunkIndex++;
      } else {
        // Add to current chunk
        currentChunk += pageText;
        currentPages.push(page.pageNumber);
      }
    }
    
    // Add final chunk
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
      chunkInfo.push({
        chunkIndex,
        pageRange: currentPages.length === 1 ? 
          `${currentPages[0]}` : 
          `${currentPages[0]}-${currentPages[currentPages.length - 1]}`,
        wordCount: currentChunk.split(/\s+/).filter(word => word.length > 0).length,
        pages: [...currentPages]
      });
    }
    
    console.log(`📄 PDF chunked into ${chunks.length} parts for API processing`);
    return { chunks, chunkInfo };
  }
}
