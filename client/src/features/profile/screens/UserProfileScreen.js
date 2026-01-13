import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, FlatList, ActivityIndicator, StyleSheet, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { db } from "../../../config/firebase";

import BackButton from "../../../components/BackButton";
import { Avatar } from "../../../components/Avatar";
import RecommendationCard from "../../../components/RecommendationCard";
import { cards, typography, colors } from "../../../styles";

export default function UserProfileScreen({ route, navigation }) {
  const uid = route?.params?.uid;

  const [user, setUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);

  const [tags, setTags] = useState([]);
  const [travelerLevel, setTravelerLevel] = useState(null);

  const [recs, setRecs] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [loadingLists, setLoadingLists] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!uid) return;

    setLoadingUser(true);
    setLoadingLists(true);

    try {
      // ---- user ----
      const uSnap = await getDoc(doc(db, "users", uid));
      const u = uSnap.exists() ? { id: uid, ...uSnap.data() } : { id: uid, displayName: "Traveler" };
      setUser(u);

      // תגיות + "רמת מטייל" (תתמוך בכמה שדות אפשריים אצלך)
      const t = [
        ...(Array.isArray(u.tags) ? u.tags : []),
        ...(Array.isArray(u.smartBadges) ? u.smartBadges : []),
      ].filter(Boolean);
      setTags([...new Set(t)]);
      setTravelerLevel(u.travelerType || u.travelerLevel || u.level || null);

      // ---- recommendations ----
      const recQ = query(
        collection(db, "recommendations"),
        where("userId", "==", uid),
        // orderBy("createdAt", "desc"),
        limit(30)
        );


      const recSnap = await getDocs(recQ);
      const recList = [];
      recSnap.forEach((d) => recList.push({ id: d.id, ...d.data() }));
      setRecs(recList);

    } catch (e) {
      console.log("UserProfile fetch error:", e);
      // נשאיר מה שהצליח, ונמנע קריסה
    } finally {
      setLoadingUser(false);
      setLoadingLists(false);
    }
  }, [uid]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const header = useMemo(() => {
    return (
      <View style={styles.headerWrap}>
        <View style={styles.topRow}>
          <BackButton color="dark" variant="solid" />
          <Text style={styles.title}>פרופיל</Text>
          <View style={{ width: 40 }} />
        </View>

        {loadingUser ? (
          <View style={{ paddingVertical: 18 }}>
            <ActivityIndicator />
          </View>
        ) : (
          <View style={[styles.userRow]}>
            <Avatar
              photoURL={user?.photoURL}
              displayName={user?.displayName}
              size={56}
            />
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text style={styles.name}>{user?.displayName || "Traveler"}</Text>

              {!!travelerLevel && (
                <Text style={styles.sub}>רמת מטייל: {travelerLevel}</Text>
              )}
            </View>
          </View>
        )}

        {/* תגיות */}
        <View style={{ marginTop: 14 }}>
          <Text style={styles.sectionLabel}>תגיות</Text>

          {tags?.length ? (
            <View style={styles.tagsRow}>
              {tags.map((t) => (
                <View key={t} style={styles.tagChip}>
                  <Text style={styles.tagText}>{t}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.emptyHint}>אין תגיות להצגה</Text>
          )}
        </View>

        {/* שורת מספרים: טיולים / המלצות */}
        <View style={styles.countersRow}>
          <View style={styles.counterBox}>
            <Text style={styles.counterLabel}>טיולים - (מספר)</Text>
            <Text style={styles.counterValue}>{routes.length}</Text>
          </View>

          <View style={styles.counterBox}>
            <Text style={styles.counterLabel}>המלצות - (מספר)</Text>
            <Text style={styles.counterValue}>{recs.length}</Text>
          </View>
        </View>

        {/* כותרת לגריד */}
        <Text style={[styles.sectionLabel, { marginTop: 10 }]}>
          תוכן
        </Text>
      </View>
    );
  }, [loadingUser, user, travelerLevel, tags, routes.length, recs.length]);

  // נציג "גריד" אחד שמכיל גם routes וגם recommendations (או רק אחד מהם)
  const gridData = useMemo(() => {
    // אתה יכול להחליט סדר: קודם טיולים ואז המלצות
    const r1 = routes.map((x) => ({ ...x, __type: "route" }));
    const r2 = recs.map((x) => ({ ...x, __type: "rec" }));
    return [...r1, ...r2];
  }, [routes, recs]);

  const renderItem = ({ item }) => {
    if (item.__type === "route") {
      return (
        <View style={styles.gridItem}>
          <RouteCard item={item} />
        </View>
      );
    }
    return (
      <View style={styles.gridItem}>
        <RecommendationCard item={item} />
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={gridData}
        keyExtractor={(item) => `${item.__type}_${item.id}`}
        ListHeaderComponent={header}
        numColumns={2}
        columnWrapperStyle={{ gap: 12 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 30, gap: 12 }}
        renderItem={renderItem}
        ListEmptyComponent={
          loadingLists ? (
            <View style={{ paddingTop: 20 }}>
              <ActivityIndicator />
            </View>
          ) : (
            <Text style={styles.emptyHint}>אין תוכן להצגה</Text>
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  headerWrap: { paddingBottom: 6 },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 16, fontWeight: "800", color: "#111827" },

  userRow: { flexDirection: "row", alignItems: "center", marginTop: 12 },
  name: { fontSize: 16, fontWeight: "800", color: "#111827" },
  sub: { marginTop: 4, color: "#6B7280", fontSize: 12 },

  sectionLabel: { fontSize: 14, fontWeight: "800", color: "#111827" },
  emptyHint: { marginTop: 8, color: "#9CA3AF" },

  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  tagChip: { backgroundColor: "#F3F4F6", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  tagText: { fontSize: 12, color: "#111827", fontWeight: "600" },

  countersRow: { flexDirection: "row", gap: 12, marginTop: 14 },
  counterBox: { flex: 1, backgroundColor: "#FFFFFF", borderRadius: 14, padding: 12, borderWidth: 1, borderColor: "#E5E7EB" },
  counterLabel: { color: "#6B7280", fontSize: 12, fontWeight: "700" },
  counterValue: { marginTop: 6, fontSize: 20, fontWeight: "900", color: "#111827" },

  gridItem: { flex: 1 },
});
