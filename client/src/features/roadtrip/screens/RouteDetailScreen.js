import React, { useLayoutEffect, useState } from "react";
import { Modal, ScrollView, TouchableOpacity, View } from "react-native";
import AppText from "../../../components/AppText";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import PlacesRoute from "../components/PlacesRoute";
import DayViewModal from "../components/DayViewModal";
import { colors, routeDetailScreenStyles as styles } from "../../../styles";
import { Avatar } from "../../../components/Avatar";
import MetadataLine from "../../../components/MetadataLine";
import UsefulFactItem from "../../../components/UsefulFactItem";
import { TimelineItem } from "../../../components/TimelineItem";
import { useUserData } from "../../../hooks/useUserData";
import { flattenValidRouteStops } from "../utils/routeStops";
import RouteMapScreen from "./RouteMapScreen";
import { buildRouteDetailPresentation } from "../utils/routeDetailPresentation";

const text = {
	detailsTitle: "\u05e4\u05e8\u05d8\u05d9 \u05de\u05e1\u05dc\u05d5\u05dc",
	authorPrefix: "\u05de\u05d0\u05ea",
	defaultUser: "\u05de\u05d8\u05d9\u05d9\u05dc PlanLi",
	days: "\u05d9\u05de\u05d9\u05dd",
	km: "\u05e7\u05f4\u05de",
	openMap: "\u05e4\u05ea\u05d7 \u05de\u05e4\u05d4 \u05e9\u05dc \u05d4\u05de\u05e1\u05dc\u05d5\u05dc",
	noMapPoints: "\u05d0\u05d9\u05df \u05e0\u05e7\u05d5\u05d3\u05d5\u05ea \u05de\u05e4\u05d4 \u05d1\u05de\u05e1\u05dc\u05d5\u05dc",
	places: "\u05d9\u05e2\u05d3\u05d9\u05dd",
	itinerary: "\u05dc\u05d5\u05f4\u05d6 \u05d4\u05de\u05e1\u05dc\u05d5\u05dc",
	emptyItinerary: "\u05d0\u05d9\u05df \u05dc\u05d5\u05f4\u05d6 \u05d9\u05d5\u05de\u05d9 \u05dc\u05d4\u05e6\u05d2\u05d4.",
};

