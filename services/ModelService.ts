import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface ModelInfo {
  id: string;
  name: string;
  size: number;
  sizeDisplay: string;
  huggingFaceUrl: string;
  filename: string;
  description: string;
  quantization: string;
  isDownloaded?: boolean;
  downloadProgress?: number;
  localPath?: string;
}

export interface DownloadProgress {
  totalBytesWritten: number;
  totalBytesExpectedToWrite: number;
  progress: number;
}

export class ModelService {
  private static instance: ModelService;
  private modelsDirectory: string;
  private downloadCallbacks: Map<string, (progress: DownloadProgress) => void> = new Map();

  private constructor() {
    this.modelsDirectory = `${FileSystem.documentDirectory}models/`;
    this.ensureModelsDirectoryExists();
  }

  public static getInstance(): ModelService {
    if (!ModelService.instance) {
      ModelService.instance = new ModelService();
    }
    return ModelService.instance;
  }

  // Pre-configured mobile-optimized models for study material processing
  public getAvailableModels(): ModelInfo[] {
    return [
      {
        id: 'qwen2-0.5b-instruct-q4',
        name: 'Qwen2 0.5B Instruct Q4_K_M',
        size: 367001600, // ~350MB
        sizeDisplay: '350MB',
        huggingFaceUrl: 'https://huggingface.co/Qwen/Qwen2-0.5B-Instruct-GGUF/resolve/main/qwen2-0_5b-instruct-q4_k_m.gguf',
        filename: 'qwen2-0_5b-instruct-q4_k_m.gguf',
        description: 'Compact model optimized for quiz generation and text processing',
        quantization: 'Q4_K_M'
      },
      {
        id: 'tinyllama-1.1b-chat-q4',
        name: 'TinyLlama 1.1B Chat Q4_K_M',
        size: 681574400, // ~650MB
        sizeDisplay: '650MB',
        huggingFaceUrl: 'https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.q4_k_m.gguf',
        filename: 'tinyllama-1.1b-chat-v1.0.q4_k_m.gguf',
        description: 'Balanced model for conversational AI and content analysis',
        quantization: 'Q4_K_M'
      },
      {
        id: 'llama-3.2-1b-instruct-q4',
        name: 'Llama 3.2 1B Instruct Q4_K_M',
        size: 734003200, // ~700MB
        sizeDisplay: '700MB',
        huggingFaceUrl: 'https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf',
        filename: 'Llama-3.2-1B-Instruct-Q4_K_M.gguf',
        description: 'Advanced instruction-following model for complex quiz generation',
        quantization: 'Q4_K_M'
      },
      {
        id: 'phi-3-mini-4k-instruct-q4',
        name: 'Phi-3 Mini 4K Instruct Q4_K_M',
        size: 2411724800, // ~2.3GB
        sizeDisplay: '2.3GB',
        huggingFaceUrl: 'https://huggingface.co/microsoft/Phi-3-mini-4k-instruct-gguf/resolve/main/Phi-3-mini-4k-instruct-q4.gguf',
        filename: 'Phi-3-mini-4k-instruct-q4.gguf',
        description: 'High-performance model for detailed content analysis and quiz creation',
        quantization: 'Q4_K_M'
      },
      {
        id: 'gemma-2-2b-instruct-q4',
        name: 'Gemma 2 2B Instruct Q4_K_M',
        size: 1610612736, // ~1.5GB
        sizeDisplay: '1.5GB',
        huggingFaceUrl: 'https://huggingface.co/bartowski/gemma-2-2b-it-GGUF/resolve/main/gemma-2-2b-it-Q4_K_M.gguf',
        filename: 'gemma-2-2b-it-Q4_K_M.gguf',
        description: 'Google\'s efficient model for educational content processing',
        quantization: 'Q4_K_M'
      },
      {
        id: 'mistral-7b-instruct-q4',
        name: 'Mistral 7B Instruct Q4_K_M',
        size: 4368709632, // ~4.1GB
        sizeDisplay: '4.1GB',
        huggingFaceUrl: 'https://huggingface.co/TheBloke/Mistral-7B-Instruct-v0.2-GGUF/resolve/main/mistral-7b-instruct-v0.2.Q4_K_M.gguf',
        filename: 'mistral-7b-instruct-v0.2.Q4_K_M.gguf',
        description: 'Premium model for comprehensive study material analysis',
        quantization: 'Q4_K_M'
      }
    ];
  }

