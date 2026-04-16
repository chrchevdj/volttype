import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logout, getCurrentUserEmail } from '../services/auth';

const COLORS = {
  bg: '#0c1222',
  card: 'rgba(22,33,55,0.85)',
  accent: '#38bd9c',
  accent2: '#3b82f6',
  text: '#e2e8f0',
  text2: '#94a3b8',
  text3: '#64748b',
  red: '#f87171',
  border: 'rgba(255,255,255,0.08)',
};

// Whisper supports 99 languages — listed alphabetically by English name.
const LANGUAGES = [
  { code: 'auto', label: 'Auto-detect' },
  { code: 'af', label: 'Afrikaans' },
  { code: 'sq', label: 'Albanian' },
  { code: 'ar', label: 'Arabic' },
  { code: 'hy', label: 'Armenian' },
  { code: 'az', label: 'Azerbaijani' },
  { code: 'be', label: 'Belarusian' },
  { code: 'bs', label: 'Bosnian' },
  { code: 'bg', label: 'Bulgarian' },
  { code: 'ca', label: 'Catalan' },
  { code: 'zh', label: 'Chinese' },
  { code: 'hr', label: 'Croatian' },
  { code: 'cs', label: 'Czech' },
  { code: 'da', label: 'Danish' },
  { code: 'nl', label: 'Dutch' },
  { code: 'en', label: 'English' },
  { code: 'et', label: 'Estonian' },
  { code: 'fi', label: 'Finnish' },
  { code: 'fr', label: 'French' },
  { code: 'gl', label: 'Galician' },
  { code: 'de', label: 'German' },
  { code: 'el', label: 'Greek' },
  { code: 'he', label: 'Hebrew' },
  { code: 'hi', label: 'Hindi' },
  { code: 'hu', label: 'Hungarian' },
  { code: 'is', label: 'Icelandic' },
  { code: 'id', label: 'Indonesian' },
  { code: 'it', label: 'Italian' },
  { code: 'ja', label: 'Japanese' },
  { code: 'kn', label: 'Kannada' },
  { code: 'kk', label: 'Kazakh' },
  { code: 'ko', label: 'Korean' },
  { code: 'lv', label: 'Latvian' },
  { code: 'lt', label: 'Lithuanian' },
  { code: 'mk', label: 'Macedonian' },
  { code: 'ms', label: 'Malay' },
  { code: 'mr', label: 'Marathi' },
  { code: 'mi', label: 'Māori' },
  { code: 'ne', label: 'Nepali' },
  { code: 'no', label: 'Norwegian' },
  { code: 'fa', label: 'Persian' },
  { code: 'pl', label: 'Polish' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'ro', label: 'Romanian' },
  { code: 'ru', label: 'Russian' },
  { code: 'sr', label: 'Serbian' },
  { code: 'sk', label: 'Slovak' },
  { code: 'sl', label: 'Slovenian' },
  { code: 'es', label: 'Spanish' },
  { code: 'sw', label: 'Swahili' },
  { code: 'sv', label: 'Swedish' },
  { code: 'tl', label: 'Tagalog' },
  { code: 'ta', label: 'Tamil' },
  { code: 'th', label: 'Thai' },
  { code: 'tr', label: 'Turkish' },
  { code: 'uk', label: 'Ukrainian' },
  { code: 'ur', label: 'Urdu' },
  { code: 'vi', label: 'Vietnamese' },
  { code: 'cy', label: 'Welsh' },
];

const OUTPUT_STYLES = [
  { value: 'clean', label: 'Clean Text', desc: 'Punctuation and basic formatting' },
  { value: 'formal', label: 'Formal', desc: 'Professional, polished tone' },
  { value: 'bullet_points', label: 'Bullet Points', desc: 'Organized as a list' },
];

