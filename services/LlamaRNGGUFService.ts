import { LlamaContext, initLlama } from "llama.rn";

export interface ModelMetadata {
  name: string;
  metadata: {
    architecture: string;
    parameters: number;
    quantization: string;
    contextLength: number;
  };
}

export interface InferenceOptions {
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  repeatPenalty?: number;
  stopSequences?: string[];
}

export interface InferenceResult {
  text: string;
  tokensGenerated: number;
  inferenceTime: number;
}

/**
 * LlamaRN GGUF Service - Direct interface with llama.rn
 *
 * This service provides the actual GGUF model inference using llama.rn
 * It handles the low-level model loading and text generation
 */
export class LlamaRNGGUFService {
  private llamaContext: LlamaContext | null = null;
  private isInitialized: boolean = false;
  private currentModelPath: string | null = null;
  private loadedModelInfo: ModelMetadata | null = null;

  constructor() {}

  /**
   * Initialize llama.rn (if needed)
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // llama.rn doesn't require explicit initialization
      this.isInitialized = true;
      console.log("✅ LlamaRN GGUF Service initialized");
    } catch (error) {
      console.error("❌ Failed to initialize LlamaRN:", error);
      throw new Error("Failed to initialize GGUF service");
    }
  }

  /**
   * Load GGUF model using llama.rn
   */
  public async loadModel(modelPath: string, modelName: string): Promise<void> {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      // Unload current model if exists
      if (this.llamaContext) {
        await this.unloadModel();
      }

      console.log("🔄 Loading GGUF model:", modelPath);

      // Load model with mobile-optimized parameters
      this.llamaContext = await initLlama({
        model: modelPath,
        use_mlock: false,
        use_mmap: true,
        n_ctx: 2048,
        n_batch: 512,
        n_threads: 4,
        n_gpu_layers: 0, // CPU inference for mobile
      });

      this.currentModelPath = modelPath;

      // Extract model metadata from filename and path
      this.loadedModelInfo = this.extractModelMetadata(modelPath, modelName);

      console.log("✅ GGUF model loaded successfully:", modelName);
    } catch (error) {
      console.error("❌ Failed to load GGUF model:", error);
      this.llamaContext = null;
      this.currentModelPath = null;
      this.loadedModelInfo = null;
      throw new Error(
        `Failed to load model: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Generate text using the loaded GGUF model
   */
  public async generateText(
    prompt: string,
    options: InferenceOptions = {},
    onPartialResponse?: (partial: string) => void
  ): Promise<InferenceResult> {
    if (!this.llamaContext) {
      throw new Error("No model loaded. Please load a model first.");
    }

    const startTime = Date.now();

    try {
      console.log("🤖 Generating text with GGUF model...");

      // Prepare the full prompt with system message if provided
      let fullPrompt = prompt;
      if (options.systemPrompt) {
        fullPrompt = `System: ${options.systemPrompt}\n\nUser: ${prompt}\n\nAssistant:`;
      }

      // Generate text using llama.rn
      const result = await this.llamaContext.completion({
        prompt: fullPrompt,
        n_predict: options.maxTokens || 512,
        temperature: options.temperature || 0.7,
        top_p: options.topP || 0.9,
        top_k: options.topK || 40,
        repeat_penalty: options.repeatPenalty || 1.1,
        stop: options.stopSequences || [],
      } as any, (data) => {
          // Handle partial responses
          if (onPartialResponse && data.token) {
            onPartialResponse(data.token);
          }
        }
      );

      const endTime = Date.now();
      const inferenceTime = endTime - startTime;

      const generatedText = result.text || "";
      const tokensGenerated = this.estimateTokenCount(generatedText);

      console.log("✅ Text generation completed:", {
        tokensGenerated,
        inferenceTime: `${inferenceTime}ms`,
        textLength: generatedText.length,
      });

      return {
        text: generatedText,
        tokensGenerated,
        inferenceTime,
      };
    } catch (error) {
      console.error("❌ Text generation failed:", error);
      throw new Error(
        `Text generation failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Unload the current model to free memory
   */
  public async unloadModel(): Promise<void> {
    if (this.llamaContext) {
      try {
        console.log("🔄 Unloading GGUF model...");
        await this.llamaContext.release();
        this.llamaContext = null;
        this.currentModelPath = null;
        this.loadedModelInfo = null;
        console.log("✅ GGUF model unloaded successfully");
      } catch (error) {
        console.error("❌ Error unloading model:", error);
        // Force cleanup even if release fails
        this.llamaContext = null;
        this.currentModelPath = null;
        this.loadedModelInfo = null;
      }
    }
  }

  /**
   * Check if a model is currently loaded
   */
  public isModelLoaded(): boolean {
    return this.llamaContext !== null;
  }

  /**
   * Get information about the loaded model
   */
  public getLoadedModelInfo(): ModelMetadata | null {
    return this.loadedModelInfo;
  }

  /**
   * Get the current model path
   */
  public getCurrentModelPath(): string | null {
    return this.currentModelPath;
  }

  // Private helper methods

  /**
   * Extract model metadata from filename and path
   */
  private extractModelMetadata(
    modelPath: string,
    modelName: string
  ): ModelMetadata {
    const fileName = modelPath.split("/").pop()?.toLowerCase() || "";
    const metadata: ModelMetadata["metadata"] = {
      architecture: "Unknown",
      parameters: 0,
      quantization: "Unknown",
      contextLength: 2048,
    };

    // Detect architecture
    if (fileName.includes("phi")) {
      metadata.architecture = "Phi-3";
      metadata.parameters = 3800000000; // 3.8B
      metadata.contextLength = 4096;
    } else if (fileName.includes("qwen")) {
      metadata.architecture = "Qwen";
      if (fileName.includes("0.5b")) {
        metadata.parameters = 500000000; // 0.5B
      } else if (fileName.includes("1.5b")) {
        metadata.parameters = 1500000000; // 1.5B
      }
      metadata.contextLength = 2048;
    } else if (fileName.includes("llama")) {
      metadata.architecture = "Llama";
      metadata.contextLength = 4096;
    } else if (fileName.includes("gemma")) {
      metadata.architecture = "Gemma";
      metadata.contextLength = 8192;
    }

    // Detect quantization
    if (fileName.includes("q4_k_m")) {
      metadata.quantization = "Q4_K_M (4-bit)";
    } else if (fileName.includes("q4_0")) {
      metadata.quantization = "Q4_0 (4-bit)";
    } else if (fileName.includes("q8_0")) {
      metadata.quantization = "Q8_0 (8-bit)";
    } else if (fileName.includes("f16")) {
      metadata.quantization = "F16 (16-bit float)";
    } else if (fileName.includes("f32")) {
      metadata.quantization = "F32 (32-bit float)";
    }

    return {
      name: modelName,
      metadata,
    };
  }

  /**
   * Estimate token count from text
   */
  private estimateTokenCount(text: string): number {
    // Rough estimation: ~4 characters per token for most models
    return Math.ceil(text.length / 4);
  }
}
