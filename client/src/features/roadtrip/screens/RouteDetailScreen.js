import React, { useLayoutEffect, useState } from "react";
import { Modal, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import PlacesRoute from "../components/PlacesRoute";
import DayViewModal from "../components/DayViewModal";
import { colors, common, tags as tagsStyle, routeDetailScreenStyles as styles } from "../../../styles";
import { Avatar } from "../../../components/Avatar";
import { TimelineItem } from "../../../components/TimelineItem";
import { useUserData } from "../../../hooks/useUserData";
import { flattenValidRouteStops } from "../utils/routeStops";
import RouteMapScreen from "./RouteMapScreen";

const text = {
	detailsTitle: "\u05e4\u05e8\u05d8\u05d9 \u05de\u05e1\u05dc\u05d5\u05dc",
	authorPrefix: "\u05de\u05d0\u05ea",
	defaultUser: "\u05de\u05d8\u05d9\u05d9\u05dc PlanLi",
	days: "\u05d9\u05de\u05d9\u05dd",
	km: "\u05e7\u05f4\u05de",
	openMap: "\u05e4\u05ea\u05d7 \u05de\u05e4\u05d4 \u05e9\u05dc \u05d4\u05de\u05e1\u05dc\u05d5\u05dc",
	noMapPoints: "\u05d0\u05d9\u05df \u05e0\u05e7\u05d5\u05d3\u05d5\u05ea \u05de\u05e4\u05d4 \u05d1\u05de\u05e1\u05dc\u05d5\u05dc",
	places: "\u05d9\u05e2\u05d3\u05d9\u05dd",
	tags: "\u05ea\u05d2\u05d9\u05d5\u05ea",
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

	const tripDays = routeData.tripDaysData || [];
	const validStops = flattenValidRouteStops(routeData);
	const author = useUserData(routeData.userId);
	const displayUser = author.displayName || text.defaultUser;
	const userPhoto = author.photoURL;
	const places = Array.isArray(routeData.places) ? routeData.places : [];

	const dedupe = (values) => Array.from(new Set(values.filter(Boolean)));
	const tagsArray = Array.isArray(routeData.tags) ? routeData.tags : [];
	const legacyTags = [
		routeData.difficultyTag,
		routeData.travelStyleTag,
		...(routeData.roadTripTags || []),
		...(routeData.experienceTags || []),
	];
	const allTags = dedupe([...tagsArray, ...legacyTags]);

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
				<Text style={styles.headerTitle}>{text.detailsTitle}</Text>
				<View style={styles.headerSideSpacer} />
			</View>

			<ScrollView contentContainerStyle={styles.scrollContent}>
				<View style={styles.headerSection}>
					<Text style={styles.routeTitle}>{routeData.Title}</Text>

					<View style={styles.authorRow}>
						<Avatar photoURL={userPhoto} displayName={displayUser} size={24} />
						<Text style={styles.authorText}>{text.authorPrefix} {displayUser}</Text>
					</View>

					<Text style={styles.descriptionText}>{routeData.desc}</Text>

					<View style={styles.metaRow}>
						<View style={styles.metaItem}>
							<Ionicons name="calendar-outline" size={16} color={colors.textSecondary} style={styles.metaIcon} />
							<Text style={styles.metaText}>{routeData.days} {text.days}</Text>
						</View>
						<View style={styles.metaItem}>
							<Ionicons name="map-outline" size={16} color={colors.textSecondary} style={styles.metaIcon} />
							<Text style={styles.metaText}>{routeData.distance} {text.km}</Text>
						</View>
					</View>

					<TouchableOpacity
						style={[styles.mapButton, validStops.length === 0 && styles.mapButtonDisabled]}
						activeOpacity={0.85}
						disabled={validStops.length === 0}
						onPress={() => setMapVisible(true)}
					>
						<Ionicons name="map" size={18} color={validStops.length ? colors.white : colors.textMuted} />
						<Text style={[styles.mapButtonText, validStops.length === 0 && styles.mapButtonTextDisabled]}>
							{validStops.length ? text.openMap : text.noMapPoints}
						</Text>
					</TouchableOpacity>

					{places.length > 0 && (
						<View style={styles.placesSection}>
							<Text style={styles.subsectionTitle}>{text.places}</Text>
							<PlacesRoute places={places} style={styles.placesRouteSpacing} />
						</View>
					)}

					{allTags.length > 0 && (
						<View style={styles.tagsSection}>
							<Text style={styles.subsectionTitle}>{text.tags}</Text>
							<View style={styles.tagsContainer}>
								{allTags.map((tag) => (
									<View key={tag} style={tagsStyle.itemSelected}>
										<Text style={tagsStyle.textSelected}>#{tag}</Text>
									</View>
								))}
							</View>
						</View>
					)}
				</View>

				{tripDays.length > 0 ? (
					<View style={styles.timelineSection}>
						<Text style={styles.timelineTitle}>{text.itinerary}</Text>
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
						<Text style={styles.emptyText}>{text.emptyItinerary}</Text>
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
