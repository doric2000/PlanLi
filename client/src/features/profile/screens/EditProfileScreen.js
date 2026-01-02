import React, { useEffect, useMemo, useState } from "react";
import { Alert, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { auth, db } from "../../../config/firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

import { colors, common, typography, cards, tags, buttons } from "../../../styles";
import { toggleValue } from "./utils/toggleValue";
import { TRAVEL_STYLES, TRIP_TYPES, INTERESTS, CONSTRAINTS } from "./constants/smartProfileOptions";

function Chip({ label, selected, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        tags.filterChip,
        selected && tags.filterChipSelected,
        { marginLeft: 0, marginRight: 8 },
      ]}
      activeOpacity={0.8}
    >
      <Text style={[tags.filterChipText, selected && tags.filterChipTextSelected]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export default function EditProfileScreen({ navigation }) {
  const uid = auth.currentUser?.uid;

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
      <SafeAreaView style={common.containerCentered}>
        <Text style={typography.profileEmail}>Loading...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={common.container}>
      {/* Header */}
      <View style={[common.header, { paddingHorizontal: 16, paddingVertical: 14 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={common.topButton}>
          <Ionicons name="chevron-back" size={22} color={colors.white} />
          <Text style={common.backText}>Back</Text>
        </TouchableOpacity>

        <Text style={[typography.sectionTitle, { color: colors.white }]}>
          Edit Profile
        </Text>

        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* Travel Style */}
        <View style={cards.card}>
          <Text style={typography.sectionTitle}>Travel Style</Text>
          <View style={[tags.chipRow, { marginTop: 10, justifyContent: "flex-start" }]}>
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
        <View style={[cards.card, { marginTop: 12 }]}>
          <Text style={typography.sectionTitle}>Trip Type</Text>
          <View style={[tags.chipRow, { marginTop: 10, justifyContent: "flex-start" }]}>
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
        <View style={[cards.card, { marginTop: 12 }]}>
          <Text style={typography.sectionTitle}>Interests</Text>
          <View style={[tags.chipRow, { marginTop: 10, justifyContent: "flex-start" }]}>
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
        <View style={[cards.card, { marginTop: 12 }]}>
          <Text style={typography.sectionTitle}>Constraints</Text>
          <View style={[tags.chipRow, { marginTop: 10, justifyContent: "flex-start" }]}>
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
          style={[buttons.primary, { marginTop: 18, opacity: saving ? 0.6 : 1 }]}
          onPress={onSave}
          disabled={saving}
          activeOpacity={0.85}
        >
          <Text style={buttons.primaryText}>
            {saving ? "Saving..." : "Save"}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
