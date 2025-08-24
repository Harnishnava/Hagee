import { LlamaRNGGUFService, ModelMetadata, InferenceOptions as LlamaInferenceOptions, InferenceResult as LlamaInferenceResult } from './LlamaRNGGUFService';
import { GGUFModelInfo, InferenceOptions, InferenceResult, ModelLoadProgress } from './ReactNativeGGUFService';

/**
 * GGUF Service wrapper for React Native
 * 
 * This service provides REAL GGUF model inference capabilities for React Native
 * using actual GGUF file processing and inference via llama.rn
 */

// Re-export types for compatibility
export type { GGUFModelInfo, InferenceOptions, InferenceResult, ModelLoadProgress };

export interface GenerationOptions {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  repeatPenalty?: number;
  seed?: number;
  stop?: string[];
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

class GGUFService {
  private static instance: GGUFService;
  private realService: LlamaRNGGUFService;

  private constructor() {
    this.realService = new LlamaRNGGUFService();
  }

  public static getInstance(): GGUFService {
    if (!GGUFService.instance) {
      GGUFService.instance = new GGUFService();
    }
    return GGUFService.instance;
  }

  /**
   * Initialize the GGUF service (no-op for llama.rn)
   */
  public async initialize(): Promise<void> {
    // llama.rn doesn't require explicit initialization
    console.log('✅ GGUF Service initialized with llama.rn');
  }

  /**
   * Load GGUF model from local storage
   */
  public async loadModelMetadata(modelPath: string, onProgress?: (progress: ModelLoadProgress) => void): Promise<GGUFModelInfo> {
    // Extract model name from path
    const modelName = modelPath.split('/').pop() || 'Unknown Model';
    
    // Load the model using llama.rn
    await this.realService.loadModel(modelPath, modelName);
    
    // Get model info and convert to expected format
    const modelInfo = this.realService.getLoadedModelInfo();
    if (!modelInfo) {
      throw new Error('Failed to load model metadata');
    }

    // Convert to GGUFModelInfo format
    return {
      id: modelName,
      name: modelInfo.name,
      localPath: modelPath,
      size: 0, // Size not available from llama.rn
      isLoaded: true,
      metadata: {
        architecture: modelInfo.metadata.architecture,
        parameters: modelInfo.metadata.parameters,
        quantization: modelInfo.metadata.quantization,
        contextLength: modelInfo.metadata.contextLength
      }
    };
  }

  /**
   * Load model (compatibility method)
   */
  public async loadModel(modelPath: string): Promise<void> {
    const modelName = modelPath.split('/').pop() || 'Unknown Model';
    await this.realService.loadModel(modelPath, modelName);
  }

  /**
   * Generate text using the loaded model
   */
  public async generateText(
    prompt: string,
    options: InferenceOptions = {},
    onPartialResponse?: (partial: string) => void
  ): Promise<InferenceResult> {
    // Convert options to llama.rn format
    const llamaOptions: LlamaInferenceOptions = {
      systemPrompt: options.systemPrompt,
      maxTokens: options.maxTokens,
      temperature: options.temperature,
      topP: options.topP,
      topK: options.topK,
      repeatPenalty: options.repeatPenalty
    };

    const result = await this.realService.generateText(prompt, llamaOptions, onPartialResponse);
    
    // Convert result to expected format
    return {
      text: result.text,
      tokensGenerated: result.tokensGenerated,
      inferenceTime: result.inferenceTime,
      finishReason: 'stop' as const // Default finish reason
    };
  }

