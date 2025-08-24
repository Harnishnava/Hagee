import * as FileSystem from 'expo-file-system';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';

export interface OfflineDOCXResult {
  text: string;
  wordCount: number;
  processingTime: number;
  method: 'manual_xml' | 'zip_extraction';
  warnings: string[];
}

/**
 * Pure offline DOCX text parser - no OCR required
 * Extracts text directly from DOCX XML structure
 */
export class OfflineDOCXParser {
  
  /**
   * Extract text from DOCX using manual XML parsing (no mammoth dependency)
   */
  static async extractTextOffline(docxUri: string): Promise<OfflineDOCXResult> {
    const startTime = Date.now();
    console.log('📄 Starting offline DOCX text extraction (no OCR):', docxUri);
    
    const warnings: string[] = [];
    
    try {
      // Method 1: Try manual ZIP + XML extraction
      const manualResult = await this.extractWithManualXML(docxUri);
      
      if (manualResult.text.length > 50) {
        console.log('✅ Manual XML extraction successful:', manualResult.text.length, 'characters');
        
        return {
          text: this.cleanExtractedText(manualResult.text),
          wordCount: manualResult.text.split(/\s+/).filter(word => word.length > 0).length,
          processingTime: Date.now() - startTime,
          method: 'manual_xml',
          warnings: manualResult.warnings
        };
      } else {
        warnings.push('Manual XML extraction returned insufficient text');
      }
      
      // Method 2: Fallback to basic ZIP text search
      console.log('🔄 Trying fallback ZIP text extraction...');
      const zipResult = await this.extractWithZipSearch(docxUri);
      
      return {
        text: this.cleanExtractedText(zipResult.text),
        wordCount: zipResult.text.split(/\s+/).filter(word => word.length > 0).length,
        processingTime: Date.now() - startTime,
        method: 'zip_extraction',
        warnings: [...warnings, ...zipResult.warnings]
      };
      
    } catch (error) {
      console.error('❌ All offline DOCX extraction methods failed:', error);
      
      return {
        text: `Failed to extract text from DOCX document using offline methods.

Error: ${error instanceof Error ? error.message : 'Unknown error'}

This DOCX file may:
1. Be corrupted or password-protected
2. Have a non-standard format
3. Contain mostly images or complex formatting

Suggestions:
- Try online processing mode
- Convert to PDF format
- Export as plain text from Word`,
        wordCount: 0,
        processingTime: Date.now() - startTime,
        method: 'manual_xml',
        warnings: [...warnings, `Extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`]
      };
    }
  }
  
  /**
   * Extract text using manual ZIP and XML parsing
   */
  private static async extractWithManualXML(docxUri: string): Promise<{
    text: string;
    warnings: string[];
  }> {
    const warnings: string[] = [];
    
    try {
      console.log('🔧 Using manual ZIP + XML extraction...');
      
      // Read DOCX as binary data
      const fileContent = await FileSystem.readAsStringAsync(docxUri, {
        encoding: FileSystem.EncodingType.Base64
      });
      
      // Convert to array buffer
      const binaryString = atob(fileContent);
      const arrayBuffer = new ArrayBuffer(binaryString.length);
      const uint8Array = new Uint8Array(arrayBuffer);
      
      for (let i = 0; i < binaryString.length; i++) {
        uint8Array[i] = binaryString.charCodeAt(i);
      }
      
      // Load as ZIP
      const zip = await JSZip.loadAsync(arrayBuffer);
      
      // Check if required files exist
      const docXmlFile = zip.files['word/document.xml'];
      if (!docXmlFile) {
        warnings.push('word/document.xml not found - may not be a valid DOCX');
        throw new Error('Invalid DOCX structure');
      }
      
      // Extract document XML
      const docXml = await docXmlFile.async('string');
      console.log('📄 Document XML extracted, length:', docXml.length);
      
      // Parse XML and extract text
      const extractedText = await this.parseDocumentXML(docXml);
      
      if (extractedText.length < 10) {
        warnings.push('Very little text found in document');
      }
      
      return {
        text: extractedText,
        warnings
      };
      
    } catch (error) {
      console.error('❌ Manual XML extraction failed:', error);
      throw error;
    }
  }
  
