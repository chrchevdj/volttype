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
  ScrollView,
  Alert,
} from 'react-native';
import { login, signup, requestPasswordReset } from '../services/auth';

const COLORS = {
  bg: '#0c1222',
  card: 'rgba(22,33,55,0.85)',
  accent: '#38bd9c',
  accent2: '#3b82f6',
  text: '#e2e8f0',
  text2: '#94a3b8',
  text3: '#64748b',
  red: '#f87171',
  amber: '#f59e0b',
  green: '#22c55e',
  border: 'rgba(255,255,255,0.08)',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 0 = too short, 1 = fair, 2 = strong
function passwordScore(value) {
  if (!value || value.length < 8) return 0;
  const hasNumber = /\d/.test(value);
  const hasSpecial = /[!@#$%^&*()_\-+=[\]{};':",.<>/?`~\\|]/.test(value);
  if (hasNumber && hasSpecial) return 2;
  if (hasNumber || hasSpecial) return 1;
  return 1;
}

export default function LoginScreen({ navigation }) {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup' | 'forgot'
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  const score = passwordScore(password);
  const strengthLabel = ['Too short', 'Fair — add a number or symbol', 'Strong'][score];
  const strengthColor = [COLORS.red, COLORS.amber, COLORS.green][score];

  function switchMode(next) {
    setMode(next);
    setError('');
    setInfo('');
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
  }

  async function handleSignIn() {
    if (!email.trim()) { setError('Enter your email'); return; }
    if (!EMAIL_RE.test(email.trim())) { setError('Please enter a valid email address'); return; }
    if (!password) { setError('Enter your password'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }

    setLoading(true);
    try {
      await login(email.trim(), password);
      navigation.replace('Main');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSignUp() {
    if (!email.trim()) { setError('Enter your email'); return; }
    if (!EMAIL_RE.test(email.trim())) { setError('Please enter a valid email address'); return; }
    if (!password) { setError('Choose a password'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (score < 1) { setError('Please use a stronger password (add numbers or symbols)'); return; }
    if (!confirmPassword) { setError('Please confirm your password'); return; }
    if (confirmPassword !== password) { setError('Passwords do not match'); return; }

    setLoading(true);
    try {
      const result = await signup(email.trim(), password, fullName);
      if (result && result.needsConfirmation) {
        setInfo(
          `Account created! We sent a confirmation link to ${email.trim()}. ` +
          `Open it to activate your account, then sign in.`,
        );
        switchMode('signin');
        setEmail(email.trim());
        return;
      }
      navigation.replace('Main');
    } catch (err) {
      if (err.code === 'USER_EXISTS') {
        switchMode('signin');
        setEmail(email.trim());
        setError(err.message);
        return;
      }
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    if (!email.trim()) { setError('Enter your email'); return; }
    if (!EMAIL_RE.test(email.trim())) { setError('Please enter a valid email address'); return; }

    setLoading(true);
    try {
      await requestPasswordReset(email.trim());
      Alert.alert(
        'Reset link sent',
        `If ${email.trim()} has a VoltType account, a reset link is on its way. Check your inbox (and spam).`,
        [{ text: 'OK', onPress: () => switchMode('signin') }],
      );
    } catch {
      setError('Could not send reset email. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function onSubmit() {
    setError('');
    setInfo('');
    if (mode === 'signin') return handleSignIn();
    if (mode === 'signup') return handleSignUp();
    if (mode === 'forgot') return handleForgotPassword();
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollInner}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <Text style={styles.title}>VoltType</Text>
          <Text style={styles.subtitle}>
            {mode === 'signup' && 'Create your account'}
            {mode === 'signin' && 'Sign in to your account'}
            {mode === 'forgot' && 'Reset your password'}
          </Text>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {info ? (
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>{info}</Text>
            </View>
          ) : null}

          {/* Full name — signup only */}
          {mode === 'signup' && (
            <TextInput
              style={styles.input}
              placeholder="Full name (optional)"
              placeholderTextColor={COLORS.text3}
              value={fullName}
              onChangeText={setFullName}
              autoCapitalize="words"
              textContentType="name"
            />
          )}

          <TextInput
            style={styles.input}
            placeholder="Email address"
            placeholderTextColor={COLORS.text3}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
          />

          {/* Password — hidden in forgot mode */}
          {mode !== 'forgot' && (
            <>
              <View style={styles.passwordRow}>
                <TextInput
                  style={[styles.input, styles.passwordInput]}
                  placeholder={mode === 'signup' ? 'Password (min 8 characters)' : 'Password'}
                  placeholderTextColor={COLORS.text3}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType={mode === 'signup' ? 'newPassword' : 'password'}
                />
                <TouchableOpacity
                  style={styles.showBtn}
                  onPress={() => setShowPassword(v => !v)}
                  activeOpacity={0.6}
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                >
                  <Text style={styles.showBtnText}>{showPassword ? 'Hide' : 'Show'}</Text>
                </TouchableOpacity>
              </View>

              {/* Password strength — signup only */}
              {mode === 'signup' && password.length > 0 && (
                <View style={styles.strengthRow}>
                  <View style={styles.strengthTrack}>
                    <View
                      style={[
                        styles.strengthFill,
                        { width: `${(score + 1) * 33.3}%`, backgroundColor: strengthColor },
                      ]}
                    />
                  </View>
                  <Text style={[styles.strengthLabel, { color: strengthColor }]}>
                    {strengthLabel}
                  </Text>
                </View>
              )}

              {/* Confirm password — signup only */}
              {mode === 'signup' && (
                <TextInput
                  style={styles.input}
                  placeholder="Confirm password"
                  placeholderTextColor={COLORS.text3}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="newPassword"
                />
              )}
            </>
          )}

          <TouchableOpacity
            style={styles.submitBtn}
            onPress={onSubmit}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitText}>
                {mode === 'signup' && 'Create Account'}
                {mode === 'signin' && 'Sign In'}
                {mode === 'forgot' && 'Send Reset Link'}
              </Text>
            )}
          </TouchableOpacity>

          {/* Forgot password link — signin only */}
          {mode === 'signin' && (
            <TouchableOpacity onPress={() => switchMode('forgot')} style={styles.forgotRow}>
              <Text style={styles.forgotLink}>Forgot your password?</Text>
            </TouchableOpacity>
          )}

          {/* Mode toggle */}
          <View style={styles.toggleRow}>
            {mode === 'signup' && (
              <>
                <Text style={styles.toggleLabel}>Already have an account?</Text>
                <TouchableOpacity onPress={() => switchMode('signin')}>
                  <Text style={styles.toggleLink}>Sign in</Text>
                </TouchableOpacity>
              </>
            )}
            {mode === 'signin' && (
              <>
                <Text style={styles.toggleLabel}>Don't have an account?</Text>
                <TouchableOpacity onPress={() => switchMode('signup')}>
                  <Text style={styles.toggleLink}>Create one</Text>
                </TouchableOpacity>
              </>
            )}
            {mode === 'forgot' && (
              <TouchableOpacity onPress={() => switchMode('signin')}>
                <Text style={styles.toggleLink}>← Back to sign in</Text>
              </TouchableOpacity>
            )}
          </View>

          {mode === 'signup' && (
            <Text style={styles.terms}>
              By creating an account, you agree to our Terms of Service and Privacy Policy.
            </Text>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  scrollInner: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 20,
    padding: 28,
    width: '100%',
    maxWidth: 380,
    alignItems: 'stretch',
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: COLORS.accent,
    marginBottom: 4,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.text3,
    marginBottom: 20,
    textAlign: 'center',
  },
  errorBox: {
    backgroundColor: 'rgba(248,113,113,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.3)',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  errorText: {
    color: COLORS.red,
    fontSize: 13,
    textAlign: 'center',
  },
  infoBox: {
    backgroundColor: 'rgba(56,189,156,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(56,189,156,0.3)',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  infoText: {
    color: COLORS.accent,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
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
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  passwordInput: {
    flex: 1,
    paddingRight: 60,
  },
  showBtn: {
    position: 'absolute',
    right: 12,
    top: 0,
    bottom: 12,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  showBtnText: {
    color: COLORS.accent,
    fontSize: 13,
    fontWeight: '600',
  },
  strengthRow: {
    marginTop: -6,
    marginBottom: 10,
  },
  strengthTrack: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 4,
  },
  strengthFill: {
    height: 4,
  },
  strengthLabel: {
    fontSize: 11,
  },
  submitBtn: {
    width: '100%',
    padding: 13,
    backgroundColor: COLORS.accent,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 10,
  },
  submitText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  forgotRow: {
    alignItems: 'center',
    marginBottom: 10,
  },
  forgotLink: {
    fontSize: 13,
    color: COLORS.accent,
    fontWeight: '500',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
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
  terms: {
    fontSize: 11,
    color: COLORS.text3,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 16,
  },
});
