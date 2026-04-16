import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Share,
  Alert,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { transcribe, cleanText, getUsage } from '../services/api';
import { joinVoltType } from '../services/auth';

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

const HISTORY_KEY = 'volttype_history';

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

async function saveToHistory(text, language) {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    const history = raw ? JSON.parse(raw) : [];
    const entry = {
      id: Date.now().toString() + Math.random().toString(36).slice(2, 8),
      text,
      language,
      timestamp: Date.now(),
    };
    history.push(entry);
    // Keep only the last 200 entries to avoid storage bloat
    if (history.length > 200) {
      history.splice(0, history.length - 200);
    }
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    // Non-critical — don't block the user
  }
}

async function checkConnectivity() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    await fetch('https://volttype-api.crcaway.workers.dev/v1/usage', {
      method: 'HEAD',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return true;
  } catch {
    return false;
  }
}

export default function HomeScreen({ navigation }) {
  const [recording, setRecording] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [resultText, setResultText] = useState('');
  const [sessionCount, setSessionCount] = useState(0);
  const [remaining, setRemaining] = useState(null);
  const [copied, setCopied] = useState(false);
  const [offline, setOffline] = useState(false);
  const languageRef = useRef('en');
  const outputStyleRef = useRef('clean');

  const limitReached = remaining != null && remaining <= 0;

  // Load usage and settings on mount + when returning from Settings
  useEffect(() => {
    loadUsage();
    const unsubscribe = navigation.addListener('focus', () => {
      loadSettings();
      loadUsage();
    });
    loadSettings();
    return unsubscribe;
  }, [navigation]);

  async function loadSettings() {
    const lang = await AsyncStorage.getItem('volttype_language');
    const style = await AsyncStorage.getItem('volttype_output_style');
    if (lang) languageRef.current = lang;
    if (style) outputStyleRef.current = style;
  }

  async function loadUsage() {
    try {
      const usage = await getUsage();
      setRemaining(usage.remainingSeconds);
      setOffline(false);
    } catch (err) {
      if (err && err.code === 'NOT_A_VOLTTYPE_USER') {
        promptJoinVoltType();
        return;
      }
      if (err && err.code === 'NOT_AUTHENTICATED') {
        redirectToLogin();
        return;
      }
      // Check if it's a connectivity issue
      const online = await checkConnectivity();
      setOffline(!online);
    }
  }

  function redirectToLogin() {
    Alert.alert('Session expired', 'Please sign in again.', [{
      text: 'OK',
      onPress: () => {
        navigation.getParent()?.reset({ index: 0, routes: [{ name: 'Login' }] });
      },
    }]);
  }

  function promptJoinVoltType() {
    Alert.alert(
      'Add VoltType to this account',
      'This account is signed up for another product but not VoltType yet. Add VoltType now to start dictating.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Add VoltType',
          onPress: async () => {
            try {
              await joinVoltType();
              Alert.alert('Welcome!', 'VoltType is now active on your account.');
              loadUsage();
            } catch (e) {
              Alert.alert('Could not add VoltType', e.message || 'Please try again.');
            }
          },
        },
      ],
    );
  }

  async function startRecording() {
    // Check connectivity first
    if (offline) {
      const online = await checkConnectivity();
      if (!online) {
        Alert.alert(
          'No connection',
          'Please check your internet connection and try again.',
        );
        return;
      }
      setOffline(false);
    }

    if (limitReached) {
      Alert.alert(
        'Daily limit reached',
        'Upgrade your plan for more minutes at volttype.com',
      );
      return;
    }

    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Permission needed',
          'Microphone access is required for voice dictation.',
        );
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording: rec } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      setRecording(rec);
    } catch (err) {
      Alert.alert('Error', 'Could not start recording: ' + err.message);
    }
  }

  async function stopRecording() {
    if (!recording) return;

    setProcessing(true);
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);

      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

      // Transcribe with selected language
      const result = await transcribe(uri, languageRef.current);

      if (result.text) {
        // Apply LLM cleanup with selected output style
        let finalText = result.text;
        try {
          const cleaned = await cleanText(result.text, outputStyleRef.current);
          if (cleaned.text) finalText = cleaned.text;
        } catch {
          // Cleanup failed — use raw transcription
        }

        setResultText((prev) => (prev ? prev + ' ' + finalText : finalText));
        setSessionCount((c) => c + 1);
        if (result.usage?.remaining != null) {
          setRemaining(result.usage.remaining);
        }

        // Save to local history
        await saveToHistory(finalText, languageRef.current);
      }
    } catch (err) {
      if (err && err.code === 'LIMIT_REACHED') {
        setRemaining(0);
        Alert.alert(
          'Daily limit reached',
          'Upgrade your plan for more minutes at volttype.com',
        );
      } else if (err && err.code === 'NOT_A_VOLTTYPE_USER') {
        promptJoinVoltType();
      } else if (err && (err.code === 'NOT_AUTHENTICATED' || err.message === 'Not authenticated')) {
        redirectToLogin();
      } else {
        // Could be a network error
        const online = await checkConnectivity();
        if (!online) {
          setOffline(true);
          Alert.alert(
            'No connection',
            'Could not reach the server. Please check your internet connection.',
          );
        } else {
          Alert.alert('Error', err.message || 'Something went wrong');
        }
      }
    } finally {
      setProcessing(false);
    }
  }

  function handleMicPress() {
    if (processing) return;
    if (recording) {
      stopRecording();
    } else {
      startRecording();
    }
  }

  async function handleCopy() {
    if (!resultText) return;
    await Clipboard.setStringAsync(resultText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleShare() {
    if (!resultText) return;
    try {
      await Share.share({ message: resultText });
    } catch {
      // User cancelled
    }
  }

  function handleClear() {
    setResultText('');
  }

  const micDisabled = processing || limitReached;

  const micLabel = processing
    ? 'Transcribing...'
    : recording
      ? 'Tap to stop'
      : limitReached
        ? 'Daily limit reached'
        : 'Tap to start voice typing';

  const micEmoji = processing ? '\u23F3' : recording ? '\u23F9' : '\uD83C\uDF99';

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.logo}>VoltType</Text>
        <Text style={styles.tagline}>Tap to speak. Text appears.</Text>
      </View>

      {/* Offline banner */}
      {offline && (
        <TouchableOpacity style={styles.offlineBanner} onPress={loadUsage}>
          <Text style={styles.offlineText}>
            No internet connection. Tap to retry.
          </Text>
        </TouchableOpacity>
      )}

      {/* Remaining time - prominent display */}
      <View style={styles.remainingBar}>
        <Text
          style={[
            styles.remainingValue,
            limitReached && styles.remainingValueDepleted,
          ]}
        >
          {remaining != null ? formatTime(remaining) : '--:--'}
        </Text>
        <Text style={styles.remainingLabel}>
          {limitReached ? 'LIMIT REACHED' : 'TIME REMAINING TODAY'}
        </Text>
        {limitReached && (
          <Text style={styles.upgradeHint}>
            Upgrade at volttype.com for more time
          </Text>
        )}
      </View>

      {/* Sessions count */}
      {sessionCount > 0 && (
        <View style={styles.sessionRow}>
          <Text style={styles.sessionText}>
            {sessionCount} recording{sessionCount !== 1 ? 's' : ''} this session
          </Text>
        </View>
      )}

      {/* Mic button */}
      <View style={styles.micArea}>
        <TouchableOpacity
          style={[
            styles.micRing,
            recording && styles.micRingRecording,
            processing && styles.micRingProcessing,
            limitReached && styles.micRingDisabled,
          ]}
          onPress={handleMicPress}
          activeOpacity={0.8}
          disabled={micDisabled}
        >
          {processing ? (
            <ActivityIndicator size="large" color="#fff" />
          ) : (
            <Text style={[styles.micEmoji, limitReached && styles.micEmojiDisabled]}>
              {micEmoji}
            </Text>
          )}
        </TouchableOpacity>
        <Text style={[styles.micLabel, limitReached && styles.micLabelDepleted]}>
          {micLabel}
        </Text>
      </View>

      {/* Result */}
      <ScrollView style={styles.resultScroll} contentContainerStyle={styles.resultContent}>
        <View style={styles.resultCard}>
          {resultText ? (
            <Text style={styles.resultText}>{resultText}</Text>
          ) : (
            <Text style={styles.placeholder}>Your text will appear here</Text>
          )}
        </View>

        {resultText ? (
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.copyBtn]}
              onPress={handleCopy}
            >
              <Text style={styles.copyBtnText}>
                {copied ? 'Copied!' : 'Copy'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.shareBtn]}
              onPress={handleShare}
            >
              <Text style={styles.shareBtnText}>Share</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.clearBtn]}
              onPress={handleClear}
            >
              <Text style={styles.clearBtnText}>Clear</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Voice commands info card */}
        {!resultText && (
          <View style={styles.voiceCommandsCard}>
            <Text style={styles.voiceCommandsTitle}>Voice Commands</Text>
            <Text style={styles.voiceCommandsSubtitle}>
              Say these phrases while dictating:
            </Text>
            <View style={styles.commandRow}>
              <Text style={styles.commandLabel}>"make formal"</Text>
              <Text style={styles.commandDesc}>Polishes tone to professional</Text>
            </View>
            <View style={styles.commandRow}>
              <Text style={styles.commandLabel}>"summarize"</Text>
              <Text style={styles.commandDesc}>Condenses into key points</Text>
            </View>
            <View style={styles.commandRow}>
              <Text style={styles.commandLabel}>"bullet points"</Text>
              <Text style={styles.commandDesc}>Converts to a bulleted list</Text>
            </View>
            <View style={styles.commandRow}>
              <Text style={styles.commandLabel}>"new paragraph"</Text>
              <Text style={styles.commandDesc}>Starts a new paragraph</Text>
            </View>
            <View style={styles.commandRow}>
              <Text style={styles.commandLabel}>"translate to [lang]"</Text>
              <Text style={styles.commandDesc}>Translates your text</Text>
            </View>
          </View>
        )}
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
    paddingTop: 56,
    paddingBottom: 4,
    alignItems: 'center',
  },
  logo: {
    fontSize: 24,
    fontWeight: '900',
    color: COLORS.accent,
  },
  tagline: {
    fontSize: 13,
    color: COLORS.text3,
    marginTop: 4,
  },

  /* Offline banner */
  offlineBanner: {
    backgroundColor: 'rgba(248,113,113,0.15)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(248,113,113,0.3)',
    paddingVertical: 10,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  offlineText: {
    fontSize: 13,
    color: COLORS.red,
    fontWeight: '600',
  },

  /* Remaining time bar */
  remainingBar: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  remainingValue: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.accent,
  },
  remainingValueDepleted: {
    color: COLORS.red,
  },
  remainingLabel: {
    fontSize: 10,
    color: COLORS.text3,
    letterSpacing: 1,
    marginTop: 2,
  },
  upgradeHint: {
    fontSize: 12,
    color: COLORS.accent2,
    marginTop: 4,
  },

  /* Session row */
  sessionRow: {
    alignItems: 'center',
    paddingBottom: 4,
  },
  sessionText: {
    fontSize: 12,
    color: COLORS.text3,
  },

  /* Mic */
  micArea: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  micRing: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  micRingRecording: {
    backgroundColor: COLORS.red,
    shadowColor: COLORS.red,
  },
  micRingProcessing: {
    backgroundColor: COLORS.accent,
    opacity: 0.7,
  },
  micRingDisabled: {
    backgroundColor: COLORS.text3,
    shadowColor: COLORS.text3,
    opacity: 0.5,
  },
  micEmoji: {
    fontSize: 40,
    color: '#fff',
  },
  micEmojiDisabled: {
    opacity: 0.6,
  },
  micLabel: {
    fontSize: 14,
    color: COLORS.text2,
    marginTop: 12,
  },
  micLabelDepleted: {
    color: COLORS.red,
  },

  /* Result */
  resultScroll: {
    flex: 1,
    paddingHorizontal: 20,
  },
  resultContent: {
    paddingBottom: 40,
  },
  resultCard: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: 20,
    minHeight: 80,
  },
  resultText: {
    fontSize: 16,
    lineHeight: 26,
    color: COLORS.text,
  },
  placeholder: {
    fontSize: 14,
    color: COLORS.text3,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  actionBtn: {
    flex: 1,
    padding: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  copyBtn: {
    backgroundColor: COLORS.accent,
  },
  copyBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  shareBtn: {
    backgroundColor: 'rgba(59,130,246,0.15)',
  },
  shareBtnText: {
    color: COLORS.accent2,
    fontSize: 13,
    fontWeight: '600',
  },
  clearBtn: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  clearBtnText: {
    color: COLORS.text2,
    fontSize: 13,
    fontWeight: '600',
  },

  /* Voice Commands Card */
  voiceCommandsCard: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 16,
    marginTop: 16,
  },
  voiceCommandsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
  },
  voiceCommandsSubtitle: {
    fontSize: 12,
    color: COLORS.text3,
    marginBottom: 12,
  },
  commandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  commandLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.accent,
    width: 140,
  },
  commandDesc: {
    fontSize: 12,
    color: COLORS.text2,
    flex: 1,
  },
});
