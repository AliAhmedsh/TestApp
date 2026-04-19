import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import PhoneInput, { isValidPhoneNumber } from 'react-native-international-phone-number';
import {
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { getAuth, signInWithPhoneNumber, FirebaseAuthTypes } from '@react-native-firebase/auth';
import { ScreenSafeArea } from '../components/ScreenSafeArea';
import { colors, font, keyboardOffset, layout } from '../theme/tokens';
import { upsertTestUser } from '../services/users';
import { toastError, toastSuccess } from '../utils/toast';

type Props = {
  onSignedIn: () => void;
};

const OTP_LEN = 6;

export function LoginScreen({ onSignedIn }: Props) {
  const insets = useSafeAreaInsets();
  const [national, setNational] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<any>(null);
  const [code, setCode] = useState('');
  const [confirm, setConfirm] =
    useState<FirebaseAuthTypes.ConfirmationResult | null>(null);
  const [busy, setBusy] = useState(false);

  const sendOtp = async () => {
    const trimmed = national.trim();
    if (!trimmed) {
      toastError('Phone required', 'Enter your mobile number.');
      return;
    }
    if (!selectedCountry) {
      toastError('Country required', 'Please select a country.');
      return;
    }
    const valid = isValidPhoneNumber(national, selectedCountry);
    if (!valid) {
      toastError(
        'Invalid number',
        'Check the number for the selected country.',
      );
      return;
    }
    console.log('Selected country:', selectedCountry);
    const callingCode = getCallingCode(selectedCountry);
    console.log('Calling code:', callingCode);
    console.log('National number:', national);
    // Remove all spaces and special characters from national number
    const cleanNational = national.replace(/[^0-9]/g, '');
    console.log('Clean national:', cleanNational);
    // Ensure calling code starts with +, add if missing
    const formattedCallingCode = callingCode.startsWith('+') ? callingCode : '+' + callingCode;
    const formattedPhone = formattedCallingCode + cleanNational;
    console.log('Formatted phone:', formattedPhone);
    if (formattedPhone.length < 10) {
      toastError('Invalid format', 'Could not build a valid international number.');
      return;
    }

    setBusy(true);
    try {
      const c = await signInWithPhoneNumber(getAuth(), formattedPhone);
      setConfirm(c);
      toastSuccess('Code sent', 'Enter the SMS verification code.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toastError('SMS failed', msg);
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!confirm) {
      return;
    }
    const digits = code.replace(/\D/g, '');
    if (digits.length !== OTP_LEN) {
      toastError('Invalid code', `Enter the ${OTP_LEN}-digit SMS code.`);
      return;
    }

    setBusy(true);
    try {
      const cred = await confirm.confirm(digits);
      if (!cred?.user) {
        toastError('Sign-in failed', 'No user returned from verification.');
        return;
      }
      const u = cred.user;
      await upsertTestUser(u.uid, u.phoneNumber);
      toastSuccess('Welcome', 'You are signed in.');
      onSignedIn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toastError('Verification failed', msg);
    } finally {
      setBusy(false);
    }
  };

  const getCallingCode = (country: any) => {
    if (!country) return '';
    console.log('Country object keys:', Object.keys(country));
    console.log('Country callingCode:', country.callingCode);
    console.log('Country phoneCode:', country.phoneCode);
    console.log('Country cca2:', country.cca2);
    console.log('Country idd:', country.idd);
    if (country.callingCode) return country.callingCode;
    if (country.phoneCode) return country.phoneCode;
    if (country.idd?.root) {
      return country.idd.root;
    }
    return '';
  };

  return (
    <ScreenSafeArea edges={['left', 'right', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top + keyboardOffset}>
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: Math.max(insets.top, 12),
              paddingBottom: Math.max(insets.bottom, 12) + 24,
              paddingHorizontal: layout.horizontalPad,
              maxWidth: layout.maxContentWidth,
              alignSelf: 'center',
              width: '100%',
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>Sign in</Text>
          <Text style={styles.subtitle}>
            Phone verification with live SMS. Choose your country and enter
            your mobile number.
          </Text>

          {!confirm ? (
            <View style={styles.section}>
              <Text style={styles.label}>Phone number</Text>
              <View style={styles.phoneInputWrapper}>
                <PhoneInput
                  placeholder="Mobile number"
                  value={national}
                  onChangePhoneNumber={(text: string) => {
                    setNational(text);
                  }}
                  selectedCountry={selectedCountry}
                  onChangeSelectedCountry={setSelectedCountry}
                  defaultCountry="US"
                  popularCountries={['IN', 'MX', 'US']}
                  modalSectionTitleDisabled
                  phoneInputStyles={{
                    container: {
                      backgroundColor: colors.surface2,
                      borderWidth: 1.5,
                      borderColor: colors.border,
                      height: 56,
                      borderRadius: 14,
                    },
                    flagContainer: {
                      backgroundColor: colors.surface2,
                      justifyContent: 'center',
                      borderTopLeftRadius: 14,
                      borderBottomLeftRadius: 14,
                    },
                    caret: {
                      color: colors.text,
                    },
                    divider: {
                      backgroundColor: colors.border,
                    },
                    callingCode: {
                      fontSize: font.body,
                      color: colors.text,
                      fontWeight: '700',
                    },
                    input: {
                      color: colors.text,
                      fontSize: font.body,
                      backgroundColor: 'transparent',
                      marginLeft: -20,
                    },
                  }}
                />
              </View>
              <TouchableOpacity
                style={[styles.primary, busy && styles.disabled]}
                onPress={sendOtp}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel="Send SMS verification code">
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryText}>Send SMS code</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.section}>
              <Text style={styles.label}>Verification code</Text>
              <Text style={styles.hint}>
                Enter the 6-digit code sent to your phone.
              </Text>
              <TextInput
                style={styles.codeInput}
                placeholder={`${OTP_LEN}-digit code`}
                placeholderTextColor={colors.textDim}
                keyboardType="number-pad"
                maxLength={OTP_LEN}
                value={code}
                onChangeText={t => setCode(t.replace(/\D/g, ''))}
                autoFocus
              />
              <TouchableOpacity
                style={[styles.primary, busy && styles.disabled]}
                onPress={verify}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel="Verify and sign in">
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryText}>Verify & sign in</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.link}
                onPress={() => {
                  setConfirm(null);
                  setCode('');
                }}
                accessibilityRole="button">
                <Text style={styles.linkText}>Use a different number</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenSafeArea>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: font.title + 4,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: font.small,
    color: colors.textMuted,
    marginBottom: 32,
    lineHeight: 21,
  },
  section: {
    width: '100%',
  },
  label: {
    fontSize: font.small,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 10,
  },
  hint: {
    fontSize: font.caption,
    color: colors.textMuted,
    marginBottom: 12,
  },
  phoneInputWrapper: {
    width: '100%',
    marginBottom: 4,
  },
  codeInput: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
    color: colors.text,
    marginBottom: 4,
    fontSize: font.body,
    backgroundColor: colors.surface2,
    fontWeight: '700',
    letterSpacing: 8,
    textAlign: 'center',
  },
  primary: {
    backgroundColor: colors.accent,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  disabled: { opacity: 0.55 },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: font.body },
  link: { marginTop: 20, alignItems: 'center', paddingVertical: 10 },
  linkText: { color: colors.accentMuted, fontSize: font.small, fontWeight: '600' },
});