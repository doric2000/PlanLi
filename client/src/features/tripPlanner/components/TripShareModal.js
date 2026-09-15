import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Share, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AppText from '../../../components/AppText';
import { colors, tripPlannerStyles as styles } from '../../../styles';
import { createTripShare, revokeTripShare, tripErrorMessage } from '../../../services/TripService';

export default function TripShareModal({ visible, trip, onClose, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { if (!visible) { setError(''); setLink(''); } }, [visible]);
  const create = async () => {
    setBusy(true); setError('');
    try {
      const result = await createTripShare(trip.id);
      setLink(result.shareUrl);
      onChanged?.(true);
    } catch (cause) { setError(tripErrorMessage(cause, 'לא הצלחנו ליצור קישור פרטי.')); }
    finally { setBusy(false); }
  };
  const share = async () => {
    if (!link) return;
    if (Platform.OS === 'web' && navigator?.clipboard?.writeText) await navigator.clipboard.writeText(link);
    else await Share.share({ title: trip.title, message: `${trip.title}\n${link}`, url: link });
  };
  const revoke = async () => {
    setBusy(true); setError('');
    try { await revokeTripShare(trip.id); setLink(''); onChanged?.(false); }
    catch (cause) { setError(tripErrorMessage(cause, 'לא הצלחנו לבטל את הקישור.')); }
    finally { setBusy(false); }
  };
  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity activeOpacity={1} style={styles.modalBackdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="סגירת חלון השיתוף">
        <TouchableOpacity activeOpacity={1} style={styles.modalSheet} onPress={() => {}} accessibilityViewIsModal>
          <View style={styles.headerRow}>
            <View style={styles.headerCopy}><AppText style={styles.modalTitle}>שיתוף פרטי</AppText><AppText style={styles.modalText}>רק משתמשים מחוברים עם הקישור יוכלו לצפות. הם לא יוכלו לערוך את המקור.</AppText></View>
            <TouchableOpacity style={styles.iconButton} onPress={onClose} accessibilityRole="button" accessibilityLabel="סגירה"><Ionicons name="close" size={22} color={colors.primary} /></TouchableOpacity>
          </View>
          {link ? <View style={styles.shareLink}><AppText selectable style={styles.shareLinkText}>{link}</AppText></View> : null}
          {!!error && <AppText style={styles.errorText}>{error}</AppText>}
          {busy ? <ActivityIndicator color={colors.primary} /> : link ? (
            <>
              <TouchableOpacity style={styles.primaryButton} onPress={share} accessibilityRole="button"><Ionicons name="share-outline" size={20} color="#FFFFFF" /><AppText style={styles.primaryButtonText}>{Platform.OS === 'web' ? 'העתקת הקישור' : 'שיתוף הקישור'}</AppText></TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={revoke} accessibilityRole="button"><AppText style={styles.secondaryButtonText}>ביטול הקישור הקיים</AppText></TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity style={styles.primaryButton} onPress={create} accessibilityRole="button"><Ionicons name="link-outline" size={20} color="#FFFFFF" /><AppText style={styles.primaryButtonText}>{trip.shareActive ? 'יצירת קישור חדש' : 'יצירת קישור פרטי'}</AppText></TouchableOpacity>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}