export default function SettingsScreen({ navigation }) {
  const [language, setLanguage] = useState('en');
  const [outputStyle, setOutputStyle] = useState('clean');
  const [email, setEmail] = useState(null);

  useEffect(() => {
    (async () => {
      const savedLang = await AsyncStorage.getItem('volttype_language');
      const savedStyle = await AsyncStorage.getItem('volttype_output_style');
      const currentEmail = await getCurrentUserEmail();
      if (savedLang) setLanguage(savedLang);
      if (savedStyle) setOutputStyle(savedStyle);
      setEmail(currentEmail);
    })();
  }, []);

  async function selectLanguage(code) {
    setLanguage(code);
    await AsyncStorage.setItem('volttype_language', code);
  }

  async function selectOutputStyle(value) {
    setOutputStyle(value);
    await AsyncStorage.setItem('volttype_output_style', value);
  }

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await logout();
          navigation.getParent()?.reset({
            index: 0,
            routes: [{ name: 'Login' }],
          });
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Account — tells the user WHO is signed in (prevents confusion
            after an update / backup restore where the app opens straight to Home). */}
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.accountCard}>
          <View style={styles.accountAvatar}>
            <Text style={styles.accountAvatarText}>
              {email ? email.charAt(0).toUpperCase() : '?'}
            </Text>
          </View>
          <View style={styles.accountInfo}>
            <Text style={styles.accountLabel}>Signed in as</Text>
            <Text style={styles.accountEmail} numberOfLines={1} ellipsizeMode="middle">
              {email || 'Unknown account'}
            </Text>
          </View>
          <TouchableOpacity style={styles.accountSignOutBtn} onPress={handleLogout}>
            <Text style={styles.accountSignOutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        {/* Language */}
        <Text style={styles.sectionTitle}>Language</Text>
        <View style={styles.card}>
          {LANGUAGES.map((lang) => (
            <TouchableOpacity
              key={lang.code}
              style={[
                styles.optionRow,
                language === lang.code && styles.optionSelected,
              ]}
              onPress={() => selectLanguage(lang.code)}
            >
              <Text
                style={[
                  styles.optionLabel,
                  language === lang.code && styles.optionLabelSelected,
                ]}
              >
                {lang.label}
              </Text>
              {language === lang.code && (
                <Text style={styles.checkmark}>{'\u2713'}</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Output Style */}
        <Text style={styles.sectionTitle}>Output Style</Text>
        <View style={styles.card}>
          {OUTPUT_STYLES.map((style) => (
            <TouchableOpacity
              key={style.value}
              style={[
                styles.optionRow,
                outputStyle === style.value && styles.optionSelected,
              ]}
              onPress={() => selectOutputStyle(style.value)}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.optionLabel,
                    outputStyle === style.value && styles.optionLabelSelected,
                  ]}
                >
                  {style.label}
                </Text>
                <Text style={styles.optionDesc}>{style.desc}</Text>
              </View>
              {outputStyle === style.value && (
                <Text style={styles.checkmark}>{'\u2713'}</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.version}>VoltType v1.1.2</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  header: {
    alignItems: 'center',
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 60,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text3,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
    marginTop: 12,
  },
  card: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 20,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  optionSelected: {
    backgroundColor: 'rgba(56,189,156,0.08)',
  },
  optionLabel: {
    fontSize: 15,
    color: COLORS.text,
  },
  optionLabelSelected: {
    color: COLORS.accent,
    fontWeight: '600',
  },
  optionDesc: {
    fontSize: 12,
    color: COLORS.text3,
    marginTop: 2,
  },
  checkmark: {
    fontSize: 18,
    color: COLORS.accent,
    fontWeight: '700',
  },
  /* Account card (top of Settings) */
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
    gap: 12,
  },
  accountAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(124,58,237,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountAvatarText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#a78bfa',
  },
  accountInfo: {
    flex: 1,
    minWidth: 0,
  },
  accountLabel: {
    fontSize: 11,
    color: COLORS.text3,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  accountEmail: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '600',
  },
  accountSignOutBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(248,113,113,0.12)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.25)',
  },
  accountSignOutText: {
    color: COLORS.red,
    fontSize: 12,
    fontWeight: '700',
  },

  version: {
    textAlign: 'center',
    color: COLORS.text3,
    fontSize: 12,
    marginTop: 24,
  },
});
