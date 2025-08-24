import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  RefreshControl,
  StyleSheet,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useModel } from '@/contexts/ModelContext';
import { ModelInfo } from '@/services/ModelService';
import { GameColors } from '@/constants/GameColors';

export default function ModelsScreen() {
  const {
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
  } = useModel();

  const [tokenInput, setTokenInput] = useState(authToken || '');
  const [showTokenInput, setShowTokenInput] = useState(false);
  
  // Animation refs
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const bounceAnim = useRef(new Animated.Value(1)).current;
  
  React.useEffect(() => {
    const pulseAnimation = Animated.loop(
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
    );
    pulseAnimation.start();
    return () => pulseAnimation.stop();
  }, []);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const animateDownload = () => {
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

  const handleDownload = async (model: ModelInfo) => {
    try {
      animateDownload();
      await downloadModel(model, tokenInput || undefined);
      Alert.alert('Success', `${model.name} downloaded successfully! +15 XP earned!`);
    } catch (err) {
      Alert.alert('Download Failed', err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const handleDelete = (model: ModelInfo) => {
    Alert.alert(
      'Delete Model',
      `Are you sure you want to delete ${model.name}? This will free up ${model.sizeDisplay} of storage.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteModel(model.id);
              Alert.alert('Success', 'Model deleted successfully!');
            } catch (err) {
              Alert.alert('Delete Failed', err instanceof Error ? err.message : 'Unknown error');
            }
          },
        },
      ]
    );
  };

  const handleLoadModel = async (model: ModelInfo) => {
    try {
      if (currentLoadedModel?.id === model.id) {
        await unloadModel();
        Alert.alert('Success', 'Model unloaded from memory');
      } else {
        await loadModel(model.id);
        Alert.alert('Success', `${model.name} loaded and ready for use! +20 XP earned!`);
      }
    } catch (err) {
      Alert.alert('Load Failed', err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const handleCancelDownload = async (modelId: string) => {
    try {
      await cancelDownload(modelId);
    } catch (err) {
      Alert.alert('Cancel Failed', err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const saveAuthToken = () => {
    setAuthToken(tokenInput.trim() || null);
    setShowTokenInput(false);
    Alert.alert('Success', 'Authentication token saved!');
  };

  const renderModelCard = (model: ModelInfo) => {
    const isDownloaded = model.isDownloaded;
    const isDownloading = downloadingModels.has(model.id);
    const downloadProgress = downloadingModels.get(model.id) || 0;
    const isLoaded = currentLoadedModel?.id === model.id;

    return (
      <View key={model.id} style={[styles.modelCard, { backgroundColor: GameColors.card }]}>
        <View style={styles.modelHeader}>
          <View style={styles.modelInfo}>
            <Text style={[styles.modelName, { color: GameColors.foreground }]}>{model.name}</Text>
            <Text style={[styles.modelDescription, { color: GameColors.mutedForeground }]}>
              {model.description}
            </Text>
            <View style={styles.modelMeta}>
              <View style={styles.sizeTag}>
                <Ionicons name="hardware-chip" size={12} color={GameColors.primary} />
                <Text style={[styles.modelSize, { color: GameColors.primary }]}>{model.sizeDisplay}</Text>
              </View>
              <View style={styles.quantTag}>
                <Text style={[styles.modelQuantization, { color: GameColors.mutedForeground }]}>
                  {model.quantization}
                </Text>
              </View>
            </View>
          </View>
          
          {isLoaded && (
            <Animated.View style={[styles.loadedBadge, { backgroundColor: GameColors.success, transform: [{ scale: pulseAnim }] }]}>
              <Ionicons name="checkmark-circle" size={12} color="white" />
              <Text style={styles.loadedText}>LOADED</Text>
            </Animated.View>
          )}
        </View>

        {isDownloading && (
          <View style={styles.progressContainer}>
            <View style={styles.progressBar}>
              <LinearGradient
                colors={GameColors.gradients.primary as any}
                style={[
                  styles.progressFill,
                  { width: `${downloadProgress}%` },
                ]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              />
            </View>
            <View style={styles.progressInfo}>
              <Text style={[styles.progressText, { color: GameColors.foreground }]}>
                {downloadProgress}%
              </Text>
              <View style={styles.xpTag}>
                <Ionicons name="star" size={12} color={GameColors.secondary} />
                <Text style={styles.xpText}>+15 XP</Text>
              </View>
            </View>
          </View>
        )}

        <View style={styles.modelActions}>
          {!isDownloaded && !isDownloading && (
            <Animated.View style={{ transform: [{ scale: bounceAnim }] }}>
              <TouchableOpacity
                style={[styles.actionButton, styles.downloadButton]}
                onPress={() => handleDownload(model)}
              >
                <LinearGradient
                  colors={GameColors.gradients.primary as any}
                  style={styles.gradientButton}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Ionicons name="cloud-download" size={16} color="white" />
                  <Text style={styles.actionButtonText}>Download</Text>
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>
          )}

          {isDownloading && (
            <TouchableOpacity
              style={[styles.actionButton, styles.cancelButton]}
              onPress={() => handleCancelDownload(model.id)}
            >
              <Ionicons name="close-circle" size={16} color={GameColors.destructive} />
              <Text style={[styles.actionButtonText, { color: GameColors.destructive }]}>Cancel</Text>
            </TouchableOpacity>
          )}

          {isDownloaded && (
            <>
              <TouchableOpacity
                style={[
                  styles.actionButton,
                  isLoaded ? styles.unloadButton : styles.loadButton,
                ]}
                onPress={() => handleLoadModel(model)}
              >
                <LinearGradient
                  colors={isLoaded ? GameColors.gradients.warning as any : GameColors.gradients.success as any}
                  style={styles.gradientButton}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Ionicons
                    name={isLoaded ? 'pause-circle' : 'play-circle'}
                    size={16}
                    color="white"
                  />
                  <Text style={styles.actionButtonText}>
                    {isLoaded ? 'Unload' : 'Load'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, styles.deleteButton]}
                onPress={() => handleDelete(model)}
              >
                <Ionicons name="trash" size={16} color={GameColors.destructive} />
                <Text style={[styles.actionButtonText, { color: GameColors.destructive }]}>Delete</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    );
  };

  const renderStorageCard = () => (
    <View style={[styles.storageCard, { backgroundColor: GameColors.card }]}>
      <View style={styles.storageHeader}>
        <View style={styles.storageInfo}>
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <Ionicons name="server" size={24} color={GameColors.primary} />
          </Animated.View>
          <View style={styles.storageText}>
            <Text style={[styles.storageTitle, { color: GameColors.foreground }]}>Available Storage</Text>
            <Text style={[styles.storageAmount, { color: GameColors.primary }]}>
              {formatBytes(availableSpace)}
            </Text>
          </View>
        </View>
        <View style={styles.modelStats}>
          <View style={styles.statItem}>
            <Text style={[styles.statNumber, { color: GameColors.success }]}>{downloadedModels.length}</Text>
            <Text style={[styles.statLabel, { color: GameColors.mutedForeground }]}>Downloaded</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statNumber, { color: GameColors.warning }]}>{downloadingModels.size}</Text>
            <Text style={[styles.statLabel, { color: GameColors.mutedForeground }]}>Downloading</Text>
          </View>
        </View>
      </View>
      {currentLoadedModel && (
        <View style={styles.loadedModelInfo}>
          <View style={styles.loadedModelBadge}>
            <Ionicons name="flash" size={16} color={GameColors.success} />
            <Text style={[styles.loadedModelText, { color: GameColors.foreground }]}>
              Active: {currentLoadedModel.name}
            </Text>
          </View>
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: GameColors.background }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refreshModels} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.title, { color: GameColors.foreground }]}>AI Models</Text>
            <Text style={[styles.subtitle, { color: GameColors.mutedForeground }]}>
              Manage your offline AI models
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.tokenButton, { borderColor: GameColors.primary }]}
            onPress={() => setShowTokenInput(!showTokenInput)}
          >
            <Ionicons name="key" size={20} color={GameColors.primary} />
          </TouchableOpacity>
        </View>

        {/* Storage Info */}
        {renderStorageCard()}

        {/* Auth Token Input */}
        {showTokenInput && (
          <View style={[styles.tokenCard, { backgroundColor: GameColors.card }]}>
            <View style={styles.tokenHeader}>
              <Ionicons name="shield-checkmark" size={20} color={GameColors.primary} />
              <Text style={[styles.tokenTitle, { color: GameColors.foreground }]}>
                Hugging Face Token
              </Text>
            </View>
            <Text style={[styles.tokenDescription, { color: GameColors.mutedForeground }]}>
              Required for private models. Get your token from huggingface.co/settings/tokens
            </Text>
            <TextInput
              style={[styles.tokenInput, { borderColor: GameColors.border, color: GameColors.foreground, backgroundColor: GameColors.background }]}
              value={tokenInput}
              onChangeText={setTokenInput}
              placeholder="hf_..."
              placeholderTextColor={GameColors.mutedForeground}
              secureTextEntry
            />
            <View style={styles.tokenActions}>
              <TouchableOpacity
                style={[styles.tokenActionButton]}
                onPress={saveAuthToken}
              >
                <LinearGradient
                  colors={GameColors.gradients.primary as any}
                  style={styles.tokenGradientButton}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Text style={styles.tokenActionText}>Save Token</Text>
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tokenActionButton, styles.tokenCancelButton]}
                onPress={() => setShowTokenInput(false)}
              >
                <Text style={[styles.tokenActionText, { color: GameColors.foreground }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Error Display */}
        {error && (
          <View style={styles.errorCard}>
            <View style={styles.errorContent}>
              <Ionicons name="alert-circle" size={20} color={GameColors.destructive} />
              <Text style={[styles.errorText, { color: GameColors.destructive }]}>{error}</Text>
            </View>
            <TouchableOpacity onPress={clearError}>
              <Ionicons name="close" size={20} color={GameColors.destructive} />
            </TouchableOpacity>
          </View>
        )}

        {/* Downloaded Models Section */}
        {downloadedModels.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: GameColors.foreground }]}>
                Downloaded Models ({downloadedModels.length})
              </Text>
              <View style={styles.achievementBadge}>
                <Ionicons name="trophy" size={16} color={GameColors.levelGold} />
                <Text style={styles.achievementText}>Collector!</Text>
              </View>
            </View>
            {downloadedModels.map(renderModelCard)}
          </View>
        )}

        {/* Available Models Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: GameColors.foreground }]}>
            Available Models ({availableModels.filter(m => !m.isDownloaded).length})
          </Text>
          {availableModels
            .filter(model => !model.isDownloaded)
            .map(renderModelCard)}
        </View>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
  },
  tokenButton: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 2,
    backgroundColor: GameColors.primary + '20',
  },
  storageCard: {
    padding: 20,
    borderRadius: 16,
    marginBottom: 24,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  storageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  storageInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  storageText: {
    marginLeft: 12,
    flex: 1,
  },
  storageTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  storageAmount: {
    fontSize: 18,
    fontWeight: '700',
  },
  modelStats: {
    flexDirection: 'row',
    gap: 16,
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 20,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 12,
    marginTop: 2,
  },
  loadedModelInfo: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: GameColors.border,
  },
  loadedModelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loadedModelText: {
    fontSize: 14,
    fontWeight: '600',
  },
  tokenCard: {
    padding: 20,
    borderRadius: 16,
    marginBottom: 24,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  tokenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  tokenTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  tokenDescription: {
    fontSize: 14,
    marginBottom: 16,
    lineHeight: 20,
  },
  tokenInput: {
    borderWidth: 2,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    marginBottom: 16,
  },
  tokenActions: {
    flexDirection: 'row',
    gap: 12,
  },
  tokenActionButton: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  tokenGradientButton: {
    padding: 16,
    alignItems: 'center',
  },
  tokenCancelButton: {
    backgroundColor: GameColors.muted,
    padding: 16,
    alignItems: 'center',
    borderRadius: 12,
  },
  tokenActionText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
  errorCard: {
    backgroundColor: GameColors.destructive + '20',
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: GameColors.destructive + '30',
  },
  errorContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  errorText: {
    fontSize: 14,
    fontWeight: '500',
  },
  section: {
    marginBottom: 32,
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
  modelCard: {
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  modelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  modelInfo: {
    flex: 1,
  },
  modelName: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 6,
  },
  modelDescription: {
    fontSize: 14,
    marginBottom: 12,
    lineHeight: 20,
  },
  modelMeta: {
    flexDirection: 'row',
    gap: 12,
  },
  sizeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: GameColors.primary + '20',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  modelSize: {
    fontSize: 12,
    fontWeight: '600',
  },
  quantTag: {
    backgroundColor: GameColors.muted,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  modelQuantization: {
    fontSize: 12,
    fontWeight: '500',
  },
  loadedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  loadedText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  progressContainer: {
    marginBottom: 16,
  },
  progressBar: {
    height: 6,
    backgroundColor: GameColors.muted,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressText: {
    fontSize: 14,
    fontWeight: '600',
  },
  xpTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: GameColors.secondary + '20',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  xpText: {
    fontSize: 12,
    fontWeight: '600',
    color: GameColors.secondary,
  },
  modelActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    borderRadius: 12,
    overflow: 'hidden',
    flex: 1,
  },
  gradientButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 6,
  },
  downloadButton: {},
  loadButton: {},
  unloadButton: {},
  cancelButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: GameColors.destructive,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  deleteButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: GameColors.destructive,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  actionButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
});
