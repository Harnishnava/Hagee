import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GameColors } from '@/constants/GameColors';

export interface UploadedDocument {
  id: string;
  name: string;
  type: string;
  size: number;
  uri: string;
  uploadedAt: Date;
}

const DOCUMENTS_STORAGE_KEY = '@hagee_documents';

export default function HomeScreen() {
  const [uploadedDocuments, setUploadedDocuments] = useState<UploadedDocument[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [userLevel] = useState(5);
  const [userXP] = useState(1250);
  const [totalDocuments] = useState(12);
  
  // Animation refs
  const bounceAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Load documents from storage on component mount
  useEffect(() => {
    loadDocuments();
    startPulseAnimation();
  }, []);

  const startPulseAnimation = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  const animateUpload = () => {
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

  const saveDocuments = async (docs: UploadedDocument[]) => {
    try {
      await AsyncStorage.setItem(DOCUMENTS_STORAGE_KEY, JSON.stringify(docs));
    } catch (error) {
      console.error('Error saving documents:', error);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (type: string): string => {
    if (type.includes('pdf')) return 'document-text';
    if (type.includes('word') || type.includes('doc') || type.includes('wordprocessingml')) return 'document';
    if (type.includes('image')) return 'image';
    if (type.includes('powerpoint') || type.includes('presentation') || type.includes('presentationml')) return 'easel';
    if (type.includes('text') || type.includes('csv')) return 'document-outline';
    return 'document-outline';
  };

  const handleDocumentUpload = async () => {
    try {
      setIsUploading(true);
      animateUpload();
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          'application/msword',
          'application/vnd.ms-powerpoint',
          'text/plain',
          'text/csv'
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (!result.canceled && result.assets[0]) {
        const file = result.assets[0];
        const newDocument: UploadedDocument = {
          id: Date.now().toString(),
          name: file.name,
          type: file.mimeType || 'unknown',
          size: file.size || 0,
          uri: file.uri,
          uploadedAt: new Date(),
        };

        const updatedDocs = [newDocument, ...uploadedDocuments];
        setUploadedDocuments(updatedDocs);
        await saveDocuments(updatedDocs);
        
        Alert.alert('Success', 'Document uploaded successfully! Go to the Explore tab to generate quizzes.');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to upload document');
    } finally {
      setIsUploading(false);
    }
  };

  const handleImageUpload = async (useCamera: boolean = false) => {
    try {
      setIsUploading(true);
      animateUpload();
      let result;

      if (useCamera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Permission needed', 'Camera permission is required to take photos');
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [4, 3],
          quality: 1,
        });
      } else {
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [4, 3],
          quality: 1,
        });
      }

      if (!result.canceled && result.assets[0]) {
        const image = result.assets[0];
        const fileInfo = await FileSystem.getInfoAsync(image.uri);
        
        const newDocument: UploadedDocument = {
          id: Date.now().toString(),
          name: `Image_${Date.now()}.jpg`,
          type: 'image/jpeg',
          size: (fileInfo.exists && !fileInfo.isDirectory) ? (fileInfo as any).size || 0 : 0,
          uri: image.uri,
          uploadedAt: new Date(),
        };

        const updatedDocs = [newDocument, ...uploadedDocuments];
        setUploadedDocuments(updatedDocs);
        await saveDocuments(updatedDocs);
        
        Alert.alert('Success', 'Image uploaded successfully! Go to the Explore tab to generate quizzes.');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to upload image');
    } finally {
      setIsUploading(false);
    }
  };

  const deleteDocument = async (documentId: string) => {
    try {
      const updatedDocs = uploadedDocuments.filter(doc => doc.id !== documentId);
      setUploadedDocuments(updatedDocs);
      await saveDocuments(updatedDocs);
      Alert.alert('Success', 'Document deleted successfully.');
    } catch (error) {
      Alert.alert('Error', 'Failed to delete document');
    }
  };

  const confirmDeleteDocument = (documentId: string) => {
    Alert.alert(
      'Delete Document',
      'Are you sure you want to delete this document?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteDocument(documentId),
        },
      ]
    );
  };

  const renderDocumentCard = (document: UploadedDocument) => (
    <View key={document.id} style={[styles.documentCard, { backgroundColor: GameColors.card }]}>
      <View style={[styles.documentIcon, { backgroundColor: GameColors.primary + '20' }]}>
        <Ionicons name={getFileIcon(document.type) as any} size={24} color={GameColors.primary} />
      </View>
      <View style={styles.documentInfo}>
        <Text style={[styles.documentName, { color: GameColors.foreground }]}>
          {document.name}
        </Text>
        <Text style={[styles.documentMeta, { color: GameColors.mutedForeground }]}>
          {formatFileSize(document.size)} • {document.uploadedAt.toLocaleDateString()}
        </Text>
      </View>
      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => confirmDeleteDocument(document.id)}
      >
        <Ionicons name="trash-outline" size={20} color={GameColors.destructive} />
      </TouchableOpacity>
    </View>
  );

  const renderGamificationHeader = () => (
    <View style={styles.gamificationHeader}>
      <View style={styles.levelBadge}>
        <Ionicons name="trophy" size={16} color={GameColors.levelGold} />
        <Text style={styles.levelText}>Level {userLevel}</Text>
      </View>
      <View style={styles.xpContainer}>
        <Text style={styles.xpText}>{userXP} XP</Text>
        <View style={styles.xpBar}>
          <View style={[styles.xpProgress, { width: '75%' }]} />
        </View>
      </View>
      <View style={styles.statsContainer}>
        <Ionicons name="document-text" size={16} color={GameColors.primary} />
        <Text style={styles.statsText}>{totalDocuments} docs</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: GameColors.background }]}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Gamification Header */}
        {renderGamificationHeader()}
        
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: GameColors.foreground }]}>Upload Documents</Text>
          <Text style={[styles.subtitle, { color: GameColors.mutedForeground }]}>
            Add your study materials to get started
          </Text>
        </View>

        {/* Upload Options */}
        <View style={styles.uploadSection}>
          <Animated.View style={{ transform: [{ scale: bounceAnim }] }}>
            <TouchableOpacity
              style={[styles.uploadButton]}
              onPress={handleDocumentUpload}
              disabled={isUploading}
            >
              <LinearGradient
                colors={GameColors.gradients.primary as any}
                style={styles.gradientButton}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                  {isUploading ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Ionicons name="cloud-upload" size={32} color="white" />
                  )}
                </Animated.View>
                <Text style={styles.uploadButtonText}>Upload Document</Text>
                <Text style={styles.uploadButtonSubtext}>PDF, DOCX, PPTX, TXT</Text>
                <View style={styles.uploadBadge}>
                  <Text style={styles.uploadBadgeText}>+10 XP</Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>

          <View style={styles.imageUploadRow}>
            <TouchableOpacity
              style={[styles.imageUploadButton, { backgroundColor: GameColors.card, borderColor: GameColors.primary }]}
              onPress={() => handleImageUpload(false)}
              disabled={isUploading}
            >
              <Ionicons name="image-outline" size={20} color={GameColors.primary} />
              <Text style={[styles.imageUploadText, { color: GameColors.primary }]}>Gallery</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.imageUploadButton, { backgroundColor: GameColors.card, borderColor: GameColors.secondary }]}
              onPress={() => handleImageUpload(true)}
              disabled={isUploading}
            >
              <Ionicons name="camera-outline" size={20} color={GameColors.secondary} />
              <Text style={[styles.imageUploadText, { color: GameColors.secondary }]}>Camera</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Uploaded Documents */}
        {uploadedDocuments.length > 0 && (
          <View style={styles.documentsSection}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: GameColors.foreground }]}>
                Uploaded Documents ({uploadedDocuments.length})
              </Text>
              <View style={styles.achievementBadge}>
                <Ionicons name="checkmark-circle" size={16} color={GameColors.success} />
                <Text style={styles.achievementText}>Organized!</Text>
              </View>
            </View>
            {uploadedDocuments.map(renderDocumentCard)}
          </View>
        )}

        {uploadedDocuments.length === 0 && !isUploading && (
          <View style={styles.emptyState}>
            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
              <Ionicons name="cloud-upload-outline" size={64} color={GameColors.mutedForeground} style={{ opacity: 0.3 }} />
            </Animated.View>
            <Text style={[styles.emptyStateText, { color: GameColors.foreground, opacity: 0.7 }]}>
              No documents uploaded yet
            </Text>
            <Text style={[styles.emptyStateSubtext, { color: GameColors.mutedForeground }]}>
              Upload your study materials to get started
            </Text>
            <View style={styles.motivationCard}>
              <Text style={styles.motivationText}>🎯 Start your learning journey!</Text>
            </View>
          </View>
        )}
      </ScrollView>
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
  // Gamification Header Styles
  gamificationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: GameColors.card,
    padding: 16,
    borderRadius: 16,
    marginBottom: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  levelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: GameColors.levelGold + '20',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 4,
  },
  levelText: {
    fontSize: 14,
    fontWeight: '600',
    color: GameColors.levelGold,
  },
  xpContainer: {
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 16,
  },
  xpText: {
    fontSize: 16,
    fontWeight: '700',
    color: GameColors.primary,
    marginBottom: 4,
  },
  xpBar: {
    width: '100%',
    height: 6,
    backgroundColor: GameColors.muted,
    borderRadius: 3,
    overflow: 'hidden',
  },
  xpProgress: {
    height: '100%',
    backgroundColor: GameColors.primary,
    borderRadius: 3,
  },
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: GameColors.primary + '20',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 4,
  },
  statsText: {
    fontSize: 14,
    fontWeight: '600',
    color: GameColors.primary,
  },
  header: {
    marginBottom: 30,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
  },
  uploadSection: {
    marginBottom: 30,
  },
  uploadButton: {
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
  },
  gradientButton: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    minHeight: 140,
    position: 'relative',
  },
  uploadBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: GameColors.secondary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  uploadBadgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  uploadButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 12,
  },
  uploadButtonSubtext: {
    color: 'white',
    fontSize: 12,
    opacity: 0.8,
    marginTop: 4,
  },
  imageUploadRow: {
    flexDirection: 'row',
    gap: 12,
  },
  imageUploadButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    gap: 8,
  },
  imageUploadText: {
    fontSize: 16,
    fontWeight: '500',
  },
  documentsSection: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  achievementBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: GameColors.success + '20',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  achievementText: {
    fontSize: 12,
    fontWeight: '600',
    color: GameColors.success,
  },
  documentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  documentIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  documentInfo: {
    flex: 1,
    marginLeft: 12,
  },
  documentName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  documentMeta: {
    fontSize: 12,
  },
  deleteButton: {
    padding: 8,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: '500',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateSubtext: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
  },
  motivationCard: {
    backgroundColor: GameColors.accent + '10',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: GameColors.accent + '30',
  },
  motivationText: {
    fontSize: 16,
    fontWeight: '600',
    color: GameColors.accent,
    textAlign: 'center',
  },
});
