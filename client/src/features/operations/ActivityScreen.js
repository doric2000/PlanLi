import React, { useEffect, useRef, useState } from 'react';
import { Alert, FlatList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AppText from '../../components/AppText';
import { useContentPublish } from '../publishing/ContentPublishContext';
import { useOperations } from './OperationState';
import { operationStore } from './operationService';
import { openOperation } from './operationNavigation';
import { TERMINAL_STATES } from './operationModel';
import OperationCard, { OperationButton } from './OperationCard';
import OperationRegionAction from './OperationRegionAction';
import styles from '../../styles/operations';
import { useProfilePhotoJobs } from './ProfilePhotoContext';

import { syncBackgroundHistory, retryBackgroundOperation, backgroundTransfersAvailable } from './BackgroundMediaService';
import { auth } from '../../config/firebase';

export default function ActivityScreen({ navigation, route }) {
  const { entries, persistenceError } = useOperations();
  const { jobs = [], retry, discard, beginReview } = useContentPublish();
  const photos = useProfilePhotoJobs();
  const [olderCursor, setOlderCursor] = useState(null);
  useEffect(() => {
    if (auth.currentUser?.uid && (route?.params?.operationId || backgroundTransfersAvailable())) {
      syncBackgroundHistory(auth.currentUser.uid, route?.params?.operationId).then(setOlderCursor).catch(() =>
        Alert.alert('לא הצלחנו לטעון את הפעולה', 'בדקו את החיבור ופתחו שוב את הפעילות.'));
    }
  }, [route?.params?.operationId]);
  const [busy, setBusy] = useState({});
  const running = useRef(new Set());
  const run = async (id, work) => {
    if (running.current.has(id)) return;
    running.current.add(id);
    setBusy((current) => ({ ...current, [id]: true }));
    try { await work(); } catch { Alert.alert('הפעולה לא הושלמה', 'אפשר לנסות שוב בעוד רגע.'); }
    finally { running.current.delete(id); setBusy((current) => ({ ...current, [id]: false })); }
  };
  const open = (entry) => {
    operationStore.acknowledge(entry.id, entry.ownerUid).catch(() => {});
    if (entry.source === 'publish' && entry.status === 'failed') beginReview?.(entry.id.replace(/^publish:/, ''));
    openOperation(navigation, entry);
  };
  const ordered = [...entries].sort((a, b) => Number(b.serverOperationId === route?.params?.operationId && !!b.serverOperationId) - Number(a.serverOperationId === route?.params?.operationId && !!a.serverOperationId) || Number(TERMINAL_STATES.has(a.status)) - Number(TERMINAL_STATES.has(b.status)) || b.updatedAt - a.updatedAt);
  return <SafeAreaView edges={['top', 'bottom']} style={styles.screen} testID="activity-screen">
    <View style={[styles.row, { paddingHorizontal: 16 }]}>
      <OperationButton onPress={() => navigation.goBack()} label="חזרה">חזרה</OperationButton>
      <AppText style={[styles.title, { flex: 1 }]}>הפעילות שלי</AppText>
    </View>
    {persistenceError && <AppText style={[styles.detail, { padding: 16 }]}>לא הצלחנו לשמור את כל היסטוריית הפעילות במכשיר. תוצאות הפעולות מוצגות כאן כל עוד האפליקציה פתוחה.</AppText>}
    <FlatList data={ordered} keyExtractor={(entry) => entry.id} contentContainerStyle={styles.list}
      ListFooterComponent={olderCursor ? <OperationButton onPress={() => run('older', async () => {
        const uid = auth.currentUser?.uid; if (!uid) return;
        setOlderCursor(await syncBackgroundHistory(uid, null, olderCursor));
      })}>טעינת פעולות קודמות</OperationButton> : null}
      ListEmptyComponent={<AppText style={styles.empty}>העלאות, שמירות ותוצאות הפעולות יופיעו כאן.</AppText>}
      renderItem={({ item: entry }) => {
        const job = entry.source === 'publish' ? jobs.find((value) => `publish:${value.id}` === entry.id) : null;
        const photo = photos.jobs.find((value) => value.id === entry.id);
        return <View style={styles.card}><OperationCard entry={entry} showTime>
          <View style={styles.actions} pointerEvents={busy[entry.id] ? 'none' : 'auto'}>
            <OperationRegionAction entry={entry} onChooseRegion={() => navigation.navigate('RegionSelector', { source: 'publish-change' })} />
            {TERMINAL_STATES.has(entry.status) && <OperationButton onPress={() => open(entry)}>צפייה בפריט</OperationButton>}
            {entry.source === 'background' && entry.status === 'failed' && entry.retryable && <OperationButton
              onPress={() => run(entry.id, async () => { await retryBackgroundOperation(entry.serverOperationId);
                await syncBackgroundHistory(entry.ownerUid, entry.serverOperationId); })}>נסו שוב</OperationButton>}
            {photo?.status === 'failed' && <OperationButton testID={`activity-retry-${photo.id}`}
              onPress={() => run(entry.id, () => photos.retry(photo.id))}>נסו שוב</OperationButton>}
            {photo && TERMINAL_STATES.has(photo.status) && <OperationButton onPress={() => Alert.alert(
              'הסרת ההעלאה?', 'התמונה שנשמרה להעלאה תוסר מהמכשיר. תמונת הפרופיל הנוכחית לא תשתנה.', [
                { text: 'ביטול', style: 'cancel' },
                { text: 'הסרה', style: 'destructive', onPress: () => run(entry.id, () => photos.discard(photo.id)) },
              ])}>הסרת ההעלאה</OperationButton>}
            {job?.status === 'failed' && <>
              {!job.reviewRequired && job.error?.details?.retryable !== false && <OperationButton
                testID={`activity-retry-${job.id}`} onPress={() => run(entry.id, () => retry(job.id))}>נסו שוב</OperationButton>}
              <OperationButton onPress={() => open(entry)}>עריכה</OperationButton>
              <OperationButton onPress={() => Alert.alert('מחיקת הטיוטה?', 'הפרסום והתמונות שנשמרו עבורו במכשיר יימחקו.', [
                { text: 'ביטול', style: 'cancel' }, { text: 'מחיקה', style: 'destructive', onPress: () => run(entry.id, async () => {
                  await discard(job.id); await operationStore.remove(entry.id, entry.ownerUid);
                }) },
              ])}>מחיקת הטיוטה</OperationButton>
            </>}
            {['failed', 'uncertain'].includes(entry.status) && !job && <OperationButton
              onPress={() => operationStore.update({ ...entry, acknowledged: true, dismissed: true }).catch(() => {})}>אישור קריאה</OperationButton>}
          </View>
        </OperationCard></View>;
      }} />
  </SafeAreaView>;
}
