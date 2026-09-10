export function openOperation(navigation, entry) {
  if (!navigation || !entry) return;
  if (entry.source === 'publish' && ['failed', 'uncertain'].includes(entry.status) && !entry.targetId) {
    navigation.navigate(entry.kind === 'route' ? 'AddRoutesScreen' : 'AddRecommendation', {
      publishJobId: entry.id.replace(/^publish:/, ''),
      ...(entry.legacyEditor ? { legacyPublishJob: true } : {}),
    });
  } else if (entry.source === 'background' && entry.status === 'failed' && ['recommendation', 'route'].includes(entry.kind)) {
    navigation.navigate(entry.kind === 'route' ? 'AddRoutesScreen' : 'AddRecommendation');
  } else if (entry.kind === 'recommendation' && entry.targetId && entry.status === 'success') {
    navigation.navigate('RecommendationDetail', { postId: entry.targetId });
  } else if (entry.kind === 'route' && entry.targetId && entry.status === 'success') {
    navigation.navigate('RouteDetail', { routeId: entry.targetId });
  } else if (['comment', 'favorite', 'reaction'].includes(entry.kind) && entry.targetId) {
    navigation.navigate(entry.targetType === 'route' ? 'RouteDetail' : 'RecommendationDetail',
      entry.targetType === 'route' ? { routeId: entry.targetId } : { postId: entry.targetId });
  } else if (['EditProfile', 'NotificationSettings', 'Settings', 'Notifications', 'ChangeName', 'ChangePassword'].includes(entry.recoveryRoute)) {
    navigation.navigate(entry.recoveryRoute);
  } else {
    navigation.navigate('Main', { screen: 'Tabs', params: { screen: 'Profile' } });
  }
}
