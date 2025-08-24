import { getAPIConfig } from '@/config/apiConfig';

export interface GroqModel {
  id: string;
  name: string;
  description: string;
  contextLength: number;
  provider: 'groq';
}

export interface GroqChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GroqChatResponse {
  id: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class GroqService {
  private static readonly AVAILABLE_MODELS: GroqModel[] = [
    {
      id: 'llama-3.1-405b-reasoning',
      name: 'Llama 3.1 405B',
      description: 'Most capable model for complex reasoning',
      contextLength: 131072,
      provider: 'groq',
    },
    {
      id: 'llama-3.1-70b-versatile',
      name: 'Llama 3.1 70B',
      description: 'Balanced performance and speed',
      contextLength: 131072,
      provider: 'groq',
    },
    {
      id: 'llama-3.1-8b-instant',
      name: 'Llama 3.1 8B',
      description: 'Fast responses for quick tasks',
      contextLength: 131072,
      provider: 'groq',
    },
    {
      id: 'mixtral-8x7b-32768',
      name: 'Mixtral 8x7B',
      description: 'Excellent for multilingual tasks',
      contextLength: 32768,
      provider: 'groq',
    },
    {
      id: 'gemma2-9b-it',
      name: 'Gemma 2 9B',
      description: 'Google\'s efficient instruction-tuned model',
      contextLength: 8192,
      provider: 'groq',
    },
    {
      id: 'openai/gpt-oss-20b',
      name: 'GPT OSS 20B',
      description: 'OpenAI\'s open-source model for general tasks',
      contextLength: 32768,
      provider: 'groq',
    },
    {
      id: 'qwen/qwen3-32b',
      name: 'Qwen 3 32B',
      description: 'Alibaba\'s multilingual model with strong reasoning',
      contextLength: 32768,
      provider: 'groq',
    },
    {
      id: 'meta-llama/llama-guard-4-12b',
      name: 'Llama Guard 4 12B',
      description: 'Meta\'s safety-focused model for content moderation',
      contextLength: 8192,
      provider: 'groq',
    },
    {
      id: 'deepseek-ai/deepseek-r1-distill-llama-70b',
      name: 'DeepSeek R1 Distill 70B',
      description: 'DeepSeek\'s reasoning model with strong analytical capabilities',
      contextLength: 131072,
      provider: 'groq',
    },
    {
      id: 'deepseek-ai/deepseek-r1-distill-qwen-32b',
      name: 'DeepSeek R1 Distill 32B',
      description: 'Efficient DeepSeek model for balanced performance',
      contextLength: 32768,
      provider: 'groq',
    },
    {
      id: 'deepseek-ai/deepseek-r1-distill-qwen-14b',
      name: 'DeepSeek R1 Distill 14B',
      description: 'Compact DeepSeek model for fast inference',
      contextLength: 32768,
      provider: 'groq',
    },
  ];

  /**
   * Get list of available Groq models
   */
  static getAvailableModels(): GroqModel[] {
    return this.AVAILABLE_MODELS;
  }

  /**
   * Generate quiz from text using Groq API with enhanced parsing and validation
   */
  static async generateQuizFromText(
    text: string,
    questionCount: number = 5,
    questionType: 'mcq' | 'true_false' | 'mixed' = 'mixed',
    modelId: string = 'llama-3.1-70b-versatile'
  ): Promise<string> {
    try {
      console.log('🧠 Generating quiz with Groq API...');
      console.log('📊 Request details:', {
        textLength: text.length,
        questionCount,
        questionType,
        model: modelId
      });

      // Import QuizParsingService dynamically to avoid circular dependencies
      const { QuizParsingService } = await import('./QuizParsingService');

      // Chunk text if too large (Groq has token limits)
      const maxChunkSize = 15000; // Conservative limit for context
      let processedText = text;
      
      if (text.length > maxChunkSize) {
        console.log('📄 Text too large, chunking for processing...');
        processedText = text.substring(0, maxChunkSize) + '\n\n[Content truncated for processing]';
        console.log(`📄 Using first ${maxChunkSize} characters of ${text.length} total`);
      }

      // Use enhanced prompt for better formatting
      const enhancedPrompt = QuizParsingService.generateEnhancedQuizPrompt(
        processedText,
        questionCount,
        questionType
      );

      const systemPrompt = 'You are an expert quiz generator. Follow the exact formatting requirements provided. Create high-quality questions based strictly on the provided text content.';
      const userPrompt = enhancedPrompt;

      console.log('📝 Request payload preview:', {
        model: modelId,
        messageCount: 2,
        textLength: text.length,
        processedTextLength: processedText.length
      });

      const { getAPIConfig } = await import('../config/apiConfig');
      const config = getAPIConfig();
      
      const response = await fetch(`${config.groq.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.groq.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelId,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          max_tokens: 4000,
          temperature: 0.7,
          top_p: 0.9,
        }),
      });

      console.log('📡 Response status:', response.status);
      console.log('📡 Response headers:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unable to read error response');
        console.log('❌ Error response body:', errorText);
        
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { message: errorText };
        }
        
        throw new Error(`Groq API error: ${response.status} ${response.statusText}. ${errorData.error?.message || errorData.message || errorText}`);
      }

      const data: GroqChatResponse = await response.json();
      console.log('✅ Groq response received, content length:', data.choices[0]?.message?.content?.length || 0);
      
      return data.choices[0]?.message?.content || '';
    } catch (error) {
      console.error('🚫 Groq quiz generation failed:', error);
      console.error('🚫 Error type:', (error as Error).constructor.name);
      console.error('🚫 Error message:', (error as Error).message);
      
      // Check if it's a network connectivity issue
      if ((error as Error).message.includes('Network request failed')) {
        console.error('🌐 Network connectivity issue detected');
        console.error('🌐 Possible causes: No internet, CORS, firewall, or DNS issues');
      }
      
      throw error;
    }
  }

  /**
   * Generate study notes from text
   */
  static async generateStudyNotes(
    text: string,
    modelId: string = 'llama-3.1-8b-instant'
  ): Promise<string> {
    const config = getAPIConfig();
    
    if (!config.groq.apiKey) {
      throw new Error('Groq API key not configured');
    }

    const systemPrompt = `You are an expert study assistant. Create comprehensive study notes from the provided text. 
    Format the notes with:
    - Key concepts and definitions
    - Important facts and figures
    - Main topics organized hierarchically
    - Summary points
    
    Make the notes clear, concise, and easy to review.`;

    try {
      const response = await fetch(`${config.groq.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.groq.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelId,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Create study notes from this text:\n\n${text}` }
          ],
          max_tokens: 4000,
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        throw new Error(`Groq API error: ${response.status} ${response.statusText}`);
      }

      const data: GroqChatResponse = await response.json();
      return data.choices[0]?.message?.content || '';
    } catch (error) {
      console.error('Groq study notes generation failed:', error);
      throw error;
    }
  }

  /**
   * Test basic network connectivity
   */
  static async testNetworkConnectivity(): Promise<{ success: boolean; details: string }> {
    console.log('🔍 Testing network connectivity...');
    
    try {
      // Test basic internet connectivity first
      const testResponse = await fetch('https://httpbin.org/get', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!testResponse.ok) {
        return { success: false, details: `Internet test failed: ${testResponse.status}` };
      }
      
      console.log('✅ Basic internet connectivity: OK');
      
      // Test Groq API endpoint accessibility
      const config = getAPIConfig();
      const groqResponse = await fetch(`${config.groq.baseUrl}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${config.groq.apiKey}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('📡 Groq API response status:', groqResponse.status);
      
      if (groqResponse.ok) {
        return { success: true, details: 'Network connectivity and API access OK' };
      } else {
        const errorText = await groqResponse.text().catch(() => 'Unable to read response');
        return { success: false, details: `Groq API test failed: ${groqResponse.status} - ${errorText}` };
      }
      
    } catch (error) {
      console.error('🚫 Network test error:', error);
      return { 
        success: false, 
        details: `Network error: ${(error as Error).message}` 
      };
    }
  }

  /**
   * Test API connection
   */
  static async testConnection(): Promise<boolean> {
    try {
      const response = await this.generateQuizFromText('Test text for API connection', 1, 'mcq');
      return response.length > 0;
    } catch (error) {
      console.error('Groq connection test failed:', error);
      return false;
    }
  }

  /**
   * Build system prompt based on question type and count
   */
  private static buildSystemPrompt(
    questionType: 'mcq' | 'true_false' | 'mixed',
    questionCount: number
  ): string {
    const basePrompt = `You are an expert quiz generator. Create exactly ${questionCount} high-quality ${questionType === 'mcq' ? 'multiple choice' : questionType === 'true_false' ? 'true/false' : 'mixed'} questions based on the provided text.`;

    switch (questionType) {
      case 'mcq':
        return `${basePrompt}
        
        Create diverse multiple choice questions including:
        - Direct knowledge questions
        - "Which statement is true?" questions
        - "Which of the following is correct?" questions
        - Application and analysis questions
        
        Format each question as:
        1. [Question text]
        A. [Option A]
        B. [Option B] 
        C. [Option C]
        D. [Option D]
        Correct Answer: A
        
        Make sure each question tests important concepts from the text. Include variety in question types.`;
        
      case 'true_false':
        return `${basePrompt}
        
        Format each question as:
        1. [True/False statement]
        Answer: [True/False]
        
        Create statements that test key facts and concepts.`;
        
      case 'mixed':
        return `${basePrompt}
        
        Create a mix of multiple choice and true/false questions.
        
        For multiple choice questions, format as:
        1. [Question text]
        A. [Option A]
        B. [Option B]
        C. [Option C] 
        D. [Option D]
        Correct Answer: [A/B/C/D]
        
        For true/false questions, format as:
        1. [True/False statement]
        Answer: [True/False]`;
        
      default:
        return basePrompt;
    }
  }
}
