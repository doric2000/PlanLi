import React, { useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  SafeAreaView,
  StatusBar,
  ActivityIndicator
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

const { width } = Dimensions.get('window');

/**
 * HELPER COMPONENT: InfoCard
 * Represents the 4 colored grid items (Weather, Airport, etc.)
 */

const InfoCard = ({ icon, title, data, subData, color, iconColor, library }) => (
  <View style={[styles.infoCard, { backgroundColor: color }]}>
    <View style={styles.cardHeader}>
      <Text style={styles.cardTitle}>{title}</Text>
      {library === 'Material' ? (
        <MaterialCommunityIcons name={icon} size={20} color={iconColor} />
      ) : (
        <Ionicons name={icon} size={20} color={iconColor} />
      )}
    </View>
    <View style={styles.cardContent}>
      <Text style={styles.cardData}>{data || '-'}</Text>
      <Text style={styles.cardSubData}>{subData || ''}</Text>
    </View>
  </View>
);

export default function TripDashboardScreen({ navigation, route }) {
    // 1. קבלת המזהים ממסך הבית
    const { cityId, countryId } = route.params; 

    const [cityData, setCityData] = useState(null);
    const [loading, setLoading] = useState(true);

  //pulls the identifiers on the city from db :
    useEffect(() => {
    const fetchCityData = async () => {
      try {
        // הנתיב: countries -> [France] -> cities -> [Paris]
        const docRef = doc(db, "countries", countryId, "cities", cityId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          setCityData(docSnap.data());
        } else {
          console.log("No such document!");
        }
      } 
      catch (error) {
        console.error("Error fetching city:", error);
      } 
      finally {
        setLoading(false);
      }
    };

    if (cityId && countryId) {
      fetchCityData();
    }
  }, [cityId, countryId]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF9F1C" />
      </View>
    );
  }

  if (!cityData) {
    return (
      <View style={styles.container}>
        <Text style={{textAlign: 'center', marginTop: 50}}>City not found.</Text>
      </View>
    );
  }

  // 3. שימוש ב-cityData האמיתי במקום המידע הסטטי
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Header Section */}
      <LinearGradient
        colors={['#1E3A5F', '#2EC4B6']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerBackground}
      >
        <SafeAreaView>
          <View style={styles.topBar}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.topButton}>
              <Ionicons name="arrow-forward" size={24} color="#fff" />
              <Text style={styles.backText}>Back</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconButton}>
              <Ionicons name="heart-outline" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          <View style={styles.headerContent}>
            {/* שם העיר נשלף מהדאטה-בייס */}
            <Text style={styles.destinationTitle}>{cityData.name}</Text>
            <View style={styles.statsRow}>
              <View style={styles.statBadge}>
                <Ionicons name="star" size={14} color="#FFD700" />
                <Text style={styles.statText}>{cityData.rating}</Text>
              </View>
              <Text style={styles.travelersText}>{cityData.travelers} Travelers</Text>
            </View>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <TouchableOpacity style={styles.planButton}>
        <Text style={styles.planButtonText}>Start Planning Your Trip</Text>
      </TouchableOpacity>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        style={styles.mainScrollView}
      >
        {/* Dynamic Grid - מציגים רק אם המידע קיים */}
        <View style={styles.gridContainer}>
          <InfoCard
            title="Weather"
            icon="cloud-outline"
            data={cityData.widgets?.weather?.temp}
            subData={cityData.widgets?.weather?.status}
            color="#E3F2FD"
            iconColor="#2196F3"
          />
          <InfoCard
            title="Airport"
            icon="airplane"
            data={cityData.widgets?.airport?.name}
            subData={cityData.widgets?.airport?.distance}
            color="#F3E5F5"
            iconColor="#9C27B0"
            library="Material"
          />
          <InfoCard
            title="Local Sim"
            icon="cellphone"
            data={cityData.widgets?.sim?.provider}
            subData={cityData.widgets?.sim?.price}
            color="#E8F5E9"
            iconColor="#4CAF50"
            library="Material"
          />
          <InfoCard
            title="Transport"
            icon="bus"
            data={cityData.widgets?.transport?.type}
            subData={cityData.widgets?.transport?.recommendation}
            color="#FFF3E0"
            iconColor="#FF9800"
            library="Material"
          />
        </View>

        {/* Essential Info */}
        <View style={styles.sectionContainer}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Essential Info</Text>
            <Ionicons name="wifi" size={20} color="#2EC4B6" />
          </View>

          <View style={styles.infoRow}>
            <View style={styles.iconBoxOrange}>
              <MaterialCommunityIcons name="office-building" size={24} color="#FF9F1C" />
            </View>
            <View style={styles.infoTextContainer}>
              <Text style={styles.infoTitle}>Recommended Hotel</Text>
              <Text style={styles.infoSubtitle}>{cityData.essentialInfo?.hotel || 'N/A'}</Text>
            </View>
          </View>

          <View style={[styles.infoRow, { borderBottomWidth: 0, marginBottom: 0 }]}>
            <View style={styles.iconBoxOrange}>
              <MaterialCommunityIcons name="car-side" size={24} color="#FF9F1C" />
            </View>
            <View style={styles.infoTextContainer}>
              <Text style={styles.infoTitle}>Trusted Driver</Text>
              <Text style={styles.infoSubtitle}>{cityData.essentialInfo?.driver || 'N/A'}</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerBackground: { paddingBottom: 30, borderBottomLeftRadius: 30, borderBottomRightRadius: 30, paddingHorizontal: 20, paddingTop: 10 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  topButton: { flexDirection: 'row', alignItems: 'center' },
  backText: { color: '#fff', fontSize: 16, marginLeft: 5, fontWeight: '600' },
  iconButton: { backgroundColor: 'rgba(255,255,255,0.2)', padding: 8, borderRadius: 20 },
  headerContent: { alignItems: 'flex-end', marginBottom: 20 },
  destinationTitle: { fontSize: 32, fontWeight: 'bold', color: '#fff', marginBottom: 5 },
  statsRow: { flexDirection: 'row', alignItems: 'center' },
  statBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, marginRight: 10 },
  statText: { color: '#fff', fontWeight: 'bold', marginLeft: 4, fontSize: 12 },
  travelersText: { color: '#fff', fontSize: 14 },
  planButton: { backgroundColor: '#FF9F1C', paddingVertical: 15, paddingHorizontal: 40, borderRadius: 12, alignItems: 'center', alignSelf: 'center', marginTop: -25, zIndex: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 5, elevation: 5 },
  planButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  mainScrollView: { marginTop: 10 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: 20 },
  infoCard: { width: (width - 50) / 2, padding: 15, borderRadius: 16, marginBottom: 15, height: 110, justifyContent: 'space-between' },
  cardHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 14, color: '#555', fontWeight: '600' },
  cardContent: { alignItems: 'flex-end' },
  cardData: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 2 },
  cardSubData: { fontSize: 12, color: '#666' },
  sectionContainer: { backgroundColor: '#E0F7FA', borderRadius: 16, padding: 15, marginTop: 10, borderWidth: 1, borderColor: '#B2EBF2' },
  sectionHeader: { flexDirection: 'row-reverse', alignItems: 'center', marginBottom: 15, justifyContent: 'space-between' },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', marginRight: 10 },
  infoRow: { backgroundColor: '#fff', borderRadius: 12, padding: 12, flexDirection: 'row-reverse', alignItems: 'center', marginBottom: 10 },
  iconBoxOrange: { width: 40, height: 40, backgroundColor: '#FFF3E0', borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginLeft: 12 },
  infoTextContainer: { flex: 1, alignItems: 'flex-end' },
  infoTitle: { fontSize: 14, fontWeight: 'bold', color: '#333', marginBottom: 2 },
  infoSubtitle: { fontSize: 12, color: '#777', textAlign: 'right' },
});