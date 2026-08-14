import React from 'react';
import { ScrollView, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AppText from '../../../components/AppText';
import { authStyles } from '../../../styles';
import { PRIVACY_DOCUMENT, TERMS_DOCUMENT } from '../legalContent';

export default function LegalDocumentScreen({ navigation, route }) {
  const document = route?.name === 'Privacy' ? PRIVACY_DOCUMENT : TERMS_DOCUMENT;
  return (
    <SafeAreaView style={authStyles.legalSafe} testID={`${route?.name?.toLowerCase()}-screen`}>
      <View style={authStyles.legalHeader}>
        <TouchableOpacity style={authStyles.legalBack} onPress={() => navigation.goBack()} accessibilityLabel="חזרה"><Ionicons name="arrow-forward" size={24} color="#1E3A5F" /></TouchableOpacity>
        <AppText style={authStyles.legalHeaderTitle}>{document.title}</AppText>
      </View>
      <ScrollView contentContainerStyle={authStyles.legalContent} showsVerticalScrollIndicator={false}>
        <AppText style={authStyles.legalMeta}>גרסה {document.version} · תחילה {document.effectiveDate}</AppText>
        <AppText style={authStyles.legalIntro}>{document.intro}</AppText>
        {document.sections.map((section) => (
          <View style={authStyles.legalSection} key={section.title}>
            <AppText style={authStyles.legalSectionTitle}>{section.title}</AppText>
            <AppText style={authStyles.legalBody}>{section.body}</AppText>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
