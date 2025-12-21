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
import { useDestinationData } from '../hooks/useDestinationData'; // new hook file ive created
import { InfoCard } from '../components/InfoCard'; // New modular component
import RecommendationCard from '../../community/components/RecommendationCard';
import { CommentsModal } from '../../../components/CommentsModal';
import { BackButton } from '../../../components/BackButton';

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
          City not found.
        </Text>
      </View>
    );
  }

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
                <TouchableOpacity style={{ backgroundColor: 'rgba(255,255,255,0.2)', padding: 8, borderRadius: 20 }}>
                  <Ionicons name="heart-outline" size={24} color={colors.white} />
                </TouchableOpacity>
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
                      {cityData.travelers} Travelers
                    </Text>
                  </View>
                </View>
              </View>
            </LinearGradient>
          </ImageBackground>

          <TouchableOpacity style={buttons.floatingPlan}>
            <Text style={buttons.floatingPlanText}>Start Planning Your Trip</Text>
          </TouchableOpacity>
        </View>

        {/* --- Main Content --- */}
        <View style={common.mainContent}>
          
          {/* Info Grid using Modular InfoCard */}
          <View style={cards.infoGrid}>
            <InfoCard
              title="Current Weather"
              icon={weather ? getWeatherIcon(weather.main) : "cloud-outline"}
              data={weather ? weather.temp : (cityData.widgets?.weather?.temp)}
              subData={weather ? weather.desc : (cityData.widgets?.weather?.status)}
              color={colors.successLight}
              iconColor={colors.info}
            />
            <InfoCard
              title="Airport"
              icon="airplane"
              data={cityData.widgets?.airport?.name}
              subData={cityData.widgets?.airport?.distance}
              color={colors.successLight}
              iconColor={colors.accent}
              library="Material"
            />
            <InfoCard
              title="Local Sim"
              icon="cellphone"
              data={cityData.widgets?.sim?.provider}
              subData={cityData.widgets?.sim?.price}
              color={colors.successLight}
              iconColor={colors.success}
              library="Material"
            />
            <InfoCard
              title="Transport"
              icon="bus"
              data={cityData.widgets?.transport?.type}
              subData={cityData.widgets?.transport?.recommendation}
              color={colors.successLight}
              iconColor={colors.warning}
              library="Material"
            />
          </View>

          {/* Essential Info Section */}
          <View style={cards.sectionContainer}>
            <View style={cards.sectionHeader}>
              <Text style={cards.sectionTitle}>Essential Info</Text>
              <Ionicons name="wifi" size={20} color={colors.primary} />
            </View>

            <View style={cards.infoRow}>
              <View style={cards.iconBox}>
                <MaterialCommunityIcons name="office-building" size={24} color={colors.secondary} />
              </View>
              <View style={cards.infoTextContainer}>
                <Text style={cards.infoTitle}>Recommended Hotel</Text>
                <Text style={cards.infoSubtitle}>{cityData.essentialInfo?.hotel || 'N/A'}</Text>
              </View>
            </View>
            
            <View style={cards.infoRow}>
              <View style={cards.iconBox}>
                <MaterialCommunityIcons name="car-side" size={24} color={colors.secondary} />
              </View>
              <View style={cards.infoTextContainer}>
                <Text style={cards.infoTitle}>Trusted Driver</Text>
                <Text style={cards.infoSubtitle}>{cityData.essentialInfo?.driver || 'N/A'}</Text>
              </View>
            </View>
          
            <View style={[cards.infoRow, { borderBottomWidth: 0, marginBottom: 0 }]}>
              <View style={cards.iconBox}>
                <MaterialCommunityIcons name="cash-multiple" size={24} color={colors.secondary} />
              </View>
              <View style={cards.infoTextContainer}>
                <Text style={cards.infoTitle}>Currency ({countryData?.currencyCode || 'Local'})</Text>
                <Text style={cards.infoSubtitle}>{currencyRate || 'Checking rates...'}</Text>
              </View>
            </View>
          </View>

          {/* Community Feed */}
          <View style={common.feedSection}>
              <Text style={common.feedTitle}>Community Recommendations</Text>
              <Text style={common.feedSubtitle}>What travelers say about {cityData.name}</Text>
              
              {recommendations.length === 0 ? (
                  <View style={common.emptyState}>
                      <Ionicons name="chatbubble-ellipses-outline" size={40} color={colors.textMuted} />
                      <Text style={common.emptyText}>No recommendations yet.</Text>
                      <Text style={common.emptySubText}>Be the first to share your experience!</Text>
                  </View>
              ) : (
                  recommendations.map((item) => (
                      <RecommendationCard 
                        key={item.id} 
                        item={item} 
                        onCommentPress={handleOpenComments}
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