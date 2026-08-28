import React, { useState } from 'react';
import { Linking, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import AppText from './AppText';
import { getDestinationCreditPolicy } from '../utils/destinationImages';

function openLink(event, url) {
  event?.stopPropagation?.();
  if (url) Linking.openURL(url).catch(() => {});
}

function CreditDetailsModal({ attribution, visible, onClose }) {
  if (!visible) return null;
  const sourceUrl = attribution.photoUrl || attribution.providerUrl;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={styles.sheet}
          onPress={(event) => event.stopPropagation()}
          accessibilityViewIsModal
        >
          <View style={styles.sheetHeader}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="סגירת פרטי התמונה"
              onPress={onClose}
              style={styles.closeButton}
            >
              <Ionicons name="close" size={22} color="#1E3A5F" />
            </Pressable>
            <AppText style={styles.sheetTitle}>פרטי התמונה</AppText>
          </View>
          <View style={styles.detailRow}>
            <AppText style={styles.detailLabel}>צילום</AppText>
            <AppText style={styles.detailValue}>{attribution.photographerName}</AppText>
          </View>
          <View style={styles.detailRow}>
            <AppText style={styles.detailLabel}>מקור</AppText>
            <AppText style={styles.detailValue}>{attribution.providerName || 'Wikimedia Commons'}</AppText>
          </View>
          <View style={styles.detailRow}>
            <AppText style={styles.detailLabel}>רישיון</AppText>
            <AppText style={styles.detailValue}>{attribution.licenseName}</AppText>
          </View>
          <View style={styles.sheetActions}>
            {sourceUrl ? (
              <Pressable
                accessibilityRole="link"
                accessibilityLabel="פתיחת עמוד המקור"
                style={styles.sheetAction}
                onPress={(event) => openLink(event, sourceUrl)}
              >
                <AppText style={styles.sheetActionText}>עמוד המקור</AppText>
              </Pressable>
            ) : null}
            {attribution.licenseUrl ? (
              <Pressable
                accessibilityRole="link"
                accessibilityLabel="פתיחת פרטי הרישיון"
                style={styles.sheetAction}
                onPress={(event) => openLink(event, attribution.licenseUrl)}
              >
                <AppText style={styles.sheetActionText}>פרטי הרישיון</AppText>
              </Pressable>
            ) : null}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function PhotoAttribution({ destination, image, placement = 'card', style }) {
  const [detailsVisible, setDetailsVisible] = useState(false);
  const policy = getDestinationCreditPolicy(image ? { destinationImage: image } : destination);
  if (!['inline', 'details'].includes(policy.mode)) return null;
  const attribution = policy.attribution;
  const creditName = attribution.photographerName;
  const placementStyle = placement === 'hero'
    ? styles.heroPlacement
    : placement === 'admin'
      ? styles.adminPlacement
      : null;

  if (policy.mode === 'details') {
    return (
      <>
        <Pressable
          style={[styles.infoButton, placementStyle, style]}
          accessibilityRole="button"
          accessibilityLabel={`פרטי קרדיט לתמונה מאת ${creditName}`}
          onPress={(event) => {
            event?.stopPropagation?.();
            setDetailsVisible(true);
          }}
        >
          <View style={styles.infoIcon}>
            <Ionicons name="information-circle-outline" size={21} color="#FFFFFF" />
          </View>
        </Pressable>
        <CreditDetailsModal
          attribution={attribution}
          visible={detailsVisible}
          onClose={() => setDetailsVisible(false)}
        />
      </>
    );
  }

  return (
    <View
      style={[styles.container, placementStyle, style]}
      accessibilityLabel={`קרדיט לתמונה: צילום מאת ${creditName}, Unsplash`}
    >
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(8,15,30,0)', 'rgba(8,15,30,0.58)']}
        style={StyleSheet.absoluteFill}
      />
      <AppText style={styles.text}>צילום: </AppText>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`פתיחת הפרופיל של ${creditName} ב-Unsplash`}
        onPress={(event) => openLink(event, attribution.photographerProfileUrl)}
        style={styles.photographerLink}
      >
        <AppText style={styles.link} numberOfLines={1}>{creditName}</AppText>
      </Pressable>
      <AppText style={styles.text}> · Unsplash</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 4,
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingTop: 9,
  },
  heroPlacement: { bottom: 58 },
  adminPlacement: { bottom: 0 },
  text: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 9,
    textShadowColor: 'rgba(0,0,0,0.72)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  photographerLink: {
    minHeight: 38,
    maxWidth: '56%',
    justifyContent: 'center',
  },
  link: {
    color: '#FFFFFF',
    fontSize: 9,
    textDecorationLine: 'underline',
    textShadowColor: 'rgba(0,0,0,0.72)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  infoButton: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    zIndex: 5,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoIcon: {
    width: 25,
    height: 25,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,15,30,0.46)',
  },
  backdrop: {
    flex: 1,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,15,30,0.48)',
  },
  sheet: {
    width: '100%',
    maxWidth: 430,
    padding: 20,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F1729',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 28,
    elevation: 10,
  },
  sheetHeader: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F4F8',
  },
  sheetTitle: {
    color: '#1E3A5F',
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  detailRow: {
    minHeight: 48,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E9F0',
  },
  detailLabel: {
    width: 58,
    color: '#64748B',
    fontSize: 12,
    textAlign: 'right',
  },
  detailValue: {
    flex: 1,
    color: '#172033',
    fontSize: 13,
    textAlign: 'right',
  },
  sheetActions: {
    marginTop: 18,
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 10,
  },
  sheetAction: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF3F8',
  },
  sheetActionText: {
    color: '#1E3A5F',
    fontSize: 13,
    fontWeight: '600',
  },
});
