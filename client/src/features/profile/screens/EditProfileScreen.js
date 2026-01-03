import React, { useEffect, useMemo, useState } from "react";
import { Alert, ScrollView, Text, TouchableOpacity, View, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { auth, db } from "../../../config/firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

import { colors, common, cards, tags, buttons, spacing } from "../../../styles";
import { useBackButton } from "../../../hooks/useBackButton";
import { toggleValue } from "./utils/toggleValue";
import { TRAVEL_STYLES, TRIP_TYPES, INTERESTS, CONSTRAINTS } from "../constants/smartProfileOptions";
import { FormInput } from "../../../components/FormInput";


// Styles for new header and pattern (must be above component)
const styles = StyleSheet.create({
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: 40,
  },
  sectionLabel: {
    textAlign: 'right',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
    color: colors.textPrimary,
  },
});

function Chip({ label, selected, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        tags.filterChip,
        selected && tags.filterChipSelected,
      ]}
      activeOpacity={0.8}
    >
      <Text style={[tags.filterChipText, selected && tags.filterChipTextSelected]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// LabeledInput pattern from AddRecommendationScreen
const LabeledInput = ({ label, style, ...props }) => (
  <View style={[{ marginBottom: 16 }, style]}>
    <Text style={{ textAlign: 'right', fontSize: 14, fontWeight: 'bold', marginBottom: 8 }}>
      {label}
    </Text>
    <FormInput textAlign="right" {...props} />
  </View>
);

export default function EditProfileScreen({ navigation }) {
  const uid = auth.currentUser?.uid;
  useBackButton(navigation, { title: "עריכת פרופיל", color: colors.primary });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [travelStyle, setTravelStyle] = useState(null);     // "budget" | "medium" | "luxury"
  const [tripType, setTripType] = useState(null);           // "solo" | "couple" | "family" | "friends"
  const [interests, setInterests] = useState([]);           // array of strings
  const [constraints, setConstraints] = useState([]);       // array of strings

  const userDocRef = useMemo(() => (uid ? doc(db, "users", uid) : null), [uid]);

  useEffect(() => {
    let alive = true;

    async function load() {
      if (!userDocRef) {
        setLoading(false);
        return;
      }

      try {
        const snap = await getDoc(userDocRef);
        const data = snap.exists() ? snap.data() : {};
        const sp = data.smartProfile || {};

        if (!alive) return;

        setTravelStyle(sp.travelStyle ?? null);
        setTripType(sp.tripType ?? null);
        setInterests(Array.isArray(sp.interests) ? sp.interests : []);
        setConstraints(Array.isArray(sp.constraints) ? sp.constraints : []);
      } catch (e) {
        console.warn("Failed to load smart profile:", e);
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => { alive = false; };
  }, [userDocRef]);

  const onSave = async () => {
    if (!uid) return;

    // validations בסיסיות (אפשר להקשיח בהמשך)
    if (!travelStyle || !tripType) {
      Alert.alert("Missing info", "Please choose Travel Style and Trip Type.");
      return;
    }

    setSaving(true);
    try {
      await setDoc(
        doc(db, "users", uid),
        {
          smartProfile: {
            travelStyle,
            tripType,
            interests,
            constraints,
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      Alert.alert("Saved", "Your Smart Profile was updated.");
      navigation.goBack();
    } catch (e) {
      console.error("Failed to save smart profile:", e);
      Alert.alert("Error", "Could not save profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[common.containerCentered, { backgroundColor: colors.background }]}> 
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
  <SafeAreaView style={common.container}>
    <View style={[common.container, { backgroundColor: colors.background }]}> 
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Travel Style */}
        <View style={cards.card}>
          <Text style={styles.sectionLabel}>תקציב</Text>
          <View style={[tags.chipRow, { marginTop: 10 }]}> 
            {TRAVEL_STYLES.map(opt => (
              <Chip
                key={opt.value}
                label={opt.label}
                selected={travelStyle === opt.value}
                onPress={() => setTravelStyle(opt.value)}
              />
            ))}
          </View>
        </View>

        {/* Trip Type */}
        <View style={[cards.card, { marginTop: spacing.lg }]}> 
          <Text style={styles.sectionLabel}>הרכב הטיול</Text>
          <View style={[tags.chipRow, { marginTop: 10 }]}> 
            {TRIP_TYPES.map(opt => (
              <Chip
                key={opt.value}
                label={opt.label}
                selected={tripType === opt.value}
                onPress={() => setTripType(opt.value)}
              />
            ))}
          </View>
        </View>

        {/* Interests */}
        <View style={[cards.card, { marginTop: spacing.lg }]}> 
          <Text style={styles.sectionLabel}>תחומי עניין</Text>
          <View style={[tags.chipRow, { marginTop: 10 }]}> 
            {INTERESTS.map(opt => (
              <Chip
                key={opt.value}
                label={opt.label}
                selected={interests.includes(opt.value)}
                onPress={() => setInterests(prev => toggleValue(prev, opt.value))}
              />
            ))}
          </View>
        </View>

        {/* Constraints */}
        <View style={[cards.card, { marginTop: spacing.lg }]}> 
          <Text style={styles.sectionLabel}>אופי הטיול</Text>
          <View style={[tags.chipRow, { marginTop: 10 }]}> 
            {CONSTRAINTS.map(opt => (
              <Chip
                key={opt.value}
                label={opt.label}
                selected={constraints.includes(opt.value)}
                onPress={() => setConstraints(prev => toggleValue(prev, opt.value))}
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
  );
    }
