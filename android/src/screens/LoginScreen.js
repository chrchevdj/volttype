import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { login, signup } from '../services/auth';

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

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignup, setIsSignup] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError('');
    if (!email.trim() || !password) {
      setError('Enter email and password');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      if (isSignup) {
        await signup(email.trim(), password);
      } else {
        await login(email.trim(), password);
      }
      navigation.replace('Main');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.title}>VoltType</Text>
        <Text style={styles.subtitle}>AI-powered voice typing</Text>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <TextInput
          style={styles.input}
          placeholder="Email address"
          placeholderTextColor={COLORS.text3}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          textContentType="emailAddress"
        />

        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={COLORS.text3}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          textContentType="password"
        />

        <TouchableOpacity
          style={styles.submitBtn}
          onPress={handleSubmit}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitText}>
              {isSignup ? 'Create Account' : 'Sign In'}
            </Text>
          )}
        </TouchableOpacity>

        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>
            {isSignup ? 'Already have an account?' : "Don't have an account?"}
          </Text>
          <TouchableOpacity onPress={() => setIsSignup(!isSignup)}>
            <Text style={styles.toggleLink}>
              {isSignup ? 'Sign in' : 'Create one'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 20,
    padding: 36,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: COLORS.accent,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.text3,
    marginBottom: 24,
  },
  errorBox: {
    backgroundColor: 'rgba(248,113,113,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.3)',
    borderRadius: 10,
    padding: 10,
    width: '100%',
    marginBottom: 12,
  },
  errorText: {
    color: COLORS.red,
    fontSize: 13,
    textAlign: 'center',
  },
  input: {
    width: '100%',
    padding: 12,
    paddingHorizontal: 16,
    marginBottom: 12,
    backgroundColor: 'rgba(12,18,34,0.8)',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    color: COLORS.text,
    fontSize: 15,
  },
  submitBtn: {
    width: '100%',
    padding: 13,
    backgroundColor: COLORS.accent,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 12,
  },
  submitText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 6,
  },
  toggleLabel: {
    fontSize: 13,
    color: COLORS.text3,
  },
  toggleLink: {
    fontSize: 13,
    color: COLORS.accent,
    fontWeight: '600',
  },
});
