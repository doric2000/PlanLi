import React from "react";
import { Modal, SafeAreaView, ScrollView, TouchableOpacity, View } from "react-native";
import AppText from "../../../components/AppText";
import { Ionicons } from "@expo/vector-icons";

import CachedImage from "../../../components/CachedImage";
import { colors, dayViewModalStyles as styles } from "../../../styles";
import { getMediaVariantUrl } from "../../../utils/mediaAssets";
import { buildGoogleMapsPlaceUrl } from "../utils/routeStops";
import { openSafeExternalUrl } from "../../../utils/safeExternalUrl";

const text = {
	day: "\u05d9\u05d5\u05dd",
	dayStory: "\u05e1\u05d9\u05e4\u05d5\u05e8 \u05d4\u05d9\u05d5\u05dd",
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
		openSafeExternalUrl(url, 'googleMaps').catch(() => {});
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
					<AppText style={styles.headerTitle}>{text.day} {dayIndex + 1}</AppText>
					<View style={styles.headerSpacer} />
				</View>

				<ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
					{!!(dayData.image || dayData.media) && (
						<CachedImage
							source={{
								uri: getMediaVariantUrl(
									dayData.media,
									"large",
									dayData.image
								),
							}}
							style={styles.image}
							contentFit="cover"
							priority="high"
						/>
					)}

					{!!dayData.description && <View style={styles.descriptionContainer}>
						<AppText style={styles.label}>{text.dayStory}</AppText>
						<AppText style={styles.description}>
							{dayData.description}
						</AppText>
					</View>}

					<View style={styles.stopsContainer}>
						<AppText style={styles.label}>{text.stops}</AppText>
						{stops.length > 0 ? (
							stops.map((stop, index) => (
								<TouchableOpacity
									key={stop.id || `${stop.title}:${index}`}
									style={styles.stopRow}
									activeOpacity={0.85}
									onPress={() => openStop(stop)}
								>
									{stop.image || stop.media ? (
										<CachedImage
											source={{
												uri: getMediaVariantUrl(
													stop.media,
													"thumb",
													stop.image
												),
											}}
											style={styles.stopImage}
											contentFit="cover"
											priority="low"
										/>
									) : (
										<View style={styles.stopNumberBadge}>
											<AppText style={styles.stopNumberText}>{index + 1}</AppText>
										</View>
									)}

									<View style={styles.stopTextWrap}>
										<AppText style={styles.stopTitle} numberOfLines={1}>
											{stop.title}
										</AppText>
										{!!stop.description && (
											<AppText style={styles.stopDescription} numberOfLines={3}>
												{stop.description}
											</AppText>
										)}
										<AppText style={styles.stopAddress} numberOfLines={2}>
											{stop.place?.address || stop.location || stop.place?.name}
										</AppText>
									</View>

									<View style={styles.mapIconWrap}>
										<Ionicons name="map-outline" size={18} color={colors.primary} />
										<AppText style={styles.mapIconText}>{text.maps}</AppText>
									</View>
								</TouchableOpacity>
							))
						) : (
							<AppText style={styles.emptyStopsText}>{text.noStops}</AppText>
						)}
					</View>
				</ScrollView>
			</SafeAreaView>
		</Modal>
	);
}
