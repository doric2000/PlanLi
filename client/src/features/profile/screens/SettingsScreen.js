import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { settingsScreenStyles as styles } from '../../../styles';


export default function SettingsScreen({ navigation }) {
  return (
    <SafeAreaView style={styles.safe} testID="settings-screen">
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          activeOpacity={0.8}
          testID="settings-back-button"
        >
          <Ionicons name="arrow-back" size={22} color="#111" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>הגדרות</Text>
        <View style={styles.rightSpacer} />
      </View>

      <View style={styles.container}>
        <TouchableOpacity
          style={styles.primaryBtn}
          activeOpacity={0.9}
          onPress={() => navigation.navigate('ChangeName')}
          testID="settings-change-name-button"
        >
          <Text style={styles.primaryBtnText}>שינוי שם</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.primaryBtn}
          activeOpacity={0.9}
          onPress={() => navigation.navigate('ChangePassword')}
        >
          <Text style={styles.primaryBtnText}>שינוי סיסמה</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
