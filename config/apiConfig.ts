import Constants from 'expo-constants';

export interface APIConfig {
  groq: {
    apiKey: string;
    baseUrl: string;
  };
  mistral: {
    apiKey: string;
    baseUrl: string;
  };
  openai?: {
    apiKey: string;
  };
}

// Get API configuration from environment variables
export const getAPIConfig = (): APIConfig => {
  // For React Native/Expo, environment variables must be prefixed with EXPO_PUBLIC_
  // and are available at build time through process.env
  const config = {
    groq: {
      apiKey: process.env.EXPO_PUBLIC_GROQ_API_KEY || '',
      baseUrl: process.env.EXPO_PUBLIC_GROQ_BASE_URL || 'https://api.groq.com/openai/v1',
    },
    mistral: {
      apiKey: process.env.EXPO_PUBLIC_MISTRAL_API_KEY || '',
      baseUrl: process.env.EXPO_PUBLIC_MISTRAL_BASE_URL || 'https://api.mistral.ai/v1',
    },
    openai: {
      apiKey: process.env.EXPO_PUBLIC_OPENAI_API_KEY || '',
    },
  };

  // Debug logging to verify environment variables are loaded
  console.log('🔧 Environment variables loaded:');
  console.log('🔑 Groq API Key:', config.groq.apiKey ? `${config.groq.apiKey.substring(0, 8)}...` : 'MISSING');
  console.log('🌐 Groq Base URL:', config.groq.baseUrl);
  console.log('🔑 Mistral API Key:', config.mistral.apiKey ? `${config.mistral.apiKey.substring(0, 8)}...` : 'MISSING');

  return config;
};

// Validate if required API keys are present
export const validateAPIKeys = (): { isValid: boolean; missing: string[] } => {
  const config = getAPIConfig();
  const missing: string[] = [];

  if (!config.groq.apiKey) missing.push('Groq API Key');
  if (!config.mistral.apiKey) missing.push('Mistral API Key');

  return {
    isValid: missing.length === 0,
    missing,
  };
};
