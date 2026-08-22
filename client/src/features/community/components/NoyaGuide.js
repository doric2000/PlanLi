import React from 'react';
import { View } from 'react-native';

import AppText from '../../../components/AppText';
import CachedImage from '../../../components/CachedImage';
import { recommendationComposerStyles as styles } from '../../../styles';

const NOYA_IMAGE = require('../../../../assets/noya-assistant.png');

export default function NoyaGuide({ message, testID = 'noya-guide' }) {
  return (
    <View style={styles.noyaRow} testID={testID}>
      <CachedImage
        source={NOYA_IMAGE}
        style={styles.noyaAvatar}
        contentFit="cover"
        contentPosition={{ left: '50%', top: '32%' }}
        transition={0}
        accessibilityLabel="נועה, העוזרת האישית של PlanLi"
      />
      <View style={styles.noyaBubble}>
        <AppText style={styles.noyaName}>נועה</AppText>
        <AppText style={styles.noyaMessage}>{message}</AppText>
      </View>
    </View>
  );
}
