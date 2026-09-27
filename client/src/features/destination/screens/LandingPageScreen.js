import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StatusBar, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AppText from '../../../components/AppText';
import BackButton from '../../../components/BackButton';
import CachedImage from '../../../components/CachedImage';
import FavoriteButton from '../../../components/FavoriteButton';
import PhotoAttribution from '../../../components/PhotoAttribution';
import RecommendationCard from '../../../components/RecommendationCard';
import { RouteCard } from '../../roadtrip/components/RouteCard';
import { CommentsModal } from '../../../components/CommentsModal';
import ReportButton from '../../moderation/components/ReportButton';
import { communityPalette as c } from '../../../styles/communityDiscovery';
import { getDestinationImageUrl } from '../../../utils/destinationImages';
import { createEmptyDiscoveryFilters, hasDiscoveryFilters } from '../../../utils/discoveryFilters';
import { countDiscoveryFilters } from '../../../utils/progressiveDiscoveryFilters';
import { destinationSourceUrlPolicy, getSafeExternalUrl, openSafeExternalUrl } from '../../../utils/safeExternalUrl';
import { createDestinationStyles } from '../components/destinationStyles';
import { useDestinationData } from '../hooks/useDestinationData';
import { useCityDiscovery } from '../hooks/useCityDiscovery';
import { CitySearch } from '../components/CitySearch';
import CityFilterModal from '../components/CityFilterModal';
import CityMapSection from '../components/CityMapSection';
import { markNoyaContentViewed } from '../../profile/services/NoyaOnboardingStorage';
import { buildEssentialRows, buildQuickFacts, buildSourceRows } from '../utils/destinationViewModel';

const PAGE_SIZE = 6;
function weatherIcon(code) {
  const value = String(code || '').toLowerCase();
  if (value.includes('clear')) return 'sunny-outline';
  if (value.includes('rain') || value.includes('drizzle')) return 'rainy-outline';
  if (value.includes('cloud')) return 'cloudy-outline';
  if (value.includes('snow')) return 'snow-outline';
  return 'partly-sunny-outline';
}
function dateLabel(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'short', year: 'numeric' }).format(date) : '';
}
function meaningfulDescription(destination) {
  const value = String(destination?.description || '').trim();
  const normalize = (text) => String(text || '').toLocaleLowerCase('he').replace(/[\s,|·–—-]+/g, ' ').trim();
  return normalize(value) === normalize(`${destination?.name || ''} ${destination?.countryName || ''}`) ? '' : value;
}
function FactCard({ fact, styles }) {
  return <View style={[styles.quickCard, fact.id === 'weather' && styles.weatherCard]} testID={`quick-fact-${fact.id}`}>
    <Ionicons name={fact.id === 'weather' ? weatherIcon(fact.conditionCode) : 'cash-outline'} size={24} color={c.navy} />
    <View style={styles.factCopy}>
      <AppText style={styles.factTitle}>{fact.title}</AppText>
      <AppText style={[styles.factValue, fact.id === 'weather' && styles.weatherValue]}>{fact.value}</AppText>
      {!!fact.detail && <AppText style={[styles.factDetail, fact.id === 'currency' && styles.ltrValue]}>{fact.detail}</AppText>}
    </View>
  </View>;
}
function EssentialCard({ rows, airport, styles }) {
  if (!rows.length && !airport) return null;
  return <View style={styles.section}>
    <AppText style={styles.sectionTitle}>מידע שימושי</AppText>
    <View style={styles.neutralCard}>
      {!!rows.length && <View style={styles.essentialsGrid}>{rows.map((row) => <View key={row.id} style={styles.essentialItem}>
        <Ionicons name={row.id === 'languages' ? 'language-outline' : 'call-outline'} size={20} color={c.navy} />
        <View style={styles.factCopy}>
          <AppText style={styles.factTitle}>{row.label}</AppText>
          <AppText style={[styles.essentialValue, row.id === 'callingCodes' && styles.ltrValue]}>{row.value}</AppText>
        </View>
      </View>)}</View>}
      {!!airport && <View style={styles.airportRow} testID="quick-fact-airport">
        <Ionicons name="airplane-outline" size={22} color={c.navy} />
        <View style={styles.factCopy}>
          <AppText style={styles.factTitle}>שדה תעופה קרוב</AppText>
          <AppText style={styles.essentialValue}>{airport.value}</AppText>
          {!!airport.detail && <AppText style={styles.factDetail}>{airport.detail}</AppText>}
        </View>
      </View>}
    </View>
  </View>;
}
function SourcesDisclosure({ rows, open, onToggle, styles }) {
  if (!rows.length) return null;
  return <View>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel="מקורות ועדכון" onPress={onToggle} style={styles.sourcesButton}>
      <AppText style={styles.sourcesButtonText}>מקורות ועדכון</AppText>
      <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={c.muted} />
    </Pressable>
    {open && <View style={styles.sourcesList}>{rows.map((row) => {
      const policy = destinationSourceUrlPolicy(row.id);
      const url = getSafeExternalUrl(row.url, policy);
      return <Pressable key={row.id} disabled={!url} accessibilityRole={url ? 'link' : undefined}
        accessibilityLabel={`${row.label}: ${row.value}`} style={styles.sourceRow}
        onPress={() => url && openSafeExternalUrl(url, policy).catch(() => Alert.alert('לא ניתן לפתוח את הקישור', 'אפשר לנסות שוב מאוחר יותר.'))}>
        <AppText style={styles.sourceLabel}>{row.label}</AppText>
        <AppText style={styles.sourceValue}>{[row.value, dateLabel(row.updatedAt)].filter(Boolean).join(' · ')}</AppText>
        {!!url && <Ionicons name="open-outline" size={16} color={c.navy} />}
      </Pressable>;
    })}</View>}
  </View>;
}