  /**
   * Parse DOCX document.xml and extract text content using fast-xml-parser
   */
  private static async parseDocumentXML(xmlString: string): Promise<string> {
    try {
      const parser = new XMLParser({
        ignoreAttributes: false,
        parseAttributeValue: false,
        parseTagValue: false,
        trimValues: true
      });
      
      const result = parser.parse(xmlString);
      let extractedText = '';
      
      // Navigate through DOCX XML structure
      // Structure: document -> body -> paragraphs -> runs -> text
      const extractText = (obj: any): void => {
        if (typeof obj === 'string') {
          extractedText += obj + ' ';
        } else if (Array.isArray(obj)) {
          obj.forEach(extractText);
        } else if (obj && typeof obj === 'object') {
          // Look for text content in DOCX elements
          if (obj['w:t']) {
            if (typeof obj['w:t'] === 'string') {
              extractedText += obj['w:t'] + ' ';
            } else {
              extractText(obj['w:t']);
            }
          }
          
          // Look for tab characters
          if (obj['w:tab']) {
            extractedText += '\t';
          }
          
          // Look for line breaks
          if (obj['w:br']) {
            extractedText += '\n';
          }
          
          // Recurse through other elements
          Object.values(obj).forEach(extractText);
        }
      };
      
      extractText(result);
      
      console.log('📄 XML text extraction completed:', extractedText.length, 'characters');
      return extractedText;
      
    } catch (error) {
      console.error('❌ XML parsing error:', error);
      throw error;
    }
  }
  
  /**
   * Fallback: Search for text patterns in ZIP files
   */
  private static async extractWithZipSearch(docxUri: string): Promise<{
    text: string;
    warnings: string[];
  }> {
    const warnings: string[] = [];
    
    try {
      console.log('🔍 Using ZIP text search fallback...');
      
      const fileContent = await FileSystem.readAsStringAsync(docxUri, {
        encoding: FileSystem.EncodingType.Base64
      });
      
      const binaryString = atob(fileContent);
      const arrayBuffer = new ArrayBuffer(binaryString.length);
      const uint8Array = new Uint8Array(arrayBuffer);
      
      for (let i = 0; i < binaryString.length; i++) {
        uint8Array[i] = binaryString.charCodeAt(i);
      }
      
      const zip = await JSZip.loadAsync(arrayBuffer);
      let allText = '';
      
      // Search through all XML files for text content
      const xmlFiles = Object.keys(zip.files).filter(name => name.endsWith('.xml'));
      
      for (const fileName of xmlFiles) {
        try {
          const fileContent = await zip.files[fileName].async('string');
          
          // Extract text between XML tags using regex
          const textMatches = fileContent.match(/>([^<]+)</g);
          if (textMatches) {
            const fileText = textMatches
              .map(match => match.slice(1, -1)) // Remove > and <
              .filter(text => text.trim().length > 2 && /[A-Za-z]/.test(text))
              .join(' ');
            
            if (fileText.length > 10) {
              allText += fileText + ' ';
            }
          }
        } catch (error) {
          warnings.push(`Failed to process ${fileName}`);
        }
      }
      
      if (allText.length < 50) {
        warnings.push('ZIP search found very little text content');
      }
      
      return {
        text: allText,
        warnings
      };
      
    } catch (error) {
      console.error('❌ ZIP search fallback failed:', error);
      throw error;
    }
  }
  
  /**
   * Clean and format extracted text
   */
  private static cleanExtractedText(text: string): string {
    return text
      .replace(/\s+/g, ' ')           // Multiple spaces to single
      .replace(/\n+/g, '\n')          // Multiple newlines to single  
      .replace(/\t+/g, ' ')           // Tabs to spaces
      .replace(/[^\w\s\n.,!?;:'"()-]/g, ' ') // Remove special chars but keep punctuation
      .trim();
  }
  
  /**
   * Validate if file is accessible for offline processing
   */
  static async validateOfflineAccess(docxUri: string): Promise<{
    accessible: boolean;
    fileSize: number;
    error?: string;
  }> {
    try {
      const fileInfo = await FileSystem.getInfoAsync(docxUri);
      
      if (!fileInfo.exists) {
        return {
          accessible: false,
          fileSize: 0,
          error: 'File does not exist'
        };
      }
      
      const fileSize = fileInfo.size || 0;
      
      // Test if we can read the file
      await FileSystem.readAsStringAsync(docxUri, {
        encoding: FileSystem.EncodingType.Base64
      });
      
      return {
        accessible: true,
        fileSize
      };
      
    } catch (error) {
      return {
        accessible: false,
        fileSize: 0,
        error: `Access error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
}
