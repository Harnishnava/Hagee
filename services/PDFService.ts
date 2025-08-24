import * as FileSystem from 'expo-file-system';

export class PDFService {
  /**
   * Extract text from PDF with OCR fallback for better results
   */
  static async extractTextFromPDF(pdfUri: string, useOnlineOCR: boolean = false): Promise<string> {
    console.log('📋 Starting PDF text extraction for:', pdfUri);
    
    try {
      // Read PDF as binary data
      const pdfData = await FileSystem.readAsStringAsync(pdfUri, {
        encoding: FileSystem.EncodingType.Base64
      });
      
      console.log('📋 PDF data length:', pdfData.length);
      
      // Convert base64 to binary string for basic text extraction
      const binaryString = atob(pdfData);
      
      // Try basic text extraction first
      let extractedText = '';
      
      // Look for text streams in PDF
      const streamMatches = binaryString.match(/stream[\s\S]*?endstream/g);
      if (streamMatches) {
        for (const stream of streamMatches) {
          // Look for readable text patterns
          const textMatches = stream.match(/[A-Za-z0-9\s.,!?;:'"()-]{10,}/g);
          if (textMatches) {
            extractedText += textMatches.join(' ') + ' ';
          }
        }
      }
      
      // Also try the old parentheses method as backup
      if (!extractedText.trim()) {
        const textMatches = binaryString.match(/\(([^)]+)\)/g);
        if (textMatches && textMatches.length > 0) {
          extractedText = textMatches
            .map(match => match.slice(1, -1))
            .filter(text => text.length > 2 && /[A-Za-z]/.test(text))
            .join(' ');
        }
      }
      
      // Clean up extracted text
      extractedText = extractedText
        .replace(/\\[rn]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      console.log('📋 Basic PDF extraction completed, text length:', extractedText.length);
      
      // Check if extraction was successful (readable text)
      const readableTextRatio = (extractedText.match(/[A-Za-z]/g) || []).length / extractedText.length;
      
      if (extractedText.length > 50 && readableTextRatio > 0.5) {
        console.log('📋 PDF text preview:', extractedText.substring(0, 200) + '...');
        console.log('📄 PDF text extracted:', extractedText.length, 'characters');
        return extractedText;
      } else {
        console.log('📋 Basic extraction failed, falling back to OCR...');
        
        // Fallback to OCR for better text extraction
        if (useOnlineOCR) {
          const { OnlineOCRService } = await import('./OnlineOCRService');
          const ocrResult = await OnlineOCRService.extractText(pdfUri);
          console.log('📄 OCR fallback completed:', ocrResult.text.length, 'characters');
          return ocrResult.text;
        } else {
          const { MistralOCRService } = await import('./MistralOCRService');
          const ocrText = await MistralOCRService.extractTextFromImage(pdfUri);
          console.log('📄 OCR fallback completed:', ocrText.length, 'characters');
          return ocrText;
        }
      }
      
    } catch (error) {
      console.error('❌ PDF text extraction failed:', error);
      throw new Error(`PDF text extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Alternative: Convert PDF to image and use OCR
   * This would require additional libraries like react-native-pdf-to-image
   */
  static async convertPDFToImageAndOCR(pdfUri: string): Promise<string> {
    console.log('📋 PDF to Image conversion not implemented yet');
    console.log('📋 Consider using libraries like react-native-pdf-to-image for better results');
    
    return 'PDF to image conversion not yet implemented. Please manually convert PDF pages to images for OCR processing.';
  }

  /**
   * Check if file is a PDF
   */
  static isPDF(mimeType: string, fileName: string): boolean {
    return mimeType.includes('pdf') || fileName.toLowerCase().endsWith('.pdf');
  }
}
