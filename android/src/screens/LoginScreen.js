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
import { LinearGradient } from 'expo-linear-gradient';
import { login, signup, requestPasswordReset } from '../services/auth';

// Palette pulled from website index.html so the Android login matches the web modal.
const COLORS = {
  bg: '#1a1254',             // page background (web dark --bg)
  card: 'rgba(255,255,255,0.06)', // web dark --card-bg
  cardBorder: 'rgba(255,255,255,0.10)',
  purple: '#7c3aed',         // web --purple
  blue: '#3b82f6',            // web --blue
  text: '#e2e8f0',           // web dark --text
  text2: '#a8b3d1',
  text3: '#64748b',
  placeholder: '#6b7492',
  inputBg: 'rgba(0,0,0,0.25)',   // web dark --input-bg
  inputBorder: 'rgba(255,255,255,0.12)', // web dark --input-border
  red: '#f87171',
  amber: '#f59e0b',
  green: '#22c55e',
  errorBg: 'rgba(220,38,38,0.12)',
  errorBorder: 'rgba(248,113,113,0.30)',
  successBg: 'rgba(34,197,94,0.10)',
  successBorder: 'rgba(34,197,94,0.30)',
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

  const heroTitle =
    mode === 'signup' ? 'Create your account'
    : mode === 'forgot' ? 'Reset your password'
    : 'Welcome back';

  const heroSub =
    mode === 'signup' ? 'Start dictating in 99+ languages.'
    : mode === 'forgot' ? "We'll email you a reset link."
    : 'Sign in to keep dictating.';

  const submitLabel =
    mode === 'signup' ? 'Create Account'
    : mode === 'forgot' ? 'Send Reset Link'
    : 'Sign In';

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior="padding"
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
    >
      {/* Soft purple→blue glow in the background, like the website's gradient hero. */}
      <LinearGradient
        colors={[COLORS.purple, COLORS.blue]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.backgroundGlow}
        pointerEvents="none"
      />
      <View style={styles.backgroundOverlay} pointerEvents="none" />

      <ScrollView
        contentContainerStyle={styles.scrollInner}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Brand — matches the website logo treatment (gradient text on dark bg). */}
        <View style={styles.brandRow}>
          <LinearGradient
            colors={[COLORS.purple, COLORS.blue]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.brandDot}
          >
            <Text style={styles.brandDotText}>V</Text>
          </LinearGradient>
          <Text style={styles.brandText}>VoltType</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>{heroTitle}</Text>
          <Text style={styles.subtitle}>{heroSub}</Text>

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
              placeholderTextColor={COLORS.placeholder}
              value={fullName}
              onChangeText={setFullName}
              autoCapitalize="words"
              textContentType="name"
            />
          )}

          <TextInput
            style={styles.input}
            placeholder="Email address"
            placeholderTextColor={COLORS.placeholder}
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
                  placeholderTextColor={COLORS.placeholder}
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
                  placeholderTextColor={COLORS.placeholder}
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

          {/* Submit — gradient button to match the web modal's primary CTA. */}
          <TouchableOpacity
            onPress={onSubmit}
            disabled={loading}
            activeOpacity={0.85}
            style={[styles.submitWrap, loading && styles.submitDisabled]}
          >
            <LinearGradient
              colors={[COLORS.purple, COLORS.blue]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.submitBtn}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitText}>{submitLabel}</Text>
              )}
            </LinearGradient>
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
                  <Text style={styles.toggleLink}>Sign In</Text>
                </TouchableOpacity>
              </>
            )}
            {mode === 'signin' && (
              <>
                <Text style={styles.toggleLabel}>Don't have an account?</Text>
                <TouchableOpacity onPress={() => switchMode('signup')}>
                  <Text style={styles.toggleLink}>Sign Up</Text>
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
              By signing up, you agree to our Terms of Service and Privacy Policy.
            </Text>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  backgroundGlow: {
    position: 'absolute',
    top: -140,
    left: -80,
    right: -80,
    height: 420,
    borderRadius: 420,
    opacity: 0.45,
  },
  backgroundOverlay: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(26,18,84,0.55)',
  },
  scrollInner: {
    flexGrow: 1,
    alignItems: 'center',
    padding: 24,
    paddingTop: 80,
    paddingBottom: 120,
  },

  /* Brand row */
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 28,
  },
  brandDot: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandDotText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#fff',
  },
  brandText: {
    fontSize: 22,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 0.2,
  },

  /* Card — mirrors the web modal shape (rounded, soft shadow, translucent card bg). */
  card: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 24,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.text2,
    textAlign: 'center',
    marginBottom: 20,
  },

  /* Alerts */
  errorBox: {
    backgroundColor: COLORS.errorBg,
    borderWidth: 1,
    borderColor: COLORS.errorBorder,
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  errorText: {
    color: '#fca5a5',
    fontSize: 13,
    textAlign: 'center',
  },
  infoBox: {
    backgroundColor: COLORS.successBg,
    borderWidth: 1,
    borderColor: COLORS.successBorder,
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  infoText: {
    color: '#86efac',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },

  /* Inputs */
  input: {
    width: '100%',
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
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
    paddingRight: 64,
  },
  showBtn: {
    position: 'absolute',
    right: 10,
    top: 0,
    bottom: 12,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  showBtnText: {
    color: COLORS.purple,
    fontSize: 13,
    fontWeight: '700',
  },

  /* Strength meter */
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
    fontWeight: '600',
  },

  /* Submit — gradient button */
  submitWrap: {
    width: '100%',
    marginTop: 4,
    marginBottom: 10,
    borderRadius: 10,
    overflow: 'hidden',
    shadowColor: COLORS.purple,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  submitDisabled: {
    opacity: 0.75,
  },
  submitBtn: {
    paddingVertical: 13,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  /* Forgot row */
  forgotRow: {
    alignItems: 'center',
    marginBottom: 10,
  },
  forgotLink: {
    fontSize: 13,
    color: COLORS.text2,
    fontWeight: '500',
    textDecorationLine: 'underline',
  },

  /* Mode toggle */
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
  },
  toggleLabel: {
    fontSize: 14,
    color: COLORS.text2,
  },
  toggleLink: {
    fontSize: 14,
    color: COLORS.purple,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  terms: {
    fontSize: 11,
    color: COLORS.text3,
    textAlign: 'center',
    marginTop: 14,
    lineHeight: 16,
  },
});
