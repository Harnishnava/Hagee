import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Switch,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { GameColors } from '@/constants/GameColors';

export default function SettingsScreen() {
  const { colorScheme, toggleColorScheme, isSystemTheme, setIsSystemTheme } = useTheme();

  const handleSystemThemeToggle = (value: boolean) => {
    setIsSystemTheme(value);
  };

  const handleManualThemeToggle = () => {
    if (!isSystemTheme) {
      toggleColorScheme();
    }
  };

  const showAbout = () => {
    Alert.alert(
      'About Hagee',
      'Hagee is an offline AI-powered study companion that helps you generate quizzes from your study materials using local AI models.\n\nVersion: 1.0.0\nBuilt with React Native & Expo',
      [{ text: 'OK' }]
    );
  };

  const SettingCard = ({ 
    title, 
    subtitle, 
    icon, 
    onPress, 
    rightComponent 
  }: {
    title: string;
    subtitle?: string;
    icon: string;
    onPress?: () => void;
    rightComponent?: React.ReactNode;
  }) => (
    <TouchableOpacity
      style={[styles.settingCard, { backgroundColor: GameColors.card }]}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={styles.settingIcon}>
        <Ionicons name={icon as any} size={24} color={GameColors.primary} />
      </View>
      <View style={styles.settingContent}>
        <Text style={[styles.settingTitle, { color: GameColors.foreground }]}>{title}</Text>
        {subtitle && (
          <Text style={[styles.settingSubtitle, { color: GameColors.mutedForeground }]}>
            {subtitle}
          </Text>
        )}
      </View>
      {rightComponent && (
        <View style={styles.settingRight}>
          {rightComponent}
        </View>
      )}
      {onPress && !rightComponent && (
        <View style={styles.settingRight}>
          <Ionicons name="chevron-forward" size={20} color={GameColors.mutedForeground} />
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: GameColors.background }]}>
      <ScrollView style={styles.scrollView}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: GameColors.foreground }]}>Settings</Text>
          <Text style={[styles.subtitle, { color: GameColors.mutedForeground }]}>
            Customize your Hagee experience
          </Text>
        </View>

        {/* Theme Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: GameColors.foreground }]}>Appearance</Text>
          
          <SettingCard
            title="Use System Theme"
            subtitle={`Follow your device's ${colorScheme} mode setting`}
            icon="phone-portrait-outline"
            rightComponent={
              <Switch
                value={isSystemTheme}
                onValueChange={handleSystemThemeToggle}
                trackColor={{ false: '#767577', true: GameColors.primary + '40' }}
                thumbColor={isSystemTheme ? GameColors.primary : '#f4f3f4'}
              />
            }
          />

          {!isSystemTheme && (
            <SettingCard
              title="Dark Mode"
              subtitle={`Currently using ${colorScheme} mode`}
              icon={colorScheme === 'dark' ? 'moon' : 'sunny'}
              rightComponent={
                <Switch
                  value={colorScheme === 'dark'}
                  onValueChange={handleManualThemeToggle}
                  trackColor={{ false: '#767577', true: GameColors.primary + '40' }}
                  thumbColor={colorScheme === 'dark' ? GameColors.primary : '#f4f3f4'}
                />
              }
            />
          )}
        </View>

        {/* App Info Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: GameColors.foreground }]}>About</Text>
          
          <SettingCard
            title="About Hagee"
            subtitle="Version, credits, and more information"
            icon="information-circle-outline"
            onPress={showAbout}
          />

          <SettingCard
            title="Storage Usage"
            subtitle="Manage downloaded models and documents"
            icon="folder-outline"
            onPress={() => Alert.alert('Coming Soon', 'Storage management features will be available in a future update.')}
          />
        </View>

        {/* Current Theme Status */}
        <View style={[styles.statusCard, { backgroundColor: GameColors.card }]}>
          <View style={styles.statusInfo}>
            <Ionicons
              name={colorScheme === 'dark' ? 'moon' : 'sunny'}
              size={20}
              color={GameColors.primary}
            />
            <View style={styles.statusText}>
              <Text style={[styles.statusTitle, { color: GameColors.foreground }]}>
                Current Theme: {colorScheme === 'dark' ? 'Dark' : 'Light'}
              </Text>
              <Text style={[styles.statusSubtitle, { color: GameColors.mutedForeground }]}>
                {isSystemTheme ? 'Following system preference' : 'Manual selection'}
              </Text>
            </View>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: GameColors.mutedForeground }]}>
            Hagee - Your Offline AI Study Companion
          </Text>
          <Text style={[styles.footerText, { color: GameColors.mutedForeground }]}>
            Made with ❤️ for students
          </Text>
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
    padding: 16,
  },
  header: {
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
    marginLeft: 4,
  },
  settingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  settingIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  settingContent: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  settingSubtitle: {
    fontSize: 14,
  },
  settingRight: {
    marginLeft: 12,
  },
  statusCard: {
    padding: 20,
    borderRadius: 12,
    marginBottom: 32,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  statusInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusText: {
    marginLeft: 12,
    flex: 1,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  statusSubtitle: {
    fontSize: 14,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  footerText: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 4,
  },
});
