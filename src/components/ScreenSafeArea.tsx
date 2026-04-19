import React, { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  SafeAreaView as RNSafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { colors, layout } from '../theme/tokens';

export type ScreenEdges = ('top' | 'left' | 'right' | 'bottom')[];

type Props = {
  children: ReactNode;
  edges?: ScreenEdges;
  padded?: boolean;
  innerPadding?: boolean;
  backgroundColor?: string;
};

/**
 * Unified screen wrapper with consistent safe area, padding, and background.
 */
export function ScreenSafeArea({
  children,
  edges = ['left', 'right', 'bottom'],
  padded = true,
  innerPadding = false,
  backgroundColor = colors.bg,
}: Props) {
  const insets = useSafeAreaInsets();

  return (
    <RNSafeAreaView style={[styles.safe, { backgroundColor }]} edges={edges}>
      <View
        style={[
          styles.inner,
          padded && styles.paddedInner,
          innerPadding && {
            paddingHorizontal: layout.horizontalPad,
            paddingTop: Math.max(insets.top, 12),
            paddingBottom: insets.bottom + 12,
          },
        ]}>
        {children}
      </View>
    </RNSafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  inner: {
    flex: 1,
  },
  paddedInner: {
    paddingHorizontal: layout.horizontalPad,
  },
});
