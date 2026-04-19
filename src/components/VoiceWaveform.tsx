import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, font } from '../theme/tokens';

const BAR_COUNT = 46;

type Props = {
  /** Smoothed 0–1 level from outbound audio stats */
  level: number;
  /** When false, bars idle */
  active: boolean;
};

export function VoiceWaveform({ level, active }: Props) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!active) {
      return;
    }
    const id = setInterval(() => setTick(t => t + 1), 90);
    return () => clearInterval(id);
  }, [active]);

  if (!active) {
    return null;
  }

  const displayLevel = Math.min(1, Math.max(0, level));

  return (
    <View style={styles.wrap} accessibilityLabel="Voice activity">
      <View style={styles.bars}>
        {Array.from({ length: BAR_COUNT }).map((_, i) => {
          const wave =
            0.45 +
            0.55 * Math.sin(i * 0.42 + tick * 0.18 + displayLevel * 2.1);
          const h = 6 + displayLevel * 52 * wave;
          return (
            <View
              key={i}
              style={[
                styles.bar,
                {
                  height: h,
                  opacity: 0.35 + displayLevel * 0.65,
                },
              ]}
            />
          );
        })}
      </View>
      <Text style={styles.caption}>
        {displayLevel > 0.14 ? 'Sending audio' : 'Mic live — speak to move bars'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 16,
    minHeight: 100,
  },
  bars: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-evenly',
    gap: 0,
    height: 72,
  },
  bar: {
    width: 4,
    borderRadius: 2,
    backgroundColor: colors.accentMuted,
    minHeight: 4,
  },
  caption: {
    marginTop: 12,
    fontSize: font.small,
    color: colors.textMuted,
    fontWeight: '600',
  },
});
