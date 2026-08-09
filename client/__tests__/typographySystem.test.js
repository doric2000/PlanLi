import React from 'react';
import fs from 'fs';
import path from 'path';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';

import AppFontProvider, { AppFontContext } from '../src/components/AppFontProvider';
import AppText from '../src/components/AppText';
import AppTextInput from '../src/components/AppTextInput';
import { fontFamilies } from '../src/styles/typography';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';

jest.mock('@expo-google-fonts/assistant/400Regular', () => ({
  Assistant_400Regular: 'Assistant_400Regular',
}));

jest.mock('@expo-google-fonts/assistant/500Medium', () => ({
  Assistant_500Medium: 'Assistant_500Medium',
}));

jest.mock('@expo-google-fonts/assistant/600SemiBold', () => ({
  Assistant_600SemiBold: 'Assistant_600SemiBold',
}));

jest.mock('expo-font', () => ({
  useFonts: jest.fn(),
}));

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve()),
  hideAsync: jest.fn(() => Promise.resolve()),
}));

describe('Assistant typography system', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads exactly the three supported Assistant faces and reveals the app', () => {
    useFonts.mockReturnValue([true, null]);
    const screen = render(
      <AppFontProvider>
        <AppText testID="loaded-copy">טקסט</AppText>
      </AppFontProvider>
    );

    expect(useFonts).toHaveBeenCalledWith({
      Assistant_400Regular: 'Assistant_400Regular',
      Assistant_500Medium: 'Assistant_500Medium',
      Assistant_600SemiBold: 'Assistant_600SemiBold',
    });
    expect(screen.getByTestId('loaded-copy')).toBeTruthy();
    expect(SplashScreen.hideAsync).toHaveBeenCalled();
  });

  it('falls back to the system font after a loading error', () => {
    useFonts.mockReturnValue([false, new Error('font unavailable')]);
    const screen = render(
      <AppFontProvider>
        <AppText testID="fallback-copy">טקסט</AppText>
      </AppFontProvider>
    );
    const style = StyleSheet.flatten(screen.getByTestId('fallback-copy').props.style);

    expect(style?.fontFamily).toBeUndefined();
    expect(screen.getByText('טקסט')).toBeTruthy();
  });

  it('applies regular, medium and semibold to shared text and input components', () => {
    const screen = render(
      <AppFontContext.Provider value>
        <AppText testID="regular">רגיל</AppText>
        <AppText testID="medium" weight="medium">בינוני</AppText>
        <AppText testID="semibold" weight="semiBold">מודגש</AppText>
        <AppTextInput testID="input" value="קלט" readOnly />
      </AppFontContext.Provider>
    );

    expect(StyleSheet.flatten(screen.getByTestId('regular').props.style).fontFamily).toBe(fontFamilies.regular);
    expect(StyleSheet.flatten(screen.getByTestId('medium').props.style).fontFamily).toBe(fontFamilies.medium);
    expect(StyleSheet.flatten(screen.getByTestId('semibold').props.style).fontFamily).toBe(fontFamilies.semiBold);
    expect(StyleSheet.flatten(screen.getByTestId('input').props.style).fontFamily).toBe(fontFamilies.regular);
  });

  it('does not allow raw font weights or direct React Native text in client source', () => {
    const sourceRoot = path.resolve(__dirname, '../src');
    const files = [];
    const collect = (directory) => {
      fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) collect(fullPath);
        else if (entry.name.endsWith('.js')) files.push(fullPath);
      });
    };
    collect(sourceRoot);

    const violations = files.flatMap((file) => {
      const source = fs.readFileSync(file, 'utf8');
      const relative = path.relative(sourceRoot, file);
      const findings = [];
      if (/fontWeight\s*:/.test(source)) findings.push(`${relative}: fontWeight`);
      if (!/components[\\/]AppText(?:Input)?\.js$/.test(file) && /<\/?Text(?:Input)?(?=[\s>])/.test(source)) {
        findings.push(`${relative}: direct Text/TextInput`);
      }
      return findings;
    });

    expect(violations).toEqual([]);
  });
});
