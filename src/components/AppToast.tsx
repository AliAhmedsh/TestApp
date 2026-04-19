import React from 'react';
import Toast, {
  BaseToast,
  ErrorToast,
  InfoToast,
} from 'react-native-toast-message';
import { colors, font } from '../theme/tokens';

const t1 = { fontSize: font.body, fontWeight: '600' as const, color: colors.text };
const t2 = { fontSize: font.small, color: colors.textMuted, marginTop: 2 };

export const toastConfig = {
  success: (props: React.ComponentProps<typeof BaseToast>) => (
    <BaseToast
      {...props}
      style={[
        props.style,
        {
          borderLeftColor: colors.success,
          backgroundColor: colors.surface,
          height: undefined,
          minHeight: 52,
        },
      ]}
      text1Style={[t1, props.text1Style]}
      text2Style={[t2, props.text2Style]}
    />
  ),
  error: (props: React.ComponentProps<typeof ErrorToast>) => (
    <ErrorToast
      {...props}
      style={[
        props.style,
        {
          borderLeftColor: '#f87171',
          backgroundColor: colors.surface,
          height: undefined,
          minHeight: 52,
        },
      ]}
      text1Style={[t1, props.text1Style]}
      text2Style={[t2, props.text2Style]}
    />
  ),
  info: (props: React.ComponentProps<typeof InfoToast>) => (
    <InfoToast
      {...props}
      style={[
        props.style,
        {
          borderLeftColor: colors.accent,
          backgroundColor: colors.surface,
          height: undefined,
          minHeight: 52,
        },
      ]}
      text1Style={[t1, props.text1Style]}
      text2Style={[t2, props.text2Style]}
    />
  ),
};

export function AppToastRoot() {
  return <Toast config={toastConfig} topOffset={52} bottomOffset={36} />;
}