  private async ensureModelsDirectoryExists(): Promise<void> {
    const dirInfo = await FileSystem.getInfoAsync(this.modelsDirectory);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(this.modelsDirectory, { intermediates: true });
    }
  }

  public async getAvailableSpace(): Promise<number> {
    try {
      const diskSpace = await FileSystem.getFreeDiskStorageAsync();
      return diskSpace;
    } catch (error) {
      console.error('Error getting available space:', error);
      return 0;
    }
  }

  public async getDownloadedModels(): Promise<ModelInfo[]> {
    const availableModels = this.getAvailableModels();
    const downloadedModels: ModelInfo[] = [];

    for (const model of availableModels) {
      try {
        const metadata = await AsyncStorage.getItem(`model_${model.id}`);
        if (metadata) {
          const parsedMetadata = JSON.parse(metadata);
          if (parsedMetadata.isDownloaded) {
            downloadedModels.push({
              ...model,
              ...parsedMetadata
            });
          }
        }
      } catch (error) {
        console.error(`Error loading metadata for model ${model.id}:`, error);
      }
    }

    return downloadedModels;
  }

  public async isModelDownloaded(modelId: string): Promise<boolean> {
    try {
      const metadata = await AsyncStorage.getItem(`model_${modelId}`);
      if (metadata) {
        const parsedMetadata = JSON.parse(metadata);
        return parsedMetadata.isDownloaded === true;
      }
      return false;
    } catch (error) {
      console.error(`Error checking if model ${modelId} is downloaded:`, error);
      return false;
    }
  }

  public async validateModelUrl(url: string): Promise<boolean> {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      return response.ok;
    } catch (error) {
      console.error('Error validating model URL:', error);
      return false;
    }
  }

  public async downloadModel(
    modelInfo: ModelInfo,
    onProgress?: (progress: DownloadProgress) => void,
    authToken?: string
  ): Promise<string> {
    const localPath = `${this.modelsDirectory}${modelInfo.filename}`;
    
    // Check if already downloaded
    if (await this.isModelDownloaded(modelInfo.id)) {
      throw new Error('Model is already downloaded');
    }

    // Check available space
    const availableSpace = await this.getAvailableSpace();
    if (availableSpace < modelInfo.size * 1.1) { // 10% buffer
      throw new Error('Insufficient storage space');
    }

    // Validate URL
    if (!(await this.validateModelUrl(modelInfo.huggingFaceUrl))) {
      throw new Error('Model URL is not accessible');
    }

    // Register progress callback
    if (onProgress) {
      this.downloadCallbacks.set(modelInfo.id, onProgress);
    }

    try {
      // Prepare headers
      const headers: Record<string, string> = {};
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      // Start download
      const downloadResumable = FileSystem.createDownloadResumable(
        modelInfo.huggingFaceUrl,
        localPath,
        { headers },
        (downloadProgress) => {
          const progress: DownloadProgress = {
            totalBytesWritten: downloadProgress.totalBytesWritten,
            totalBytesExpectedToWrite: downloadProgress.totalBytesExpectedToWrite,
            progress: downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite
          };
          
          const callback = this.downloadCallbacks.get(modelInfo.id);
          if (callback) {
            callback(progress);
          }
        }
      );

      const result = await downloadResumable.downloadAsync();
      
      if (!result) {
        throw new Error('Download failed');
      }

      // Validate downloaded file
      const fileInfo = await FileSystem.getInfoAsync(result.uri);
      if (!fileInfo.exists || (fileInfo.size && fileInfo.size < modelInfo.size * 0.95)) {
        await FileSystem.deleteAsync(result.uri, { idempotent: true });
        throw new Error('Downloaded file is corrupted or incomplete');
      }

      // Save metadata
      const metadata = {
        ...modelInfo,
        isDownloaded: true,
        downloadProgress: 100,
        localPath: result.uri,
        downloadedAt: new Date().toISOString()
      };

      await AsyncStorage.setItem(`model_${modelInfo.id}`, JSON.stringify(metadata));

      // Clean up callback
      this.downloadCallbacks.delete(modelInfo.id);

      return result.uri;
    } catch (error) {
      // Clean up on error
      this.downloadCallbacks.delete(modelInfo.id);
      await FileSystem.deleteAsync(localPath, { idempotent: true });
      throw error;
    }
  }

  public async deleteModel(modelId: string): Promise<void> {
    try {
      const metadata = await AsyncStorage.getItem(`model_${modelId}`);
      if (metadata) {
        const parsedMetadata = JSON.parse(metadata);
        if (parsedMetadata.localPath) {
          await FileSystem.deleteAsync(parsedMetadata.localPath, { idempotent: true });
        }
        await AsyncStorage.removeItem(`model_${modelId}`);
      }
    } catch (error) {
      console.error(`Error deleting model ${modelId}:`, error);
      throw error;
    }
  }

  public async getModelPath(modelId: string): Promise<string | null> {
    try {
      const metadata = await AsyncStorage.getItem(`model_${modelId}`);
      if (metadata) {
        const parsedMetadata = JSON.parse(metadata);
        return parsedMetadata.localPath || null;
      }
      return null;
    } catch (error) {
      console.error(`Error getting model path for ${modelId}:`, error);
      return null;
    }
  }

  public async cancelDownload(modelId: string): Promise<void> {
    this.downloadCallbacks.delete(modelId);
    const model = this.getAvailableModels().find(m => m.id === modelId);
    if (model) {
      const localPath = `${this.modelsDirectory}${model.filename}`;
      await FileSystem.deleteAsync(localPath, { idempotent: true });
    }
  }

  public formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

export const modelService = ModelService.getInstance();
