import React from 'react';
import { Modal, StyleSheet } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

// Each native modal has its own coordinate space. Never reuse screen insets here.
export default function FullScreenModal({ children, contentStyle, contentTestID, ...props }) {
  return <Modal {...props} transparent={false} presentationStyle="fullScreen">
    <SafeAreaProvider>
      <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={[styles.content, contentStyle]} testID={contentTestID}>
        {children}
      </SafeAreaView>
    </SafeAreaProvider>
  </Modal>;
}

const styles = StyleSheet.create({ content: { flex: 1 } });
