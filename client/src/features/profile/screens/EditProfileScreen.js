import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Alert, ScrollView, Text, TouchableOpacity, View, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { auth, db } from "../../../config/firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

import { colors, common, cards, tags, buttons, spacing, editProfileScreenStyles as styles } from "../../../styles";
import { useBackButton } from "../../../hooks/useBackButton";
import { useUnsavedLeaveGuard } from "../../../hooks/useUnsavedLeaveGuard";
import UnsavedChangesModal from "../../../components/UnsavedChangesModal";
import { UNSAVED_LEAVE_MESSAGE, UNSAVED_LEAVE_TITLE } from "../../../constants/unsavedLeaveStrings";
import { toggleValue } from "./utils/toggleValue";
import { FormInput } from "../../../components/FormInput";

// ✅ Use the same tags as Recommendations (Constants.js)
import {
  PRICE_TAGS,
  TRAVEL_STYLE_TAGS,
  EXPERIENCE_TAGS,
  TAGS_BY_CATEGORY,
} from "../../../constants/Constants";

// Styles for header/pattern


function Chip({ label, selected, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[tags.filterChip, selected && tags.filterChipSelected]}
      activeOpacity={0.8}
    >
      <Text style={[tags.filterChipText, selected && tags.filterChipTextSelected]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// (Kept, in case you use it later)
const LabeledInput = ({ label, style, ...props }) => (
  <View style={[{ marginBottom: 16 }, style]}>
    <Text style={{ textAlign: "right", fontSize: 14, fontWeight: "bold", marginBottom: 8 }}>
      {label}
    </Text>
    <FormInput textAlign="right" {...props} />
  </View>
);

function buildSmartProfileComparable({ budget, travelStyle, interests, vibe }) {
  return JSON.stringify({
    budget: budget || "",
    travelStyle: travelStyle || "",
    interests: [...(interests || [])].sort(),
    vibe: [...(vibe || [])].sort(),
  });
}

export default function EditProfileScreen({ navigation }) {
  const uid = auth.currentUser?.uid;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  /**
   * ✅ Updated Smart Profile Model (aligned with recommendations tags):
   * - budget: PRICE_TAGS value ("חינמי" | "₪" | "₪₪" | "₪₪₪" | "₪₪₪₪")
   * - travelStyle: TRAVEL_STYLE_TAGS label (single)
   * - interests: recommendation tags picked from TAGS_BY_CATEGORY (multi)
   * - vibe: EXPERIENCE_TAGS label (multi)  (replaces constraints)
   */
  const [budget, setBudget] = useState(""); // PRICE_TAGS (single)
  const [travelStyle, setTravelStyle] = useState(""); // TRAVEL_STYLE_TAGS label (single)
  const [interests, setInterests] = useState([]); // multi tags from TAGS_BY_CATEGORY
  const [vibe, setVibe] = useState([]); // multi tags from EXPERIENCE_TAGS
  const [profileBaseline, setProfileBaseline] = useState(null);
  const [unsavedModalVisible, setUnsavedModalVisible] = useState(false);

  const userDocRef = useMemo(() => (uid ? doc(db, "users", uid) : null), [uid]);

  // Flatten all recommendation tags so we can show a single "Interests" group (like in your screenshot)
  const ALL_RECOMMENDATION_TAGS = useMemo(() => {
    const all = Object.values(TAGS_BY_CATEGORY || {}).flat();
    return Array.from(new Set(all)); // unique
  }, []);

  // Helpers for constants that may be objects {id,label}
  const getLabel = (item) => (typeof item === "object" ? item.label : item);

  const TRAVEL_STYLE_LABELS = useMemo(
    () => (TRAVEL_STYLE_TAGS || []).map(getLabel),
    []
  );
  const EXPERIENCE_LABELS = useMemo(
    () => (EXPERIENCE_TAGS || []).map(getLabel),
    []
  );

  useEffect(() => {
    let alive = true;

    async function load() {
      if (!userDocRef) {
        setProfileBaseline(null);
        setLoading(false);
        return;
      }

      try {
        const snap = await getDoc(userDocRef);
        const data = snap.exists() ? snap.data() : {};
        const sp = data.smartProfile || {};

        if (!alive) return;

        // Backward compatible load:
        // - old travelStyle/tripType/constraints may exist -> we ignore or map softly
        const b = sp.budget ?? sp.price ?? sp.travelStyle ?? "";
        const ts = sp.travelStyleTag ?? sp.travelStyle ?? "";
        const intr = Array.isArray(sp.interests) ? sp.interests : [];
        const vb = Array.isArray(sp.vibe) ? sp.vibe : (Array.isArray(sp.constraints) ? sp.constraints : []);
        setBudget(b);
        setTravelStyle(ts);
        setInterests(intr);
        setVibe(vb);
        setProfileBaseline(buildSmartProfileComparable({ budget: b, travelStyle: ts, interests: intr, vibe: vb }));
      } catch (e) {
        console.warn("Failed to load smart profile:", e);
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [userDocRef]);

  const profileFormComparable = useMemo(
    () => buildSmartProfileComparable({ budget, travelStyle, interests, vibe }),
    [budget, travelStyle, interests, vibe]
  );

  const hasUnsavedChanges =
    profileBaseline != null && profileFormComparable !== profileBaseline;

  const pendingDiscardRef = useRef(null);
  const dismissUnsavedModal = useCallback(() => {
    setUnsavedModalVisible(false);
    pendingDiscardRef.current = null;
  }, []);

  const confirmUnsavedLeave = useCallback(() => {
    const onConfirm = pendingDiscardRef.current;
    setUnsavedModalVisible(false);
    pendingDiscardRef.current = null;
    if (onConfirm) onConfirm();
  }, []);

  const promptDiscardUnsaved = useCallback((onConfirmLeave) => {
    pendingDiscardRef.current = onConfirmLeave;
    setUnsavedModalVisible(true);
  }, []);

  const { allowLeaveRef, handleHeaderBackPress } = useUnsavedLeaveGuard({
    navigation,
    guardActive: Boolean(uid && profileBaseline != null && !loading),
    sessionKey: uid ?? "",
    hasUnsavedChanges,
    submitting: saving,
    openUnsavedPrompt: promptDiscardUnsaved,
  });

  useBackButton(navigation, {
    title: "עריכת פרופיל",
    color: colors.primary,
    onPress: handleHeaderBackPress,
  });

  const onSave = async () => {
    if (!uid) return;

    // ✅ Basic validation (only budget required; others optional)
    if (!budget) {
      Alert.alert("Missing info", "Please choose a budget.");
      return;
    }

    setSaving(true);
    try {
      await setDoc(
        doc(db, "users", uid),
        {
          smartProfile: {
            budget,
            travelStyleTag: travelStyle, // keep naming consistent with your routes system
            interests,
            vibe,
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      Alert.alert("Saved", "Your Smart Profile was updated.", [
        {
          text: "OK",
          onPress: () => {
            allowLeaveRef.current = true;
            navigation.goBack();
          },
        },
      ]);
    } catch (e) {
      console.error("Failed to save smart profile:", e);
      Alert.alert("Error", "Could not save profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {loading ? (
        <View style={[common.containerCentered, { backgroundColor: colors.background }]}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <SafeAreaView style={common.container}>
          <View style={[common.container, { backgroundColor: colors.background }]}>
            <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Budget (PRICE_TAGS) */}
          <View style={cards.card}>
            <Text style={styles.sectionLabel}>תקציב</Text>
            <View style={[tags.chipRow, { marginTop: 10 }]}>
              {PRICE_TAGS.map((label) => (
                <Chip
                  key={label}
                  label={label}
                  selected={budget === label}
                  onPress={() => setBudget(label)}
                />
              ))}
            </View>
          </View>

          {/* Travel Style (TRAVEL_STYLE_TAGS) */}
          <View style={[cards.card, { marginTop: spacing.lg }]}>
            <Text style={styles.sectionLabel}>הרכב</Text>
            <View style={[tags.chipRow, { marginTop: 10 }]}>
              {TRAVEL_STYLE_LABELS.map((label) => (
                <Chip
                  key={label}
                  label={label}
                  selected={travelStyle === label}
                  onPress={() => setTravelStyle(label)}
                />
              ))}
            </View>
          </View>

          {/* Interests (Recommendation tags from TAGS_BY_CATEGORY) */}
          <View style={[cards.card, { marginTop: spacing.lg }]}>
            <Text style={styles.sectionLabel}>תחומי עניין</Text>
            <View style={[tags.chipRow, { marginTop: 10 }]}>
              {ALL_RECOMMENDATION_TAGS.map((label) => (
                <Chip
                  key={label}
                  label={label}
                  selected={interests.includes(label)}
                  onPress={() => setInterests((prev) => toggleValue(prev, label))}
                />
              ))}
            </View>
          </View>

          {/* Vibe / Experience (EXPERIENCE_TAGS) */}
          <View style={[cards.card, { marginTop: spacing.lg }]}>
            <Text style={styles.sectionLabel}>אופי טיול</Text>
            <View style={[tags.chipRow, { marginTop: 10 }]}>
              {EXPERIENCE_LABELS.map((label) => (
                <Chip
                  key={label}
                  label={label}
                  selected={vibe.includes(label)}
                  onPress={() => setVibe((prev) => toggleValue(prev, label))}
                />
              ))}
            </View>
          </View>

          {/* Save */}
          <TouchableOpacity
            style={[buttons.submit, saving && buttons.disabled]}
            onPress={onSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={buttons.submitText}>שמור</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </SafeAreaView>
      )}
      <UnsavedChangesModal
        visible={unsavedModalVisible}
        title={UNSAVED_LEAVE_TITLE}
        message={UNSAVED_LEAVE_MESSAGE}
        onCancel={dismissUnsavedModal}
        onConfirm={confirmUnsavedLeave}
        testID="edit-profile-unsaved-modal"
        cancelTestID="edit-profile-unsaved-cancel"
        confirmTestID="edit-profile-unsaved-confirm"
      />
    </>
  );
}
