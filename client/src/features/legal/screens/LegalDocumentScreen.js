import React from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AppText from '../../../components/AppText';
import PageHeader from '../../../components/PageHeader';
import RtlBackButton from '../../../components/RtlBackButton';
import { authStyles } from '../../../styles';
import { COMMUNITY_DOCUMENT, PRIVACY_DOCUMENT, TERMS_DOCUMENT } from '../legalContent';

export default function LegalDocumentScreen({ navigation, route }) {
  const document = route?.name === 'Privacy'
    ? PRIVACY_DOCUMENT
    : route?.name === 'CommunityGuidelines' ? COMMUNITY_DOCUMENT : TERMS_DOCUMENT;
  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={authStyles.legalSafe} testID={`${route?.name?.toLowerCase()}-screen`}>
      <PageHeader
        renderStart={() => <RtlBackButton onPress={() => navigation.goBack()} />}
        title={document.title}
        variant="detail"
      />
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
