import { collection, documentId, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '../../../config/firebase';

// Compact map results omit ownership. Resolve only when the viewer has blocked
// authors, using bounded public reads rather than exposing unverified previews.
export async function resolveCityMapOwners(items) {
  const ids = [...new Set(items.filter((item) => item?.id && !item.ownerId).map((item) => item.id))];
  const owners = new Map();
  for (let offset = 0; offset < ids.length; offset += 30) {
    const snapshot = await getDocs(query(collection(db, 'recommendations'),
      where(documentId(), 'in', ids.slice(offset, offset + 30)),
      where('status', '==', 'active'),
      where('publicationGate.destinationApprovalVerified', '==', true), limit(30)));
    snapshot.docs.forEach((entry) => owners.set(entry.id, entry.data().ownerId));
  }
  return items.flatMap((item) => {
    const ownerId = item.ownerId || owners.get(item.id);
    return ownerId ? [{ ...item, ownerId }] : [];
  });
}
