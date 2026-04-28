import React from "react";
import { Image, Linking, Modal, SafeAreaView, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { colors, dayViewModalStyles as styles } from "../../../styles";
import { buildGoogleMapsPlaceUrl } from "../utils/routeStops";

const text = {
	day: "\u05d9\u05d5\u05dd",
	dayStory: "\u05e1\u05d9\u05e4\u05d5\u05e8 \u05d4\u05d9\u05d5\u05dd",
	noDayDescription: "\u05d0\u05d9\u05df \u05ea\u05d9\u05d0\u05d5\u05e8 \u05dc\u05d9\u05d5\u05dd \u05d4\u05d6\u05d4.",
	stops: "\u05ea\u05d7\u05e0\u05d5\u05ea",
	maps: "\u05de\u05e4\u05d5\u05ea",
	noStops: "\u05d0\u05d9\u05df \u05ea\u05d7\u05e0\u05d5\u05ea \u05d1\u05d9\u05d5\u05dd \u05d4\u05d6\u05d4.",
};

export default function DayViewModal({ visible, onClose, dayData, dayIndex }) {
	if (!dayData) return null;

	const stops = Array.isArray(dayData.stops) ? dayData.stops : [];
	const openStop = (stop) => {
		const url = buildGoogleMapsPlaceUrl(stop);
		if (!url) return;
		Linking.openURL(url).catch(() => {});
	};

	return (
		<Modal
			visible={visible}
			animationType="slide"
			presentationStyle="pageSheet"
		>
			<SafeAreaView style={styles.container}>
				<View style={styles.header}>
					<TouchableOpacity onPress={onClose} style={styles.closeButton} activeOpacity={0.8}>
						<Ionicons name="close" size={22} color={colors.textSecondary} />
					</TouchableOpacity>
					<Text style={styles.headerTitle}>{text.day} {dayIndex + 1}</Text>
					<View style={styles.headerSpacer} />
				</View>

				<ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
					{!!dayData.image && (
						<Image
							source={{ uri: dayData.image }}
							style={styles.image}
							resizeMode="cover"
						/>
					)}

					<View style={styles.descriptionContainer}>
						<Text style={styles.label}>{text.dayStory}</Text>
						<Text style={styles.description}>
							{dayData.description || text.noDayDescription}
						</Text>
					</View>

					<View style={styles.stopsContainer}>
						<Text style={styles.label}>{text.stops}</Text>
						{stops.length > 0 ? (
							stops.map((stop, index) => (
								<TouchableOpacity
									key={stop.id || `${stop.title}:${index}`}
									style={styles.stopRow}
									activeOpacity={0.85}
									onPress={() => openStop(stop)}
								>
									{stop.image ? (
										<Image source={{ uri: stop.image }} style={styles.stopImage} />
									) : (
										<View style={styles.stopNumberBadge}>
											<Text style={styles.stopNumberText}>{index + 1}</Text>
										</View>
									)}

									<View style={styles.stopTextWrap}>
										<Text style={styles.stopTitle} numberOfLines={1}>
											{stop.title}
										</Text>
										{!!stop.description && (
											<Text style={styles.stopDescription} numberOfLines={3}>
												{stop.description}
											</Text>
										)}
										<Text style={styles.stopAddress} numberOfLines={2}>
											{stop.place?.address || stop.location || stop.place?.name}
										</Text>
									</View>

									<View style={styles.mapIconWrap}>
										<Ionicons name="map-outline" size={18} color={colors.primary} />
										<Text style={styles.mapIconText}>{text.maps}</Text>
									</View>
								</TouchableOpacity>
							))
						) : (
							<Text style={styles.emptyStopsText}>{text.noStops}</Text>
						)}
					</View>
				</ScrollView>
			</SafeAreaView>
		</Modal>
	);
}