  /**
   * Generate quiz from text with enhanced parsing and validation
   */
  public async generateQuizFromText(
    text: string,
    options: { questionCount?: number; questionType?: string } = {}
  ): Promise<string> {
    const { questionCount = 5, questionType = 'mixed' } = options;
    
    // Import QuizParsingService dynamically to avoid circular dependencies
    const { QuizParsingService } = await import('./QuizParsingService');
    
    // Use enhanced prompt for better formatting
    const enhancedPrompt = QuizParsingService.generateEnhancedQuizPrompt(
      text,
      questionCount,
      questionType as 'mcq' | 'true_false' | 'mixed'
    );

    console.log('🧠 Generating quiz with offline model...');
    const result = await this.generateText(enhancedPrompt, {
      maxTokens: 2000,
      temperature: 0.6,
      systemPrompt: "You are a quiz generator that creates questions strictly based on provided document content. Follow the exact formatting requirements provided."
    });
    
    // Parse and validate the generated quiz
    console.log('📝 Parsing and validating generated quiz...');
    const parseResult = await QuizParsingService.parseQuizFromText(result.text, questionCount);
    
    if (!parseResult.success) {
      console.warn('⚠️ Quiz parsing failed, attempting regeneration...');
      
      // Try once more with even more explicit formatting
      const retryPrompt = `${enhancedPrompt}

CRITICAL: Follow the EXACT format shown above. Each question MUST have:
- Question number (1., 2., etc.)
- Question text
- Options A, B, C, D (for MCQ) or True/False statement
- "Correct Answer:" or "Answer:" line

Do not add any extra text or explanations.`;

      const retryResult = await this.generateText(retryPrompt, {
        maxTokens: 2000,
        temperature: 0.4, // Lower temperature for more consistent formatting
        systemPrompt: "You are a quiz generator. Follow the exact formatting requirements. Do not deviate from the specified format."
      });
      
      const retryParseResult = await QuizParsingService.parseQuizFromText(retryResult.text, questionCount);
      
      if (retryParseResult.success) {
        console.log('✅ Quiz regeneration successful');
        return this.formatParsedQuiz(retryParseResult);
      } else {
        console.warn('⚠️ Quiz regeneration still failed, returning best attempt');
        return retryResult.text;
      }
    }
    
    console.log(`✅ Quiz generated successfully: ${parseResult.validQuestions}/${parseResult.totalQuestions} valid questions`);
    return this.formatParsedQuiz(parseResult);
  }

  /**
   * Format parsed quiz questions into readable text
   */
  private formatParsedQuiz(parseResult: any): string {
    let formattedQuiz = '';
    
    parseResult.questions.forEach((question: any, index: number) => {
      formattedQuiz += `${index + 1}. ${question.question}\n`;
      
      if (question.type === 'mcq' && question.options) {
        question.options.forEach((option: string, optIndex: number) => {
          const letter = String.fromCharCode(65 + optIndex); // A, B, C, D
          formattedQuiz += `${letter}. ${option}\n`;
        });
        formattedQuiz += `Correct Answer: ${question.correctAnswer}\n`;
      } else if (question.type === 'true_false') {
        formattedQuiz += `Answer: ${question.correctAnswer}\n`;
      }
      
      formattedQuiz += '\n';
    });
    
    if (parseResult.warnings.length > 0) {
      formattedQuiz += `\nWarnings:\n${parseResult.warnings.join('\n')}\n`;
    }
    
    return formattedQuiz.trim();
  }

  /**
   * Check if a model is currently loaded
   */
  public isModelLoaded(): boolean {
    return this.realService.isModelLoaded();
  }

  /**
   * Get information about the loaded model
   */
  public getLoadedModel(): GGUFModelInfo | null {
    const modelInfo = this.realService.getLoadedModelInfo();
    if (!modelInfo) return null;

    return {
      id: modelInfo.name,
      name: modelInfo.name,
      localPath: '', // Path not stored in llama.rn service
      size: 0, // Size not available from llama.rn
      isLoaded: true,
      metadata: {
        architecture: modelInfo.metadata.architecture,
        parameters: modelInfo.metadata.parameters,
        quantization: modelInfo.metadata.quantization,
        contextLength: modelInfo.metadata.contextLength
      }
    };
  }

  /**
   * Unload the current model to free memory
   */
  public async unloadModel(): Promise<void> {
    return this.realService.unloadModel();
  }

  /**
   * Get current model path (compatibility method)
   */
  public getCurrentModelPath(): string | null {
    return this.realService.getCurrentModelPath();
  }

  /**
   * Get model requirements and system info (simplified for real service)
   */
  public getModelRequirements() {
    return {
      minMemoryMB: 2048,
      recommendedMemoryMB: 4096,
      supportedFormats: ['GGUF'],
      maxModelSizeMB: 8192
    };
  }
}

export { GGUFService };
export default GGUFService;
