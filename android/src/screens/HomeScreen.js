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

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function HomeScreen({ navigation }) {
  const [recording, setRecording] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [resultText, setResultText] = useState('');
  const [sessionCount, setSessionCount] = useState(0);
  const [remaining, setRemaining] = useState(null);
  const [copied, setCopied] = useState(false);
  const languageRef = useRef('en');
  const outputStyleRef = useRef('clean');

  // Load usage and settings on mount + when returning from Settings
  useEffect(() => {
    loadUsage();
    const unsubscribe = navigation.addListener('focus', loadSettings);
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
    } catch {
      // Silently fail — usage display is non-critical
    }
  }

  async function startRecording() {
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
      }
    } catch (err) {
      if (err.message === 'LIMIT_REACHED') {
        Alert.alert(
          'Daily limit reached',
          'Upgrade your plan for more minutes at volttype.com',
        );
      } else if (err.message === 'Not authenticated') {
        Alert.alert(
          'Session expired',
          'Please sign in again.',
          [{ text: 'OK', onPress: () => navigation.replace('Login') }],
        );
      } else {
        Alert.alert('Error', err.message);
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

  const micLabel = processing
    ? 'Transcribing...'
    : recording
      ? 'Tap to stop'
      : 'Tap to start voice typing';

  const micEmoji = processing ? '\u23F3' : recording ? '\u23F9' : '\uD83C\uDF99';

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.logo}>VoltType</Text>
        <Text style={styles.tagline}>Tap to speak. Text appears.</Text>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>
            {remaining != null ? formatTime(remaining) : '--:--'}
          </Text>
          <Text style={styles.statLabel}>REMAINING</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{sessionCount}</Text>
          <Text style={styles.statLabel}>SESSIONS</Text>
        </View>
      </View>

      {/* Mic button */}
      <View style={styles.micArea}>
        <TouchableOpacity
          style={[
            styles.micRing,
            recording && styles.micRingRecording,
            processing && styles.micRingProcessing,
          ]}
          onPress={handleMicPress}
          activeOpacity={0.8}
          disabled={processing}
        >
          {processing ? (
            <ActivityIndicator size="large" color="#fff" />
          ) : (
            <Text style={styles.micEmoji}>{micEmoji}</Text>
          )}
        </TouchableOpacity>
        <Text style={styles.micLabel}>{micLabel}</Text>
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
      </ScrollView>

      {/* Settings gear */}
      <TouchableOpacity
        style={styles.settingsBtn}
        onPress={() => navigation.navigate('Settings')}
      >
        <Text style={styles.settingsIcon}>{'\u2699'}</Text>
      </TouchableOpacity>
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
    paddingBottom: 8,
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
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 32,
    paddingVertical: 12,
  },
  stat: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.accent,
  },
  statLabel: {
    fontSize: 10,
    color: COLORS.text3,
    letterSpacing: 0.5,
    marginTop: 2,
  },
  micArea: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  micRing: {
    width: 120,
    height: 120,
    borderRadius: 60,
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
  micEmoji: {
    fontSize: 44,
    color: '#fff',
  },
  micLabel: {
    fontSize: 14,
    color: COLORS.text2,
    marginTop: 14,
  },
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
  settingsBtn: {
    position: 'absolute',
    top: 52,
    right: 20,
    padding: 8,
  },
  settingsIcon: {
    fontSize: 22,
    color: COLORS.text2,
  },
});
