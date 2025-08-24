import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Modal,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { useModel } from '@/contexts/ModelContext';
import { useQuiz } from '@/contexts/QuizContext';
import { useFocusEffect } from '@react-navigation/native';
import { GGUFService } from '@/services/GGUFService';
import { GroqService } from '@/services/GroqService';
import { MistralOCRService } from '@/services/MistralOCRService';
import { PDFService } from '@/services/PDFService';
import { OnlineOCRService } from '@/services/OnlineOCRService';
import { OCRService } from '@/services/OCRService';
import { DocumentProcessingService, BatchProcessingResult } from '@/services/DocumentProcessingService';
import { validateAPIKeys } from '@/config/apiConfig';
import { UploadedDocument } from './index';
import { GameColors } from '@/constants/GameColors';

interface Quiz {
  id: string;
  title: string;
  questions: QuizQuestion[];
  createdAt: Date;
  sourceDocument?: string;
}

interface QuizQuestion {
  id: string;
  question: string;
  type: 'mcq' | 'true_false';
  options?: string[];
  correctAnswer: string;
  explanation?: string;
}

const DOCUMENTS_STORAGE_KEY = '@hagee_documents';

export default function ExploreScreen() {
  const [uploadedDocuments, setUploadedDocuments] = useState<UploadedDocument[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [mode, setMode] = useState<'online' | 'offline'>('offline');
  const [questionCount, setQuestionCount] = useState('5');
  const [questionType, setQuestionType] = useState<'mcq'>('mcq');
  const [selectedModel, setSelectedModel] = useState<string>('llama-3.1-8b-instant');
  const [networkTestResult, setNetworkTestResult] = useState<string>('');
  const [customText, setCustomText] = useState<string>('');
  const [expandedQuiz, setExpandedQuiz] = useState<string | null>(null);
  const [showDocumentSelector, setShowDocumentSelector] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<UploadedDocument | null>(null);
  const [selectedDocuments, setSelectedDocuments] = useState<UploadedDocument[]>([]);
  const [processingMode, setProcessingMode] = useState<'online' | 'offline'>('offline');
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [showBatchSelector, setShowBatchSelector] = useState(false);
  const [batchProcessingResult, setBatchProcessingResult] = useState<BatchProcessingResult | null>(null);
  
  // Animation refs
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const bounceAnim = useRef(new Animated.Value(1)).current;

  const { currentLoadedModel } = useModel();
  const { quizzes, addQuiz } = useQuiz();
  const { isValid: hasValidAPIKeys } = validateAPIKeys();

  // Get available Groq models
  const availableModels = GroqService.getAvailableModels();

  // Helper function to get model display name
  const getModelDisplayName = (modelId: string) => {
    const model = availableModels.find(m => m.id === modelId);
    return model ? model.name : modelId;
  };

  // Load documents from storage
  useEffect(() => {
    loadDocuments();
    startPulseAnimation();
  }, []);

  const startPulseAnimation = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  const animateGenerate = () => {
    Animated.sequence([
      Animated.timing(bounceAnim, {
        toValue: 0.95,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(bounceAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  };

  // Refresh documents when tab becomes focused
  useFocusEffect(
    React.useCallback(() => {
      loadDocuments();
    }, [])
  );

  const isImageDocument = (mimeType: string): boolean => {
    return mimeType.startsWith('image/');
  };

  const loadDocuments = async () => {
    try {
      const stored = await AsyncStorage.getItem(DOCUMENTS_STORAGE_KEY);
      if (stored) {
        const docs = JSON.parse(stored).map((doc: any) => ({
          ...doc,
          uploadedAt: new Date(doc.uploadedAt)
        }));
        setUploadedDocuments(docs);
      }
    } catch (error) {
      console.error('Error loading documents:', error);
    }
  };

  const generateQuizFromDocument = async () => {
    if (!selectedDocument && selectedDocuments.length === 0) {
      Alert.alert('No Documents Selected', 'Please select document(s) first.');
      return;
    }

    setIsGenerating(true);
    
    try {
      let extractedText = '';
      let sourceTitle = '';

      if (selectedDocuments.length > 0) {
        // Batch processing
        console.log(`🎯 Processing ${selectedDocuments.length} documents in batch...`);
        
        const documentsToProcess = selectedDocuments.map(doc => ({
          uri: doc.uri,
          name: doc.name,
          type: doc.type,
        }));

        const useOnlineOCR = mode === 'online';
        const batchResult = await DocumentProcessingService.processBatch(documentsToProcess, useOnlineOCR);
        
        setBatchProcessingResult(batchResult);
        extractedText = batchResult.combinedText;
        sourceTitle = `Batch Quiz (${batchResult.documents.length} docs)`;
        
        console.log(`✅ Batch processing complete: ${batchResult.totalWordCount} words from ${batchResult.documents.length} documents`);
      } else if (selectedDocument) {
        // Single document processing
        console.log(`🎯 Processing single document: ${selectedDocument.name}`);
        
        const useOnlineOCR = mode === 'online';
        const processedDoc = await DocumentProcessingService.processDocument(
          selectedDocument.uri,
          selectedDocument.name,
          selectedDocument.type,
          useOnlineOCR
        );
        
        extractedText = processedDoc.extractedText;
        sourceTitle = `Quiz from ${selectedDocument.name}`;
        
        console.log(`✅ Single document processed: ${processedDoc.wordCount} words`);
      }

      if (!extractedText || extractedText.trim().length < 20) {
        Alert.alert('Insufficient Content', 'Could not extract enough text from the document(s) to generate a quiz.');
        return;
      }

      console.log(`🎯 Generating quiz with ${mode} mode...`);
      let quizContent: string;
      
      if (mode === 'offline') {
        if (!currentLoadedModel) {
          Alert.alert('No Model Loaded', 'Please load an offline model first in the Models tab.');
          return;
        }
        console.log('🤖 Using offline model:', currentLoadedModel.name);
        const ggufService = GGUFService.getInstance();
        quizContent = await ggufService.generateQuizFromText(
          extractedText,
          {
            questionCount: parseInt(questionCount),
            questionType: questionType
          }
        );
      } else {
        if (!hasValidAPIKeys) {
          Alert.alert('No API Keys', 'Please configure your API keys in the .env file.');
          return;
        }
        console.log('☁️ Using online Groq API...');
        quizContent = await GroqService.generateQuizFromText(
          extractedText,
          parseInt(questionCount),
          questionType,
          selectedModel
        );
      }

      const newQuiz: Quiz = {
        id: Date.now().toString(),
        title: sourceTitle,
        questions: parseQuizContent(quizContent),
        createdAt: new Date(),
        sourceDocument: selectedDocuments.length > 0 
          ? `${selectedDocuments.length} documents` 
          : selectedDocument?.name,
      };

      await addQuiz(newQuiz);
      Alert.alert('Success', 'Quiz generated successfully! Check the Games tab to take the quiz.');
      
    } catch (error) {
      console.error('❌ Quiz generation failed:', error);
      Alert.alert('Error', 'Failed to generate quiz. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const parseQuizContent = (content: string): QuizQuestion[] => {
    console.log('🔍 Raw quiz content:', content);
    
    const questions: QuizQuestion[] = [];
    const lines = content.split('\n').filter(line => line.trim());
    
    let currentQuestion: Partial<QuizQuestion> = {};
    let questionCounter = 1;

    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Match question patterns: "1.", "Question 1:", etc.
      if (trimmedLine.match(/^\d+\./) || trimmedLine.match(/^Question\s+\d+/i)) {
        if (currentQuestion.question) {
          questions.push(currentQuestion as QuizQuestion);
        }
        currentQuestion = {
          id: questionCounter.toString(),
          question: trimmedLine.replace(/^\d+\./, '').replace(/^Question\s+\d+:?/i, '').trim(),
          type: 'mcq',
          options: [],
        };
        questionCounter++;
      } 
      // Match options: "A.", "A)", "a.", "a)"
      else if (trimmedLine.match(/^[A-Da-d][\.\)]/)) {
        if (currentQuestion.options) {
          currentQuestion.options.push(trimmedLine.replace(/^[A-Da-d][\.\)]/, '').trim());
        }
      } 
      // Match correct answer patterns
      else if (trimmedLine.toLowerCase().includes('answer:') || trimmedLine.toLowerCase().includes('correct:')) {
        let answer = trimmedLine.replace(/.*answer:\s*/i, '').replace(/.*correct:\s*/i, '').trim();
        
        // If answer is just a letter (A, B, C, D), convert to the actual option text
        if (answer.match(/^[A-Da-d]$/i) && currentQuestion.options && currentQuestion.options.length > 0) {
          const answerIndex = answer.toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0);
          if (answerIndex >= 0 && answerIndex < currentQuestion.options.length) {
            answer = currentQuestion.options[answerIndex];
          }
        }
        
        currentQuestion.correctAnswer = answer;
      }
      // Handle True/False questions
      else if (trimmedLine.toLowerCase().includes('true') || trimmedLine.toLowerCase().includes('false')) {
        if (currentQuestion.question && !currentQuestion.options?.length) {
          currentQuestion.type = 'true_false';
          currentQuestion.options = ['True', 'False'];
          
          if (trimmedLine.toLowerCase().includes('answer:')) {
            const answer = trimmedLine.toLowerCase().includes('true') ? 'True' : 'False';
            currentQuestion.correctAnswer = answer;
          }
        }
      }
    }

    if (currentQuestion.question) {
      questions.push(currentQuestion as QuizQuestion);
    }

    console.log('📝 Parsed questions:', questions);
    return questions.slice(0, parseInt(questionCount));
  };

  const renderStatusCards = () => (
    <View style={styles.statusGrid}>
      <View style={[styles.statusCard, styles.offlineCard]}>
        <View style={styles.statusContent}>
          <Ionicons name="hardware-chip-outline" size={20} color={GameColors.warning} />
          <View style={styles.statusInfo}>
            <Text style={styles.statusTitle}>Offline</Text>
            <Text style={styles.statusSubtitle}>
              {currentLoadedModel ? 'Model loaded' : 'No model loaded'}
            </Text>
          </View>
        </View>
      </View>

      <View style={[styles.statusCard, styles.onlineCard]}>
        <View style={styles.statusContent}>
          <Ionicons name="cloud-done" size={20} color={GameColors.success} />
          <View style={styles.statusInfo}>
            <Text style={styles.statusTitle}>Online</Text>
            <Text style={styles.statusSubtitle}>
              {hasValidAPIKeys ? 'API keys configured' : 'No API keys'}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );

  const renderDocumentSelection = () => (
    <View style={styles.documentSection}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleContainer}>
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <Ionicons name="document-text" size={20} color={GameColors.primary} />
          </Animated.View>
          <Text style={styles.sectionTitle}>Generate Quiz from Documents</Text>
        </View>
      </View>
      <Text style={styles.sectionSubtitle}>Select document(s) to generate quiz from using advanced OCR</Text>

      {/* Document Selection Mode Toggle */}
      <View style={styles.selectionModeToggle}>
        <TouchableOpacity
          style={[
            styles.selectionModeButton,
            selectedDocuments.length === 0 && styles.selectionModeButtonActive
          ]}
          onPress={() => {
            setSelectedDocuments([]);
            setSelectedDocument(null);
          }}
        >
          <Text style={[
            styles.selectionModeText,
            selectedDocuments.length === 0 && styles.selectionModeTextActive
          ]}>
            Single Document
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.selectionModeButton,
            selectedDocuments.length > 0 && styles.selectionModeButtonActive
          ]}
          onPress={() => {
            setSelectedDocument(null);
            setShowBatchSelector(true);
          }}
        >
          <Text style={[
            styles.selectionModeText,
            selectedDocuments.length > 0 && styles.selectionModeTextActive
          ]}>
            Batch Processing ({selectedDocuments.length})
          </Text>
        </TouchableOpacity>
      </View>

      {selectedDocuments.length > 0 ? (
        <View style={styles.batchDocumentsCard}>
          <View style={styles.batchHeader}>
            <Text style={[styles.batchTitle, { color: GameColors.foreground }]}>
              Selected Documents ({selectedDocuments.length})
            </Text>
            <TouchableOpacity
              style={styles.changeBatchButton}
              onPress={() => setShowBatchSelector(true)}
            >
              <Text style={[styles.changeBatchText, { color: 'white' }]}>
                Modify
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.batchDocumentsList}>
            {selectedDocuments.slice(0, 3).map((doc, index) => (
              <View key={doc.id} style={styles.batchDocumentItem}>
                <Ionicons 
                  name={doc.type.includes('pdf') ? 'document-text' : 
                        doc.type.includes('image') ? 'image' :
                        doc.type.includes('word') ? 'document' : 'easel'} 
                  size={16} 
                  color={GameColors.primary} 
                />
                <Text style={[styles.batchDocumentName, { color: GameColors.foreground }]}>
                  {doc.name.length > 20 ? doc.name.substring(0, 20) + '...' : doc.name}
                </Text>
              </View>
            ))}
            {selectedDocuments.length > 3 && (
              <Text style={[styles.moreDocumentsText, { color: GameColors.mutedForeground }]}>
                +{selectedDocuments.length - 3} more...
              </Text>
            )}
          </View>
        </View>
      ) : selectedDocument ? (
        <View style={styles.selectedDocumentCard}>
          <View style={styles.documentPreview}>
            <Ionicons 
              name={selectedDocument.type.includes('pdf') ? 'document-text' : 
                    selectedDocument.type.includes('image') ? 'image' :
                    selectedDocument.type.includes('word') ? 'document' : 'easel'} 
              size={24} 
              color={GameColors.primary} 
            />
            <Text style={[styles.documentName, { color: GameColors.foreground }]}>
              {selectedDocument.name}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.changeDocumentButton}
            onPress={() => setShowDocumentSelector(true)}
          >
            <Text style={[styles.changeDocumentText, { color: 'white' }]}>
              Change
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={[styles.selectDocumentButton, { borderColor: GameColors.border }]}
          onPress={() => setShowDocumentSelector(true)}
        >
          <Ionicons name="document-text-outline" size={24} color={GameColors.mutedForeground} />
          <Text style={[styles.selectDocumentText, { color: GameColors.mutedForeground }]}>
            Select Document
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const renderQuizSettings = () => (
    <View style={styles.settingsSection}>
      <Text style={styles.settingsTitle}>Quiz Settings</Text>
      
      {/* Mode Selection */}
      <View style={styles.settingRow}>
        <View style={styles.settingInfo}>
          <Ionicons name="settings" size={16} color={GameColors.primary} />
          <Text style={styles.settingLabel}>Mode</Text>
        </View>
        <View style={styles.settingControls}>
          {[
            { key: 'offline', label: 'Offline', icon: 'hardware-chip' },
            { key: 'online', label: 'Online', icon: 'cloud' }
          ].map((modeOption) => (
            <TouchableOpacity
              key={modeOption.key}
              style={[
                styles.modeOption,
                mode === modeOption.key && styles.modeOptionActive,
                modeOption.key === 'offline' && !currentLoadedModel && styles.modeOptionDisabled,
                modeOption.key === 'online' && !hasValidAPIKeys && styles.modeOptionDisabled
              ]}
              onPress={() => setMode(modeOption.key as any)}
              disabled={
                (modeOption.key === 'offline' && !currentLoadedModel) ||
                (modeOption.key === 'online' && !hasValidAPIKeys)
              }
            >
              <Ionicons 
                name={modeOption.icon as any} 
                size={14} 
                color={
                  mode === modeOption.key 
                    ? 'white' 
                    : (modeOption.key === 'offline' && !currentLoadedModel) || 
                      (modeOption.key === 'online' && !hasValidAPIKeys)
                      ? GameColors.mutedForeground
                      : GameColors.foreground
                } 
              />
              <Text style={[
                styles.modeOptionText,
                mode === modeOption.key && styles.modeOptionTextActive,
                ((modeOption.key === 'offline' && !currentLoadedModel) || 
                (modeOption.key === 'online' && !hasValidAPIKeys)) && styles.modeOptionTextDisabled
              ]}>
                {modeOption.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      
      <View style={styles.settingRow}>
        <View style={styles.settingInfo}>
          <Ionicons name="list" size={16} color={GameColors.primary} />
          <Text style={styles.settingLabel}>Questions</Text>
        </View>
        <View style={styles.settingControls}>
          {['3', '5', '10'].map((count) => (
            <TouchableOpacity
              key={count}
              style={[
                styles.settingOption,
                questionCount === count && styles.settingOptionActive
              ]}
              onPress={() => setQuestionCount(count)}
            >
              <Text style={[
                styles.settingOptionText,
                questionCount === count && styles.settingOptionTextActive
              ]}>
                {count}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.settingRow}>
        <View style={styles.settingInfo}>
          <Ionicons name="help-circle-outline" size={20} color={GameColors.primary} />
          <Text style={[styles.settingLabel, { color: GameColors.foreground }]}>Question Type</Text>
        </View>
        <View style={styles.settingControls}>
          <View style={[styles.settingOption, styles.settingOptionActive]}>
            <Text style={[styles.settingOptionText, styles.settingOptionTextActive]}>
              Multiple Choice
            </Text>
          </View>
        </View>
      </View>

      {mode === 'online' && (
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Ionicons name="hardware-chip-outline" size={20} color={GameColors.primary} />
            <Text style={[styles.settingLabel, { color: GameColors.foreground }]}>AI Model</Text>
          </View>
          <View style={styles.modelSelector}>
            <TouchableOpacity
              style={styles.modelDropdown}
              onPress={() => setShowModelSelector(true)}
            >
              <Text style={[styles.modelDropdownText, { color: GameColors.foreground }]}>
                {getModelDisplayName(selectedModel)}
              </Text>
              <Ionicons name="chevron-down" size={16} color={GameColors.mutedForeground} />
            </TouchableOpacity>
          </View>
        </View>
      )}


      {/* Mode Status Info */}
      <View style={styles.modeStatusCard}>
        <View style={styles.modeStatusContent}>
          <Ionicons 
            name={mode === 'offline' ? 'hardware-chip' : 'cloud'} 
            size={16} 
            color={GameColors.primary} 
          />
          <Text style={styles.modeStatusText}>
            {mode === 'offline' 
              ? currentLoadedModel 
                ? `Using ${currentLoadedModel.name}` 
                : 'No offline model loaded'
              : hasValidAPIKeys 
                ? 'Online API keys configured' 
                : 'No API keys configured'
            }
          </Text>
        </View>
      </View>
    </View>
  );

  const renderGenerateButton = () => {
    const hasDocuments = selectedDocument || selectedDocuments.length > 0;
    return (
    <Animated.View style={{ transform: [{ scale: bounceAnim }] }}>
      <TouchableOpacity
        style={[styles.generateButton, !hasDocuments && styles.generateButtonDisabled]}
        onPress={generateQuizFromDocument}
        disabled={!hasDocuments || isGenerating}
      >
        <LinearGradient
          colors={hasDocuments ? GameColors.gradients.primary as any : [GameColors.muted, GameColors.muted]}
          style={styles.generateGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          {isGenerating ? (
            <ActivityIndicator color="white" size="small" />
          ) : (
            <Ionicons name="flash" size={24} color="white" />
          )}
          <Text style={styles.generateButtonText}>
            {isGenerating ? 'Generating...' : 'Generate Quiz'}
          </Text>
          <View style={styles.xpBadge}>
            <Text style={styles.xpBadgeText}>+25 XP</Text>
          </View>
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: GameColors.background }]}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: GameColors.foreground }]}>Quiz Generation</Text>
          <Text style={[styles.subtitle, { color: GameColors.mutedForeground }]}>
            Transform your documents into interactive quizzes
          </Text>
        </View>

        {/* Status Cards */}
        {renderStatusCards()}

        {/* Document Selection */}
        {renderDocumentSelection()}

        {/* Quiz Settings */}
        {renderQuizSettings()}

        {/* Generate Button */}
        {renderGenerateButton()}

        {/* Generated Quizzes */}
        {quizzes.length > 0 && (
          <View style={styles.quizzesSection}>
            <View style={styles.quizzesSectionHeader}>
              <Text style={[styles.sectionTitle, { color: GameColors.foreground }]}>
                Generated Quizzes ({quizzes.length})
              </Text>
              <View style={styles.achievementBadge}>
                <Ionicons name="trophy" size={16} color={GameColors.levelGold} />
                <Text style={styles.achievementText}>Quiz Master!</Text>
              </View>
            </View>
            {quizzes.slice(0, 3).map((quiz) => (
              <View key={quiz.id} style={styles.quizCard}>
                <Text style={[styles.quizTitle, { color: GameColors.foreground }]}>{quiz.title}</Text>
                <Text style={[styles.quizMeta, { color: GameColors.mutedForeground }]}>
                  {quiz.questions.length} questions • {quiz.createdAt.toLocaleDateString()}
                </Text>
                <Text style={[styles.quizHint, { color: GameColors.primary }]}>
                  Go to Games tab to take this quiz →
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Document Selector Modal */}
      <Modal
        visible={showDocumentSelector}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={[styles.sectionTitle, { color: GameColors.foreground }]}>Select Document</Text>
            <TouchableOpacity onPress={() => setShowDocumentSelector(false)}>
              <Ionicons name="close" size={24} color={GameColors.foreground} />
            </TouchableOpacity>
          </View>
          
          <ScrollView style={styles.modalContent}>
            {uploadedDocuments.map((doc) => (
              <TouchableOpacity
                key={doc.id}
                style={styles.documentOption}
                onPress={() => {
                  setSelectedDocument(doc);
                  setShowDocumentSelector(false);
                }}
              >
                <Ionicons 
                  name={doc.type === 'pdf' ? 'document-text' : 'image'} 
                  size={24} 
                  color={GameColors.primary} 
                />
                <Text style={[styles.documentOptionText, { color: GameColors.foreground }]}>
                  {doc.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>

      {/* Model Selector Modal */}
      <Modal
        visible={showModelSelector}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={[styles.sectionTitle, { color: GameColors.foreground }]}>Select AI Model</Text>
            <TouchableOpacity onPress={() => setShowModelSelector(false)}>
              <Ionicons name="close" size={24} color={GameColors.foreground} />
            </TouchableOpacity>
          </View>
          
          <ScrollView style={styles.modalContent}>
            {availableModels.map((model) => (
              <TouchableOpacity
                key={model.id}
                style={[
                  styles.documentOption,
                  selectedModel === model.id && { backgroundColor: GameColors.primary + '10' }
                ]}
                onPress={() => {
                  setSelectedModel(model.id);
                  setShowModelSelector(false);
                }}
              >
                <Ionicons 
                  name="hardware-chip" 
                  size={24} 
                  color={selectedModel === model.id ? GameColors.primary : GameColors.mutedForeground} 
                />
                <View style={{ flex: 1 }}>
                  <Text style={[
                    styles.documentOptionText, 
                    { color: selectedModel === model.id ? GameColors.primary : GameColors.foreground }
                  ]}>
                    {model.name}
                  </Text>
                  <Text style={[
                    styles.modelDescription,
                    { color: GameColors.mutedForeground }
                  ]}>
                    {model.description}
                  </Text>
                </View>
                {selectedModel === model.id && (
                  <Ionicons name="checkmark-circle" size={20} color={GameColors.primary} />
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>

      {/* Batch Document Selector Modal */}
      <Modal
        visible={showBatchSelector}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={[styles.sectionTitle, { color: GameColors.foreground }]}>Select Documents for Batch Processing</Text>
            <TouchableOpacity onPress={() => setShowBatchSelector(false)}>
              <Ionicons name="close" size={24} color={GameColors.foreground} />
            </TouchableOpacity>
          </View>
          
          <ScrollView style={styles.modalContent}>
            {uploadedDocuments.map((doc) => {
              const isSelected = selectedDocuments.some(selected => selected.id === doc.id);
              return (
                <TouchableOpacity
                  key={doc.id}
                  style={[
                    styles.documentOption,
                    isSelected && { backgroundColor: GameColors.primary + '10' }
                  ]}
                  onPress={() => {
                    if (isSelected) {
                      setSelectedDocuments(prev => prev.filter(selected => selected.id !== doc.id));
                    } else {
                      setSelectedDocuments(prev => [...prev, doc]);
                    }
                  }}
                >
                  <Ionicons 
                    name={doc.type.includes('pdf') ? 'document-text' : 
                          doc.type.includes('image') ? 'image' :
                          doc.type.includes('word') ? 'document' : 'easel'} 
                    size={24} 
                    color={isSelected ? GameColors.primary : GameColors.mutedForeground} 
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[
                      styles.documentOptionText, 
                      { color: isSelected ? GameColors.primary : GameColors.foreground }
                    ]}>
                      {doc.name}
                    </Text>
                    <Text style={[
                      styles.modelDescription,
                      { color: GameColors.mutedForeground }
                    ]}>
                      {doc.type} • {(doc.size / 1024).toFixed(1)} KB
                    </Text>
                  </View>
                  {isSelected && (
                    <Ionicons name="checkmark-circle" size={20} color={GameColors.primary} />
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          
          <View style={styles.modalFooter}>
            <Text style={[styles.batchSelectionCount, { color: GameColors.mutedForeground }]}>
              {selectedDocuments.length} document(s) selected
            </Text>
            <TouchableOpacity
              style={[
                styles.confirmBatchButton,
                selectedDocuments.length === 0 && styles.confirmBatchButtonDisabled
              ]}
              onPress={() => setShowBatchSelector(false)}
              disabled={selectedDocuments.length === 0}
            >
              <Text style={styles.confirmBatchText}>
                Confirm Selection
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
  },
  statusGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  statusCard: {
    flex: 1,
    borderRadius: 12,
    padding: 16,
  },
  offlineCard: {
    backgroundColor: GameColors.warning + '20',
    borderColor: GameColors.warning + '30',
    borderWidth: 1,
  },
  onlineCard: {
    backgroundColor: GameColors.success + '20',
    borderColor: GameColors.success + '30',
    borderWidth: 1,
  },
  statusContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statusInfo: {
    flex: 1,
  },
  statusTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: GameColors.foreground,
    marginBottom: 2,
  },
  statusSubtitle: {
    fontSize: 12,
    color: GameColors.mutedForeground,
  },
  documentSection: {
    backgroundColor: GameColors.card,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderColor: GameColors.primary + '20',
    borderWidth: 1,
  },
  sectionHeader: {
    marginBottom: 8,
  },
  sectionTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: GameColors.foreground,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: GameColors.mutedForeground,
    marginBottom: 16,
  },
  selectedDocumentCard: {
    backgroundColor: GameColors.primary + '10',
    borderColor: GameColors.primary + '30',
    borderWidth: 2,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectedDocumentContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  selectedDocumentInfo: {
    flex: 1,
  },
  selectedDocumentTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: GameColors.foreground,
    marginBottom: 2,
  },
  selectedDocumentName: {
    fontSize: 12,
    color: GameColors.mutedForeground,
  },
  changeDocumentButton: {
    backgroundColor: GameColors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  changeDocumentText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  selectDocumentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: GameColors.muted,
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: GameColors.border,
    borderStyle: 'dashed',
  },
  selectDocumentText: {
    fontSize: 16,
    fontWeight: '500',
    color: GameColors.primary,
  },
  settingsSection: {
    backgroundColor: GameColors.card,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  settingsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: GameColors.foreground,
    marginBottom: 16,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  settingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: GameColors.foreground,
  },
  settingControls: {
    flexDirection: 'row',
    gap: 8,
  },
  settingOption: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: GameColors.muted,
    borderWidth: 1,
    borderColor: GameColors.border,
  },
  settingOptionActive: {
    backgroundColor: GameColors.primary,
    borderColor: GameColors.primary,
  },
  settingOptionText: {
    fontSize: 14,
    fontWeight: '500',
    color: GameColors.foreground,
  },
  settingOptionTextActive: {
    color: 'white',
  },
  generateButton: {
    borderRadius: 16,
    marginBottom: 24,
    overflow: 'hidden',
  },
  generateButtonDisabled: {
    opacity: 0.6,
  },
  generateGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 8,
    position: 'relative',
  },
  generateButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  xpBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: GameColors.secondary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  xpBadgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  quizzesSection: {
    marginBottom: 20,
  },
  quizzesSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  achievementBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: GameColors.levelGold + '20',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  achievementText: {
    fontSize: 12,
    fontWeight: '600',
    color: GameColors.levelGold,
  },
  quizCard: {
    backgroundColor: GameColors.card,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  quizTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  quizMeta: {
    fontSize: 12,
    marginTop: 4,
  },
  quizHint: {
    fontSize: 12,
    marginTop: 8,
    fontWeight: '500',
  },
  modelSelector: {
    flex: 1,
  },
  modelDropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: GameColors.muted,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GameColors.border,
  },
  modelDropdownText: {
    fontSize: 14,
    fontWeight: '500',
  },
  modelDescription: {
    fontSize: 12,
    marginTop: 2,
  },
  selectionModeToggle: {
    flexDirection: 'row',
    backgroundColor: GameColors.muted,
    borderRadius: 8,
    padding: 4,
    marginBottom: 16,
  },
  selectionModeButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  selectionModeButtonActive: {
    backgroundColor: GameColors.primary,
  },
  selectionModeText: {
    fontSize: 14,
    fontWeight: '500',
    color: GameColors.mutedForeground,
  },
  selectionModeTextActive: {
    color: 'white',
  },
  batchDocumentsCard: {
    backgroundColor: GameColors.primary + '10',
    borderColor: GameColors.primary + '30',
    borderWidth: 2,
    borderRadius: 12,
    padding: 16,
  },
  batchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  batchTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  changeBatchButton: {
    backgroundColor: GameColors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  changeBatchText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '500',
  },
  batchDocumentsList: {
    gap: 8,
  },
  batchDocumentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  batchDocumentName: {
    fontSize: 14,
    fontWeight: '500',
  },
  moreDocumentsText: {
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 4,
  },
  modalFooter: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: GameColors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  batchSelectionCount: {
    fontSize: 14,
    fontWeight: '500',
  },
  confirmBatchButton: {
    backgroundColor: GameColors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  confirmBatchButtonDisabled: {
    backgroundColor: GameColors.muted,
  },
  confirmBatchText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  documentPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  documentName: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: GameColors.border,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  documentOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    backgroundColor: GameColors.card,
    borderRadius: 12,
    marginBottom: 12,
  },
  documentOptionText: {
    fontSize: 16,
    fontWeight: '500',
  },
  modeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: GameColors.muted,
    borderWidth: 1,
    borderColor: GameColors.border,
    gap: 6,
    minWidth: 80,
    justifyContent: 'center',
  },
  modeOptionActive: {
    backgroundColor: GameColors.primary,
    borderColor: GameColors.primary,
  },
  modeOptionDisabled: {
    backgroundColor: GameColors.muted,
    borderColor: GameColors.border,
    opacity: 0.5,
  },
  modeOptionText: {
    fontSize: 14,
    fontWeight: '500',
    color: GameColors.foreground,
  },
  modeOptionTextActive: {
    color: 'white',
  },
  modeOptionTextDisabled: {
    color: GameColors.mutedForeground,
  },
  modeStatusCard: {
    backgroundColor: GameColors.primary + '10',
    borderColor: GameColors.primary + '30',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 16,
  },
  modeStatusContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modeStatusText: {
    fontSize: 14,
    fontWeight: '500',
    color: GameColors.foreground,
    flex: 1,
  },
});
