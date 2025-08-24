import { XMLParser } from 'fast-xml-parser';

export interface ParsedQuizQuestion {
  id: string;
  type: 'mcq' | 'true_false';
  question: string;
  options?: string[];
  correctAnswer: string;
  explanation?: string;
}

export interface QuizParsingResult {
  success: boolean;
  questions: ParsedQuizQuestion[];
  errors: string[];
  warnings: string[];
  totalQuestions: number;
  validQuestions: number;
}

/**
 * Service for parsing and validating quiz content from AI-generated text
 * Specifically designed to handle offline DOCX quiz generation issues
 */
export class QuizParsingService {
  
  /**
   * Parse and validate quiz content from AI-generated text
   */
  static async parseQuizFromText(
    quizText: string,
    expectedQuestionCount: number = 5
  ): Promise<QuizParsingResult> {
    try {
      console.log('📝 Parsing quiz content...');
      
      const result: QuizParsingResult = {
        success: false,
        questions: [],
        errors: [],
        warnings: [],
        totalQuestions: 0,
        validQuestions: 0
      };
      
      // Clean and normalize the quiz text
      const cleanedText = this.cleanQuizText(quizText);
      
      // Extract questions using multiple parsing strategies
      const extractedQuestions = await this.extractQuestions(cleanedText);
      result.totalQuestions = extractedQuestions.length;
      
      // Validate and fix each question
      for (const rawQuestion of extractedQuestions) {
        const validatedQuestion = await this.validateAndFixQuestion(rawQuestion);
        
        if (validatedQuestion.isValid) {
          result.questions.push(validatedQuestion.question);
          result.validQuestions++;
        } else {
          result.errors.push(`Question ${rawQuestion.id}: ${validatedQuestion.errors.join(', ')}`);
          
          // Try to auto-fix the question
          const fixedQuestion = await this.attemptQuestionFix(rawQuestion);
          if (fixedQuestion) {
            result.questions.push(fixedQuestion);
            result.validQuestions++;
            result.warnings.push(`Question ${rawQuestion.id}: Auto-fixed formatting issues`);
          }
        }
      }
      
      // Check if we have enough valid questions
      if (result.validQuestions < Math.ceil(expectedQuestionCount * 0.6)) {
        result.errors.push(`Insufficient valid questions: ${result.validQuestions}/${expectedQuestionCount} expected`);
      } else {
        result.success = true;
      }
      
      // Add warnings for common issues
      if (result.validQuestions < expectedQuestionCount) {
        result.warnings.push(`Generated ${result.validQuestions} valid questions out of ${expectedQuestionCount} requested`);
      }
      
      console.log(`✅ Quiz parsing completed: ${result.validQuestions}/${result.totalQuestions} valid questions`);
      return result;
      
    } catch (error) {
      console.error('❌ Quiz parsing failed:', error);
      return {
        success: false,
        questions: [],
        errors: [`Parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        warnings: [],
        totalQuestions: 0,
        validQuestions: 0
      };
    }
  }
  
  /**
   * Clean and normalize quiz text for better parsing
   */
  private static cleanQuizText(text: string): string {
    return text
      // Remove extra whitespace and normalize line breaks
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]+/g, ' ')
      // Fix common formatting issues
      .replace(/(\d+)\s*\.\s*/g, '$1. ') // Normalize question numbering
      .replace(/([A-D])\s*\.\s*/g, '$1. ') // Normalize option formatting
      .replace(/Answer\s*:\s*/gi, 'Answer: ') // Normalize answer format
      .replace(/Correct\s*Answer\s*:\s*/gi, 'Correct Answer: ') // Normalize correct answer format
      .trim();
  }
  
  /**
   * Extract individual questions from cleaned text
   */
  private static async extractQuestions(text: string): Promise<Array<{
    id: string;
    rawText: string;
    type?: 'mcq' | 'true_false';
  }>> {
    const questions: Array<{
      id: string;
      rawText: string;
      type?: 'mcq' | 'true_false';
    }> = [];
    
    // Split by question numbers (1., 2., 3., etc.)
    const questionBlocks = text.split(/(?=\d+\.\s)/);
    
    for (let i = 0; i < questionBlocks.length; i++) {
      const block = questionBlocks[i].trim();
      if (!block || !block.match(/^\d+\./)) continue;
      
      const questionId = `q${i + 1}`;
      
      // Determine question type
      let type: 'mcq' | 'true_false' | undefined;
      if (block.includes('A.') && block.includes('B.')) {
        type = 'mcq';
      } else if (block.toLowerCase().includes('true') || block.toLowerCase().includes('false')) {
        type = 'true_false';
      }
      
      questions.push({
        id: questionId,
        rawText: block,
        type
      });
    }
    
    return questions;
  }
  
  /**
   * Validate and fix a single question
   */
  private static async validateAndFixQuestion(rawQuestion: {
    id: string;
    rawText: string;
    type?: 'mcq' | 'true_false';
  }): Promise<{
    isValid: boolean;
    question: ParsedQuizQuestion;
    errors: string[];
  }> {
    const errors: string[] = [];
    const lines = rawQuestion.rawText.split('\n').map(line => line.trim()).filter(line => line);
    
    if (lines.length === 0) {
      return {
        isValid: false,
        question: {} as ParsedQuizQuestion,
        errors: ['Empty question block']
      };
    }
    
    // Extract question text (first line after number)
    const questionMatch = lines[0].match(/^\d+\.\s*(.+)$/);
    if (!questionMatch) {
      errors.push('Invalid question format');
    }
    
    const questionText = questionMatch ? questionMatch[1] : lines[0];
    
    if (rawQuestion.type === 'mcq') {
      return this.validateMCQQuestion(rawQuestion.id, questionText, lines, errors);
    } else if (rawQuestion.type === 'true_false') {
      return this.validateTrueFalseQuestion(rawQuestion.id, questionText, lines, errors);
    } else {
      // Try to auto-detect type
      if (lines.some(line => line.match(/^[A-D]\./))) {
        return this.validateMCQQuestion(rawQuestion.id, questionText, lines, errors);
      } else {
        return this.validateTrueFalseQuestion(rawQuestion.id, questionText, lines, errors);
      }
    }
  }
  
  /**
   * Validate MCQ question
   */
  private static validateMCQQuestion(
    id: string,
    questionText: string,
    lines: string[],
    errors: string[]
  ): {
    isValid: boolean;
    question: ParsedQuizQuestion;
    errors: string[];
  } {
    const options: string[] = [];
    let correctAnswer = '';
    
    // Extract options
    for (const line of lines) {
      const optionMatch = line.match(/^([A-D])\.\s*(.+)$/);
      if (optionMatch) {
        options.push(optionMatch[2]);
      }
      
      // Extract correct answer
      const answerMatch = line.match(/(?:Correct\s*)?Answer\s*:\s*([A-D])/i);
      if (answerMatch) {
        correctAnswer = answerMatch[1].toUpperCase();
      }
    }
    
    // Validate MCQ requirements
    if (options.length < 2) {
      errors.push('MCQ must have at least 2 options');
    }
    
    if (!correctAnswer) {
      errors.push('Missing correct answer');
    } else if (!['A', 'B', 'C', 'D'].includes(correctAnswer)) {
      errors.push('Invalid correct answer format');
    } else if (options.length > 0 && correctAnswer.charCodeAt(0) - 65 >= options.length) {
      errors.push('Correct answer refers to non-existent option');
    }
    
    const question: ParsedQuizQuestion = {
      id,
      type: 'mcq',
      question: questionText,
      options,
      correctAnswer
    };
    
    return {
      isValid: errors.length === 0,
      question,
      errors
    };
  }
  
  /**
   * Validate True/False question
   */
  private static validateTrueFalseQuestion(
    id: string,
    questionText: string,
    lines: string[],
    errors: string[]
  ): {
    isValid: boolean;
    question: ParsedQuizQuestion;
    errors: string[];
  } {
    let correctAnswer = '';
    
    // Extract answer
    for (const line of lines) {
      const answerMatch = line.match(/Answer\s*:\s*(True|False)/i);
      if (answerMatch) {
        correctAnswer = answerMatch[1].toLowerCase() === 'true' ? 'True' : 'False';
      }
    }
    
    // Validate True/False requirements
    if (!correctAnswer) {
      errors.push('Missing True/False answer');
    }
    
    const question: ParsedQuizQuestion = {
      id,
      type: 'true_false',
      question: questionText,
      correctAnswer
    };
    
    return {
      isValid: errors.length === 0,
      question,
      errors
    };
  }
  
  /**
   * Attempt to auto-fix common question formatting issues
   */
  private static async attemptQuestionFix(rawQuestion: {
    id: string;
    rawText: string;
    type?: 'mcq' | 'true_false';
  }): Promise<ParsedQuizQuestion | null> {
    try {
      console.log(`🔧 Attempting to fix question ${rawQuestion.id}...`);
      
      const lines = rawQuestion.rawText.split('\n').map(line => line.trim()).filter(line => line);
      
      // Extract question text
      const questionMatch = lines[0].match(/^\d+\.\s*(.+)$/);
      const questionText = questionMatch ? questionMatch[1] : lines[0];
      
      // Try to fix MCQ questions
      if (lines.some(line => line.match(/^[A-D]/))) {
        const options: string[] = [];
        let correctAnswer = '';
        
        // Extract options with flexible formatting
        for (const line of lines) {
          const optionMatch = line.match(/^([A-D])[\.\)\s]*(.+)$/);
          if (optionMatch && optionMatch[2].trim()) {
            options.push(optionMatch[2].trim());
          }
        }
        
        // Try to find answer in various formats
        const fullText = rawQuestion.rawText.toLowerCase();
        if (fullText.includes('answer: a') || fullText.includes('correct: a')) correctAnswer = 'A';
        else if (fullText.includes('answer: b') || fullText.includes('correct: b')) correctAnswer = 'B';
        else if (fullText.includes('answer: c') || fullText.includes('correct: c')) correctAnswer = 'C';
        else if (fullText.includes('answer: d') || fullText.includes('correct: d')) correctAnswer = 'D';
        
        // If no explicit answer, guess the first option
        if (!correctAnswer && options.length > 0) {
          correctAnswer = 'A';
          console.log(`⚠️ No correct answer found for ${rawQuestion.id}, defaulting to A`);
        }
        
        if (options.length >= 2 && correctAnswer) {
          return {
            id: rawQuestion.id,
            type: 'mcq',
            question: questionText,
            options,
            correctAnswer
          };
        }
      }
      
      // Try to fix True/False questions
      const fullText = rawQuestion.rawText.toLowerCase();
      if (fullText.includes('true') || fullText.includes('false')) {
        let correctAnswer = '';
        
        if (fullText.includes('answer: true') || fullText.includes('true')) correctAnswer = 'True';
        else if (fullText.includes('answer: false') || fullText.includes('false')) correctAnswer = 'False';
        
        if (correctAnswer) {
          return {
            id: rawQuestion.id,
            type: 'true_false',
            question: questionText,
            correctAnswer
          };
        }
      }
      
      return null;
      
    } catch (error) {
      console.error(`❌ Failed to fix question ${rawQuestion.id}:`, error);
      return null;
    }
  }
  
  /**
   * Generate enhanced quiz prompt for better offline generation
   */
  static generateEnhancedQuizPrompt(
    text: string,
    questionCount: number = 5,
    questionType: 'mcq' | 'true_false' | 'mixed' = 'mixed'
  ): string {
    const basePrompt = `Create exactly ${questionCount} high-quality ${questionType === 'mcq' ? 'multiple choice' : questionType === 'true_false' ? 'true/false' : 'mixed'} questions based STRICTLY on the provided text content.`;
    
    const formatInstructions = questionType === 'mcq' 
      ? `Format each question EXACTLY as:
1. [Question text]
A. [Option A]
B. [Option B]
C. [Option C]
D. [Option D]
Correct Answer: A

`
      : questionType === 'true_false'
      ? `Format each question EXACTLY as:
1. [Statement to evaluate]
Answer: True

`
      : `Format questions EXACTLY as shown:

For multiple choice:
1. [Question text]
A. [Option A]
B. [Option B]
C. [Option C]
D. [Option D]
Correct Answer: A

For true/false:
1. [Statement to evaluate]
Answer: True

`;
    
    return `${basePrompt}

CRITICAL FORMATTING RULES:
- Number questions as 1., 2., 3., etc.
- For MCQ: Include exactly 4 options (A, B, C, D)
- Always include "Correct Answer:" or "Answer:" line
- Use only content from the provided text
- Do not add extra explanations or comments

${formatInstructions}

Text content:
${text}`;
  }
  
  /**
   * Validate quiz result and provide improvement suggestions
   */
  static validateQuizResult(result: QuizParsingResult): {
    isAcceptable: boolean;
    suggestions: string[];
  } {
    const suggestions: string[] = [];
    
    if (result.validQuestions === 0) {
      suggestions.push('No valid questions found. Try regenerating with clearer formatting instructions.');
    } else if (result.validQuestions < result.totalQuestions * 0.8) {
      suggestions.push('Many questions had formatting issues. Consider improving the AI prompt.');
    }
    
    if (result.errors.length > 0) {
      suggestions.push('Fix formatting errors: ensure proper question numbering, options, and answers.');
    }
    
    const mcqCount = result.questions.filter(q => q.type === 'mcq').length;
    const tfCount = result.questions.filter(q => q.type === 'true_false').length;
    
    if (mcqCount === 0 && tfCount === 0) {
      suggestions.push('No questions were properly categorized. Check question format.');
    }
    
    return {
      isAcceptable: result.success && result.validQuestions >= Math.ceil(result.totalQuestions * 0.6),
      suggestions
    };
  }
}
