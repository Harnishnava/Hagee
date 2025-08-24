import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ModelService, ModelInfo, DownloadProgress } from '@/services/ModelService';
import { GGUFService } from '@/services/GGUFService';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface ModelContextType {
  availableModels: ModelInfo[];
  downloadedModels: ModelInfo[];
  downloadingModels: Map<string, number>;
  availableSpace: number;
  isLoading: boolean;
  error: string | null;
  authToken: string | null;
  currentLoadedModel: ModelInfo | null;
  
  // Actions
  downloadModel: (modelInfo: ModelInfo, authToken?: string) => Promise<string>;
  deleteModel: (modelId: string) => Promise<void>;
  cancelDownload: (modelId: string) => Promise<void>;
  refreshModels: () => Promise<void>;
  setAuthToken: (token: string | null) => void;
  loadModel: (modelId: string) => Promise<void>;
  unloadModel: () => Promise<void>;
  clearError: () => void;
}

const ModelContext = createContext<ModelContextType | undefined>(undefined);

interface ModelProviderProps {
  children: ReactNode;
}

export const ModelProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [downloadedModels, setDownloadedModels] = useState<ModelInfo[]>([]);
  const [downloadingModels, setDownloadingModels] = useState<Map<string, number>>(new Map());
  const [availableSpace, setAvailableSpace] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [currentLoadedModel, setCurrentLoadedModel] = useState<ModelInfo | null>(null);

  // Service instances
  const modelService = ModelService.getInstance();
  const ggufService = GGUFService.getInstance();

  // Initialize context
  useEffect(() => {
    initializeContext();
  }, []);

  const initializeContext = async () => {
    try {
      setIsLoading(true);
      await refreshModels();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize model context');
    } finally {
      setIsLoading(false);
    }
  };

  const refreshModels = async () => {
    try {
      // Get available models
      const available = modelService.getAvailableModels();
      
      // Get downloaded models with metadata
      const downloaded = await modelService.getDownloadedModels();
      
      // Update available models with download status
      const updatedAvailable = available.map((model: ModelInfo) => {
        const downloadedModel = downloaded.find((d: ModelInfo) => d.id === model.id);
        return downloadedModel ? { ...model, ...downloadedModel } : model;
      });

      // Get available storage space
      const space = await modelService.getAvailableSpace();

      setAvailableModels(updatedAvailable);
      setDownloadedModels(downloaded);
      setAvailableSpace(space);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh models');
    }
  };

  const downloadModel = async (modelInfo: ModelInfo, token?: string): Promise<string> => {
    try {
      setError(null);
      
      // Add to downloading models
      setDownloadingModels(prev => new Map(prev.set(modelInfo.id, 0)));

      const localPath = await modelService.downloadModel(
        modelInfo,
        (progress: DownloadProgress) => {
          setDownloadingModels(prev => {
            const newMap = new Map(prev);
            newMap.set(modelInfo.id, Math.round(progress.progress * 100));
            return newMap;
          });
        },
        token || authToken || undefined
      );

      // Remove from downloading models
      setDownloadingModels(prev => {
        const newMap = new Map(prev);
        newMap.delete(modelInfo.id);
        return newMap;
      });

      // Refresh models to update UI
      await refreshModels();

      return localPath;
    } catch (err) {
      // Remove from downloading models on error
      setDownloadingModels(prev => {
        const newMap = new Map(prev);
        newMap.delete(modelInfo.id);
        return newMap;
      });
      
      const errorMessage = err instanceof Error ? err.message : 'Download failed';
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  };

  const deleteModel = async (modelId: string): Promise<void> => {
    try {
      setError(null);
      
      // If this model is currently loaded, unload it first
      if (currentLoadedModel?.id === modelId) {
        await unloadModel();
      }

      await modelService.deleteModel(modelId);
      await refreshModels();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete model';
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  };

  const cancelDownload = async (modelId: string): Promise<void> => {
    try {
      await modelService.cancelDownload(modelId);
      
      // Remove from downloading models
      setDownloadingModels(prev => {
        const newMap = new Map(prev);
        newMap.delete(modelId);
        return newMap;
      });
      
      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to cancel download';
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  };

  const loadModel = async (modelId: string): Promise<void> => {
    try {
      setError(null);
      
      const modelPath = await modelService.getModelPath(modelId);
      if (!modelPath) {
        throw new Error('Model not found or not downloaded');
      }

      // Find model info
      const modelInfo = availableModels.find(m => m.id === modelId);
      if (!modelInfo) {
        throw new Error('Model information not found');
      }

      // Here you would integrate with your GGUF service
      // Load model into GGUFService
      await ggufService.loadModel(modelPath);
      
      // Set the loaded model state
      setCurrentLoadedModel(modelInfo);
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load model';
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  };

  const unloadModel = async (): Promise<void> => {
    try {
      setError(null);
      
      // Unload model from GGUFService
      await ggufService.unloadModel();
      
      setCurrentLoadedModel(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to unload model';
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  };

  const clearError = () => {
    setError(null);
  };

  const contextValue: ModelContextType = {
    availableModels,
    downloadedModels,
    downloadingModels,
    availableSpace,
    isLoading,
    error,
    authToken,
    currentLoadedModel,
    downloadModel,
    deleteModel,
    cancelDownload,
    refreshModels,
    setAuthToken,
    loadModel,
    unloadModel,
    clearError,
  };

  return (
    <ModelContext.Provider value={contextValue}>
      {children}
    </ModelContext.Provider>
  );
};

export const useModel = (): ModelContextType => {
  const context = useContext(ModelContext);
  if (context === undefined) {
    throw new Error('useModel must be used within a ModelProvider');
  }
  return context;
};
