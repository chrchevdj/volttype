import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect } from '@react-navigation/native';

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

function formatTimestamp(ts) {
  const d = new Date(ts);
  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();

  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (isToday) return `Today ${time}`;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear();

  if (isYesterday) return `Yesterday ${time}`;

  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()} ${time}`;
}

function truncate(text, maxLen = 120) {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd() + '...';
}

const LANG_LABELS = {
  en: 'English',
  ro: 'Romanian',
  da: 'Danish',
  mk: 'Macedonian',
  el: 'Greek',
  de: 'German',
  fr: 'French',
  es: 'Spanish',
};

export default function HistoryScreen() {
  const [history, setHistory] = useState([]);
  const [copiedId, setCopiedId] = useState(null);

  // Reload history every time the screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, []),
  );

  async function loadHistory() {
    try {
      const raw = await AsyncStorage.getItem(HISTORY_KEY);
      if (raw) {
        const items = JSON.parse(raw);
        // Sort newest first
        items.sort((a, b) => b.timestamp - a.timestamp);
        setHistory(items);
      } else {
        setHistory([]);
      }
    } catch {
      setHistory([]);
    }
  }

  async function handleCopy(item) {
    await Clipboard.setStringAsync(item.text);
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function handleDelete(item) {
    Alert.alert('Delete', 'Remove this transcription from history?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const updated = history.filter((h) => h.id !== item.id);
          setHistory(updated);
          await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
        },
      },
    ]);
  }

  function handleClearAll() {
    if (history.length === 0) return;
    Alert.alert('Clear All', 'Delete all transcription history?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear All',
        style: 'destructive',
        onPress: async () => {
          setHistory([]);
          await AsyncStorage.removeItem(HISTORY_KEY);
        },
      },
    ]);
  }

  function renderItem({ item }) {
    const isCopied = copiedId === item.id;
    return (
      <View style={styles.historyItem}>
        <View style={styles.historyMeta}>
          <Text style={styles.historyTime}>{formatTimestamp(item.timestamp)}</Text>
          {item.language && (
            <Text style={styles.historyLang}>
              {LANG_LABELS[item.language] || item.language}
            </Text>
          )}
        </View>
        <Text style={styles.historyText}>{truncate(item.text)}</Text>
        <View style={styles.historyActions}>
          <TouchableOpacity
            style={[styles.historyBtn, styles.copyBtn]}
            onPress={() => handleCopy(item)}
          >
            <Text style={styles.copyBtnText}>
              {isCopied ? '\u2713 Copied' : 'Copy'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.historyBtn, styles.deleteBtn]}
            onPress={() => handleDelete(item)}
          >
            <Text style={styles.deleteBtnText}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>History</Text>
        {history.length > 0 && (
          <TouchableOpacity onPress={handleClearAll}>
            <Text style={styles.clearAllBtn}>Clear All</Text>
          </TouchableOpacity>
        )}
      </View>

      {history.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>{'\uD83D\uDCCB'}</Text>
          <Text style={styles.emptyTitle}>No transcriptions yet</Text>
          <Text style={styles.emptySubtitle}>
            Your voice transcriptions will appear here after you record them.
          </Text>
        </View>
      ) : (
        <FlatList
          data={history}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
  },
  clearAllBtn: {
    fontSize: 14,
    color: COLORS.red,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  historyItem: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  historyMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  historyTime: {
    fontSize: 12,
    color: COLORS.text3,
  },
  historyLang: {
    fontSize: 11,
    color: COLORS.accent,
    fontWeight: '600',
    backgroundColor: 'rgba(56,189,156,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  historyText: {
    fontSize: 14,
    lineHeight: 22,
    color: COLORS.text,
    marginBottom: 12,
  },
  historyActions: {
    flexDirection: 'row',
    gap: 10,
  },
  historyBtn: {
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  copyBtn: {
    backgroundColor: COLORS.accent,
  },
  copyBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  deleteBtn: {
    backgroundColor: 'rgba(248,113,113,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.25)',
  },
  deleteBtnText: {
    color: COLORS.red,
    fontSize: 12,
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: COLORS.text3,
    textAlign: 'center',
    lineHeight: 22,
  },
});