export default function RouteDetailScreen({ route, navigation }) {
	useLayoutEffect(() => {
		navigation.setOptions({ headerShown: false });
	}, [navigation]);

	const { routeData } = route.params;
	const [selectedDay, setSelectedDay] = useState(null);
	const [modalVisible, setModalVisible] = useState(false);
	const [mapVisible, setMapVisible] = useState(false);

	const tripDays = routeData.days || [];
	const validStops = flattenValidRouteStops(tripDays);
	const author = useUserData(routeData.ownerId);
	const displayUser = author.displayName || text.defaultUser;
	const userPhoto = author.photoURL;
	const places = Array.isArray(routeData.summaryPlaces) ? routeData.summaryPlaces : [];

	const presentation = buildRouteDetailPresentation(routeData);

	const openDay = (index) => {
		setSelectedDay(index);
		setModalVisible(true);
	};

	return (
		<SafeAreaView style={styles.screen}>
			<View style={styles.headerBar}>
				<TouchableOpacity
					style={styles.headerBackButton}
					onPress={() => navigation.goBack()}
					activeOpacity={0.8}
				>
					<Ionicons name="chevron-forward" size={28} color={colors.primary} />
				</TouchableOpacity>
				<AppText style={styles.headerTitle}>{text.detailsTitle}</AppText>
				<View style={styles.headerSideSpacer} />
			</View>

			<ScrollView contentContainerStyle={styles.scrollContent}>
				<View style={styles.headerSection}>
					<AppText style={styles.routeTitle}>{routeData.title}</AppText>

					<View style={styles.authorRow}>
						<Avatar photoURL={userPhoto} displayName={displayUser} size={24} />
						<AppText style={styles.authorText}>{text.authorPrefix} {displayUser}</AppText>
					</View>

					<AppText style={styles.descriptionText}>{routeData.description}</AppText>

					<View style={styles.metaRow}>
						<View style={styles.metaItem}>
							<Ionicons name="calendar-outline" size={16} color={colors.textSecondary} style={styles.metaIcon} />
							<AppText style={styles.metaText}>{routeData.dayCount} {text.days}</AppText>
						</View>
						<View style={styles.metaItem}>
							<Ionicons name="map-outline" size={16} color={colors.textSecondary} style={styles.metaIcon} />
							<AppText style={styles.metaText}>{routeData.distanceKm} {text.km}</AppText>
						</View>
					</View>

					<TouchableOpacity
						style={[styles.mapButton, validStops.length === 0 && styles.mapButtonDisabled]}
						activeOpacity={0.85}
						disabled={validStops.length === 0}
						onPress={() => setMapVisible(true)}
					>
						<Ionicons name="map" size={18} color={validStops.length ? colors.white : colors.textMuted} />
						<AppText style={[styles.mapButtonText, validStops.length === 0 && styles.mapButtonTextDisabled]}>
							{validStops.length ? text.openMap : text.noMapPoints}
						</AppText>
					</TouchableOpacity>

					{places.length > 0 && (
						<View style={styles.placesSection}>
							<AppText style={styles.subsectionTitle}>{text.places}</AppText>
							<PlacesRoute places={places} style={styles.placesRouteSpacing} />
						</View>
					)}


					{presentation.facts.length > 0 && (
						<View style={styles.detailSection}>
							<AppText style={styles.subsectionTitle}>פרטים שימושיים</AppText>
							<View style={styles.factsGrid}>
								{presentation.facts.map((fact) => (
									<UsefulFactItem key={fact.id} {...fact} style={styles.factItem} testID={`route-fact-${fact.id}`} />
								))}
							</View>
						</View>
					)}

					{presentation.groups.length > 0 && (
						<View style={styles.detailSection}>
							<AppText style={styles.subsectionTitle}>מידע נוסף</AppText>
							{presentation.groups.map((group) => (
								<View key={group.id} style={styles.metadataGroup}>
									<AppText style={styles.metadataTitle}>{group.title}</AppText>
									<MetadataLine icon={group.icon} values={group.values} testID={`route-metadata-${group.id}`} />
								</View>
							))}
						</View>
					)}

					{presentation.needs.length > 0 && (
						<View style={styles.detailSection}>
							<AppText style={styles.subsectionTitle}>חשוב לדעת</AppText>
							{presentation.needs.map((need) => (
								<View key={need} style={styles.needRow}>
									<MaterialIcons name="info-outline" size={20} color={colors.textSecondary} />
									<AppText style={styles.needText}>{need}</AppText>
									<Ionicons name="chevron-back" size={17} color={colors.textMuted} />
								</View>
							))}
						</View>
					)}
				</View>

				{tripDays.length > 0 ? (
					<View style={styles.timelineSection}>
						<AppText style={styles.timelineTitle}>{text.itinerary}</AppText>
						<View style={styles.timeline}>
							{tripDays.map((day, index) => (
								<TimelineItem
									key={index}
									day={day}
									index={index}
									isLast={index === tripDays.length - 1}
									onPress={() => openDay(index)}
								/>
							))}
						</View>
					</View>
				) : (
					<View style={styles.emptyState}>
						<AppText style={styles.emptyText}>{text.emptyItinerary}</AppText>
					</View>
				)}
			</ScrollView>

			<DayViewModal
				visible={modalVisible}
				onClose={() => setModalVisible(false)}
				dayData={selectedDay !== null ? tripDays[selectedDay] : null}
				dayIndex={selectedDay}
			/>

			<Modal visible={mapVisible} animationType="slide" presentationStyle="fullScreen">
				<RouteMapScreen
					route={{ params: { routeData } }}
					navigation={{ goBack: () => setMapVisible(false) }}
				/>
			</Modal>
		</SafeAreaView>
	);
}
