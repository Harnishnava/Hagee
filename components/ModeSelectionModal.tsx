import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColor } from '@/hooks/useThemeColor';
import { validateAPIKeys } from '@/config/apiConfig';

interface ModeSelectionModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectMode: (mode: 'online' | 'offline') => void;
  documentName: string;
  hasOfflineModel: boolean;
}

export function ModeSelectionModal({
  visible,
  onClose,
  onSelectMode,
  documentName,
  hasOfflineModel,
}: ModeSelectionModalProps) {
  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const tintColor = useThemeColor({}, 'tint');
  const cardColor = useThemeColor({}, 'background');

  const handleModeSelection = (mode: 'online' | 'offline') => {
    if (mode === 'online') {
      const apiValidation = validateAPIKeys();
      if (!apiValidation.isValid) {
        Alert.alert(
          'API Keys Required',
          `Please configure your API keys in the .env file:\n${apiValidation.missing.join(', ')}`,
          [{ text: 'OK' }]
        );
        return;
      }
    } else if (mode === 'offline' && !hasOfflineModel) {
      Alert.alert(
        'No Offline Model',
        'Please download an AI model from the Models tab first.',
        [{ text: 'OK' }]
      );
      return;
    }

    onSelectMode(mode);
    onClose();
  };

  const ModeCard = ({ 
    mode, 
    title, 
    subtitle, 
    icon, 
    available 
  }: {
    mode: 'online' | 'offline';
    title: string;
    subtitle: string;
    icon: string;
    available: boolean;
  }) => (
    <TouchableOpacity
      style={[
        styles.modeCard,
        { backgroundColor: cardColor },
        !available && styles.disabledCard,
      ]}
      onPress={() => handleModeSelection(mode)}
      disabled={!available}
    >
      <View style={[styles.modeIcon, { backgroundColor: tintColor + '20' }]}>
        <Ionicons 
          name={icon as any} 
          size={32} 
          color={available ? tintColor : textColor + '40'} 
        />
      </View>
      <View style={styles.modeContent}>
        <Text style={[styles.modeTitle, { color: available ? textColor : textColor + '40' }]}>
          {title}
        </Text>
        <Text style={[styles.modeSubtitle, { color: available ? textColor : textColor + '40', opacity: 0.7 }]}>
          {subtitle}
        </Text>
      </View>
      <View style={styles.modeArrow}>
        <Ionicons 
          name="chevron-forward" 
          size={20} 
          color={available ? textColor : textColor + '40'} 
        />
      </View>
    </TouchableOpacity>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor }]}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: textColor }]}>
              Choose Processing Mode
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={textColor} />
            </TouchableOpacity>
          </View>

          {/* Document Info */}
          <View style={[styles.documentInfo, { backgroundColor: cardColor }]}>
            <Ionicons name="document-text" size={20} color={tintColor} />
            <Text style={[styles.documentName, { color: textColor }]}>
              {documentName}
            </Text>
          </View>

          {/* Mode Selection */}
          <View style={styles.modesContainer}>
            <ModeCard
              mode="online"
              title="Online Processing"
              subtitle="Fast OCR + Groq AI models"
              icon="cloud"
              available={validateAPIKeys().isValid}
            />

            <ModeCard
              mode="offline"
              title="Offline Processing"
              subtitle="Local OCR + Downloaded AI models"
              icon="phone-portrait"
              available={hasOfflineModel}
            />
          </View>

          {/* Info */}
          <View style={styles.infoContainer}>
            <Ionicons name="information-circle" size={16} color={tintColor} />
            <Text style={[styles.infoText, { color: textColor, opacity: 0.7 }]}>
              Online mode requires internet and API keys. Offline mode works without internet but needs downloaded models.
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  closeButton: {
    padding: 4,
  },
  documentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 24,
    gap: 8,
  },
  documentName: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  modesContainer: {
    gap: 12,
    marginBottom: 20,
  },
  modeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  disabledCard: {
    opacity: 0.6,
  },
  modeIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  modeContent: {
    flex: 1,
  },
  modeTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  modeSubtitle: {
    fontSize: 14,
  },
  modeArrow: {
    marginLeft: 8,
  },
  infoContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
    borderRadius: 8,
  },
  infoText: {
    fontSize: 12,
    flex: 1,
    lineHeight: 16,
  },
});
