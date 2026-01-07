import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  ImageBackground
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

// Custom Hooks & Components
import { useDestinationData } from '../hooks/useDestinationData';
import { InfoCard } from '../components/InfoCard';
import RecommendationCard from '../../../components/RecommendationCard';
import { CommentsModal } from '../../../components/CommentsModal';
import { BackButton } from '../../../components/BackButton';
import FavoriteButton from '../../../components/FavoriteButton';

// Styles
import { colors, typography, common, cards, buttons } from '../../../styles';

// Helper: Converts weather description to icon name
const getWeatherIcon = (weatherCondition) => {
  if (!weatherCondition) return 'help-circle-outline';
  const condition = weatherCondition.toLowerCase();
  if (condition.includes('clear')) return 'sunny';
  if (condition.includes('cloud')) return 'cloudy';
  if (condition.includes('rain')) return 'rainy';
  if (condition.includes('snow')) return 'snow';
  if (condition.includes('thunder')) return 'thunderstorm';
  if (condition.includes('mist') || condition.includes('fog')) return 'cloudy-outline';
  return 'partly-sunny';
};

export default function LandingPageScreen({ navigation, route }) {
  const { cityId, countryId } = route.params;

  const isValuePresent = (value) => {
    if (value === null || value === undefined) return false;
    if (typeof value !== 'string') return true;
    const trimmed = value.trim();
    return trimmed !== '' && trimmed !== '-';
  };

  // 1. All Logic handled by Custom Hook
  const { 
    cityData, 
    countryData, 
    recommendations, 
    weather, 
    currencyRate, 
    loading 
  } = useDestinationData(cityId, countryId);

  // UI State for Modal
  const [commentsModalVisible, setCommentsModalVisible] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState(null);

  const handleOpenComments = (postId) => {
    setSelectedPostId(postId);
    setCommentsModalVisible(true);
  };

  if (loading) {
    return (
      <View style={common.loadingContainer}>
        <ActivityIndicator size="large" color={colors.secondary} />
      </View>
    );
  }

  if (!cityData) {
    return (
      <View style={common.container}>
        <Text style={{ textAlign: 'center', marginTop: 50, color: colors.textPrimary }}>
          העיר לא נמצאה.
        </Text>
      </View>
    );
  }

  const widgetWeatherTemp = cityData.widgets?.weather?.temp;
  const widgetWeatherStatus = cityData.widgets?.weather?.status;
  const displayedWeatherTemp = weather?.temp ?? widgetWeatherTemp;
  const displayedWeatherStatus = weather?.desc ?? widgetWeatherStatus;
  const isWeatherUnavailable = !displayedWeatherTemp && !displayedWeatherStatus;

  const airportName = cityData.widgets?.airport?.name;
  const airportDistance = cityData.widgets?.airport?.distance;
  const simProvider = cityData.widgets?.sim?.provider;
  const simPrice = cityData.widgets?.sim?.price;
  const transportType = cityData.widgets?.transport?.type;
  const transportRecommendation = cityData.widgets?.transport?.recommendation;

  // Create snapshot data for city favorites
  const citySnapshotData = {
    name: cityData.name,
    thumbnail_url: cityData.imageUrl,
    sub_text: `${cityData.travelers || 0} מטיילים`,
    rating: cityData.rating,
    countryId: countryId,
    travelers: cityData.travelers || 0
  };

  return (
    <SafeAreaView style={common.container} edges={['left', 'right', 'bottom']}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <ScrollView 
        contentContainerStyle={common.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* --- Header Section --- */}
        <View style={common.staticHeaderContainer}>
          <ImageBackground
            source={{ uri: cityData.imageUrl || 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=800' }}
            style={{ height: 260, width: '100%' }}
            resizeMode="cover"
          >
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.7)']}
              style={{ flex: 1, justifyContent: 'space-between', padding: 16, paddingTop: 40, paddingBottom: 35 }}
            >
              <View style={common.topBar}>
                <BackButton />
                <FavoriteButton 
                  type="cities" 
                  id={cityId} 
                  variant="light" 
                  style={{ backgroundColor: 'rgba(255,255,255,0.2)', padding: 8, borderRadius: 20 }}
                  snapshotData={citySnapshotData}
                />
              </View>

              <View style={{ alignItems: 'flex-start' }}>
                <Text style={[typography.h1, { color: colors.white, marginBottom: 8, textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 3 }]}>
                  {cityData.name}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 15, marginRight: 10 }}>
                    <Ionicons name="star" size={14} color="#FFD700" />
                    <Text style={{ color: colors.white, fontWeight: 'bold', marginLeft: 4, fontSize: 13 }}>
                      {cityData.rating}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 15 }}>
                    <Ionicons name="people" size={14} color={colors.white} />
                    <Text style={{ color: colors.white, marginLeft: 4, fontSize: 13 }}>
                      {cityData.travelers} מטיילים
                    </Text>
                  </View>
                </View>
              </View>
            </LinearGradient>
          </ImageBackground>

          <TouchableOpacity style={buttons.floatingPlan}>
            <Text style={buttons.floatingPlanText}>התחל לתכנן את הטיול</Text>
          </TouchableOpacity>
        </View>

        {/* --- Main Content --- */}
        <View style={common.mainContent}>
          
          {/* Info Grid using Modular InfoCard */}
          <View style={cards.infoGrid}>
            <InfoCard
              title="מזג אוויר נוכחי"
              icon={weather ? getWeatherIcon(weather.main) : "cloud-outline"}
              data={isWeatherUnavailable ? 'לא זמין' : displayedWeatherTemp}
              subData={isWeatherUnavailable ? 'מידע על מזג האוויר לא זמין כרגע' : displayedWeatherStatus}
              color={colors.successLight}
              iconColor={colors.info}
            />
            <InfoCard
              title="שדה תעופה"
              icon="airplane"
              data={isValuePresent(airportName) ? airportName : 'לא זמין'}
              subData={isValuePresent(airportName) ? (isValuePresent(airportDistance) ? airportDistance : 'לא זמין') : ''}
              color={colors.successLight}
              iconColor={colors.accent}
              library="Material"
            />
            <InfoCard
              title="סים מקומי"
              icon="cellphone"
              data={isValuePresent(simProvider) ? simProvider : 'לא זמין'}
              subData={isValuePresent(simProvider) ? (isValuePresent(simPrice) ? simPrice : 'לא זמין') : ''}
              color={colors.successLight}
              iconColor={colors.success}
              library="Material"
            />
            <InfoCard
              title="תחבורה"
              icon="bus"
              data={isValuePresent(transportType) ? transportType : 'לא זמין'}
              subData={isValuePresent(transportType) ? (isValuePresent(transportRecommendation) ? transportRecommendation : 'לא זמין') : ''}
              color={colors.successLight}
              iconColor={colors.warning}
              library="Material"
            />
          </View>

          {/* Essential Info Section */}
          <View style={cards.sectionContainer}>
            <View style={cards.sectionHeader}>
              <Text style={cards.sectionTitle}>מידע חיוני</Text>
              <Ionicons name="wifi" size={20} color={colors.primary} />
            </View>

            <View style={cards.infoRow}>
              <View style={cards.iconBox}>
                <MaterialCommunityIcons name="office-building" size={24} color={colors.secondary} />
              </View>
              <View style={cards.infoTextContainer}>
                <Text style={cards.infoTitle}>מלון מומלץ</Text>
                <Text style={cards.infoSubtitle}>{cityData.essentialInfo?.hotel || 'לא זמין'}</Text>
              </View>
            </View>
            
            <View style={cards.infoRow}>
              <View style={cards.iconBox}>
                <MaterialCommunityIcons name="car-side" size={24} color={colors.secondary} />
              </View>
              <View style={cards.infoTextContainer}>
                <Text style={cards.infoTitle}>נהג מומלץ</Text>
                <Text style={cards.infoSubtitle}>{cityData.essentialInfo?.driver || 'לא זמין'}</Text>
              </View>
            </View>
          
            <View style={[cards.infoRow, { borderBottomWidth: 0, marginBottom: 0 }]}>
              <View style={cards.iconBox}>
                <MaterialCommunityIcons name="cash-multiple" size={24} color={colors.secondary} />
              </View>
              <View style={cards.infoTextContainer}>
                <Text style={cards.infoTitle}>מטבע ({countryData?.currencyCode || 'מקומי'})</Text>
                <Text style={cards.infoSubtitle}>{currencyRate || 'בודק שערים...'}</Text>
              </View>
            </View>
          </View>

          {/* Community Feed */}
          <View style={common.feedSection}>
              <Text style={common.feedTitle}>המלצות מהקהילה</Text>
              <Text style={common.feedSubtitle}>מה מטיילים אומרים על {cityData.name}</Text>
              
              {recommendations.length === 0 ? (
                  <View style={common.emptyState}>
                      <Ionicons name="chatbubble-ellipses-outline" size={40} color={colors.textMuted} />
                  <Text style={common.emptyText}>עדיין אין המלצות.</Text>
                  <Text style={common.emptySubText}>היו הראשונים לשתף את החוויה שלכם!</Text>
                  </View>
              ) : (
                  recommendations.map((item) => (
                      <RecommendationCard 
                        key={item.id} 
                        item={item} 
                        onCommentPress={handleOpenComments}
                        showActionBar={false}
                      />
                  ))
              )}
          </View>
        </View>
      </ScrollView>

      <CommentsModal
        visible={commentsModalVisible}
        onClose={() => setCommentsModalVisible(false)}
        postId={selectedPostId}
      />
    </SafeAreaView>
  );
}