function CityPage({ navigation, cityId, countryId }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createDestinationStyles(width, insets), [width, insets]);
  const { overview, loading, error, retry } = useDestinationData(cityId, countryId);
  const [kind, setKind] = useState('recommendations');
  const [filtersByKind, setFiltersByKind] = useState(() => ({ recommendations: createEmptyDiscoveryFilters(), routes: createEmptyDiscoveryFilters() }));
  const [filterOpen, setFilterOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [comments, setComments] = useState(null);
  const filters = filtersByKind[kind];
  const updateFilters = (next) => setFiltersByKind((previous) => ({ ...previous, [kind]: next }));
  const updateRecommendationFilters = (next) => setFiltersByKind((previous) => ({ ...previous, recommendations: next }));
  const recommendations = useCityDiscovery({ cityId, countryId, filters: filtersByKind.recommendations });
  const routes = useCityDiscovery({ cityId, countryId, kind: 'routes', filters: filtersByKind.routes, enabled: kind === 'routes' });
  const discovery = kind === 'routes' ? routes : recommendations;
  const quickFacts = buildQuickFacts(overview?.quickFacts || {});
  const airport = quickFacts.find((fact) => fact.id === 'airport');
  const essentialRows = buildEssentialRows(overview?.essentialFacts || {});
  const sourceRows = buildSourceRows(overview?.sources || {});
  const filterCount = countDiscoveryFilters(filters);
  useEffect(() => { markNoyaContentViewed().catch(() => {}); }, [cityId, countryId]);
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [kind, filters]);
  const destination = overview?.destination;
  if (loading || !destination) return <SafeAreaView style={styles.loading} edges={['top', 'left', 'right', 'bottom']}>
    <BackButton color="dark" variant="solid" onPress={() => navigation.goBack()} />
    {loading ? <ActivityIndicator color={c.navy} size="large" /> : <Ionicons name="location-outline" size={38} color={c.muted} />}
    <AppText style={styles.errorText}>{loading ? 'טוענים את היעד…' : error || 'היעד לא נמצא.'}</AppText>
    {!loading && <Pressable onPress={retry} style={styles.showMoreButton} accessibilityRole="button"><AppText style={styles.showMoreText}>ניסיון נוסף</AppText></Pressable>}
  </SafeAreaView>;

  const heroUrl = getDestinationImageUrl(destination, 'large');
  const description = meaningfulDescription(destination);
  const snapshotData = { name: destination.name, thumbnail_url: getDestinationImageUrl(destination, 'thumb'), destinationImage: destination.destinationImage || null, countryId };
  const header = <View>
    <View style={styles.hero}>
      {!!heroUrl && <CachedImage source={{ uri: heroUrl }} contentFit="cover" style={styles.heroImage} priority="high" />}
      <LinearGradient colors={['rgba(8,26,33,0.08)', 'rgba(8,26,33,0.78)']} style={styles.heroShade} pointerEvents="none" />
      <View style={styles.heroActions}>
        <BackButton color="dark" variant="solid" onPress={() => navigation.goBack()} />
        <FavoriteButton type="cities" id={cityId} variant="light" style={styles.actionButton} snapshotData={snapshotData} />
      </View>
      <View style={styles.heroCopy}>
        <AppText style={styles.countryName}>{destination.countryName}</AppText>
        <AppText style={styles.cityName}>{destination.name}</AppText>
      </View>
      <PhotoAttribution destination={destination} placement="hero" style={styles.heroCredit} />
    </View>
    <View style={styles.sections}>
      {!!description && <AppText style={styles.description}>{description}</AppText>}
      {quickFacts.some((fact) => fact.id !== 'airport') && <View style={styles.section}>
        <AppText style={styles.sectionTitle}>במבט מהיר</AppText>
        <View style={styles.quickGrid}>{quickFacts.filter((fact) => fact.id !== 'airport').map((fact) => <FactCard key={fact.id} fact={fact} styles={styles} />)}</View>
      </View>}
      <EssentialCard rows={essentialRows} airport={airport} styles={styles} />
      <CityMapSection destination={destination} cityId={cityId} countryId={countryId} recommendations={recommendations.items}
        seedLoading={recommendations.loading} filters={filtersByKind.recommendations} onFiltersChange={updateRecommendationFilters}
        navigation={navigation} onComments={(id) => setComments({ id, collection: 'recommendations' })} styles={styles} />
      <View style={styles.section}>
        <AppText style={styles.communityTitle}>מהמטיילים, בשבילכם</AppText>
        <View style={styles.modes}>
          {[['recommendations', 'המלצות', 'thumbs-up-outline'], ['routes', 'מסלולים', 'map-outline']].map(([id, label, icon]) =>
            <Pressable key={id} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: kind === id }}
              onPress={() => setKind(id)} style={[styles.mode, kind === id && styles.modeSelected]}>
              <Ionicons name={icon} size={20} color={kind === id ? c.white : c.navy} />
              <AppText style={[styles.modeText, kind === id && styles.modeTextSelected]}>{label}</AppText>
            </Pressable>)}
        </View>
        <CitySearch kind={kind} value={filters.query} onChange={(query) => updateFilters({ ...filters, query })}
          onFilter={() => setFilterOpen(true)} filterCount={filterCount} styles={styles} />
        <View style={styles.filterSummary}>
          <AppText style={[styles.factDetail, styles.filterSummaryLabel]}>{kind === 'routes' ? 'מסלולים' : 'המלצות'} ב{destination.name}</AppText>
          {hasDiscoveryFilters(filters) && <Pressable onPress={() => updateFilters(createEmptyDiscoveryFilters())} style={styles.clearButton} accessibilityRole="button">
            <AppText style={styles.showMoreText}>נקה סינון</AppText>
          </Pressable>}
        </View>
      </View>
    </View>
  </View>;
  return <SafeAreaView style={styles.screen} edges={['left', 'right']}>
    <StatusBar barStyle="light-content" />
    <FlatList testID="city-guide-list" data={discovery.items.slice(0, visibleCount)} keyExtractor={(item) => `${kind}:${item.id}`}
      contentContainerStyle={styles.content} ListHeaderComponent={header} keyboardShouldPersistTaps="handled"
      initialNumToRender={3} maxToRenderPerBatch={3} windowSize={5} removeClippedSubviews={false}
      renderItem={({ item }) => <View style={styles.listItem}>{kind === 'routes'
        ? <RouteCard item={item} variant="community" showActionMenu={false} onPress={() => navigation.navigate('RouteDetail', { routeId: item.id })}
            onCommentPress={(id) => setComments({ id, collection: 'routes' })} />
        : <RecommendationCard item={item} variant="community" onDeleted={recommendations.removeItem}
            onCommentPress={(id) => setComments({ id, collection: 'recommendations' })} />}</View>}
      ListEmptyComponent={<View style={styles.sections}><View style={styles.state}>
        {discovery.loading ? <ActivityIndicator color={c.navy} /> : <Ionicons name={discovery.error ? 'cloud-offline-outline' : 'search-outline'} size={30} color={c.navy} />}
        <AppText style={styles.stateTitle}>{discovery.loading ? 'מחפשים בשבילכם…' : discovery.error ? 'התוכן לא נטען כרגע'
          : hasDiscoveryFilters(filters) ? 'לא נמצאו תוצאות מתאימות' : kind === 'routes' ? 'עדיין אין מסלולים בעיר' : 'עדיין אין המלצות בעיר'}</AppText>
        {!discovery.loading && <AppText style={styles.stateText}>{discovery.error ? 'פרטי העיר נשארים זמינים. אפשר לנסות שוב.'
          : 'אפשר לשנות את החיפוש או לחזור בהמשך.'}</AppText>}
        {!!discovery.error && <Pressable onPress={discovery.retry} style={styles.showMoreButton} accessibilityRole="button">
          <AppText style={styles.showMoreText}>ניסיון נוסף</AppText></Pressable>}
      </View></View>}
      ListFooterComponent={<View style={styles.footer}>
        {visibleCount < discovery.items.length && <Pressable onPress={() => setVisibleCount((value) => value + PAGE_SIZE)} style={styles.showMoreButton} accessibilityRole="button">
          <AppText style={styles.showMoreText}>{kind === 'routes' ? 'עוד מסלולים בעיר' : 'עוד המלצות בעיר'}</AppText>
          <Ionicons name="arrow-back-outline" size={20} color={c.navy} />
        </Pressable>}
        <SourcesDisclosure rows={sourceRows} open={sourcesOpen} onToggle={() => setSourcesOpen((value) => !value)} styles={styles} />
        <View style={styles.reportRow}><ReportButton target={{ type: 'destination', id: cityId, cityId, countryId }} subjectLabel="המקום" color={c.navy} /></View>
      </View>}
    />
    <CityFilterModal visible={filterOpen} onClose={() => setFilterOpen(false)} kind={kind} cityName={destination.name} filters={filters}
      onApply={(next) => { updateFilters(next); setFilterOpen(false); }} />
    {!!comments && <CommentsModal visible postId={comments.id} collectionName={comments.collection} onClose={() => setComments(null)} />}
  </SafeAreaView>;
}

export default function LandingPageScreen({ navigation, route }) {
  const { cityId, countryId } = route?.params || {};
  return <CityPage key={`${countryId}:${cityId}`} cityId={cityId} countryId={countryId} navigation={navigation} />;
}
