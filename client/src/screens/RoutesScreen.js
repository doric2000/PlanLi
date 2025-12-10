import { useEffect, useState } from "react";
import {
	View,
	Text,
	StyleSheet,
	ActivityIndicator,
	FlatList,
	RefreshControl,
	TouchableOpacity,
	Image,
	ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "../config/firebase";
import { useRefresh } from "../hooks/useRefresh";
import { SafeAreaView } from "react-native-safe-area-context";
import PlacesRoute from "../components/PlacesRoute";
import { LinearGradient } from "expo-linear-gradient"; // <-- ADD THIS IMPORT
import { Alert } from "react-native";

const RenderTags = ({ tags }) => {
	const MAX_VISIBLE = 3;
	const [showAll, setShowAll] = useState(false);

	const visibleTags = showAll ? tags : tags.slice(0, MAX_VISIBLE);
	const hasMore = tags.length > MAX_VISIBLE;

	return (
		<View style={tagStyle.tagsWrapper}>
			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				style={tagStyle.tagsContainer}
			>
				{visibleTags.map((tag, idx) => (
					<View key={idx} style={tagStyle.tagItem}>
						<Text style={tagStyle.tagText}>#{tag}</Text>
					</View>
				))}
				{!showAll && hasMore && (
					<Text style={tagStyle.moreText}>
						+{tags.length - MAX_VISIBLE}
					</Text>
				)}
			</ScrollView>
		</View>
	);
};

const RenderRouteCard = (item, onPress) => {
	let displayUser = "Unknown";
	let userPhoto = null;
	if (item.user) {
		if (typeof item.user === "object") {
			displayUser =
				item.user.displayName || item.user.email || "Anonymous";
			userPhoto = item.user.photoURL;
		} else {
			displayUser = item.user;
		}
	}

	return (
		<TouchableOpacity onPress={onPress} activeOpacity={0.7}>
			<View style={routeCardStyles.card}>
				<Text style={routeCardStyles.cardTitle}>{item.Title}</Text>
				<View style={routeCardStyles.userContainer}>
					{userPhoto ? (
						<Image
							source={{ uri: userPhoto }}
							style={routeCardStyles.profilePic}
						/>
					) : (
						<View style={routeCardStyles.profilePicPlaceholder}>
							<Ionicons name='person' size={16} color='#94A3B8' />
						</View>
					)}
					<Text style={routeCardStyles.cardMeta}>
						by {displayUser}
					</Text>
				</View>
				<Text style={routeCardStyles.cardDescription}>{item.desc}</Text>
				<Text style={routeCardStyles.cardBody}>
					<Ionicons
						name='calendar-outline'
						size={16}
						color='#64748B'
					/>{" "}
					{item.days} days |{" "}
					<Ionicons
						name='navigate-outline'
						size={16}
						color='#64748B'
					/>{" "}
					{item.distance} km |
				</Text>

				<PlacesRoute places={item.places} />

				{item.tags && item.tags.length > 0 && (
					<RenderTags tags={item.tags} />
				)}
			</View>
		</TouchableOpacity>
	);
};

const GenerateTripPlaceholder = ({ onPress }) => (
	<TouchableOpacity
		onPress={onPress}
		activeOpacity={0.8}
		style={{ marginBottom: 16 }}
	>
		<LinearGradient
			colors={["#c332d4ff", "#648edbff", "#af8be1ff"]}
			start={{ x: 0, y: 0 }}
			end={{ x: 1, y: 1 }}
			style={generateTripStyles.card}
		>
			<Ionicons
				name='navigate'
				size={48}
				color='#ffffffff'
				style={generateTripStyles.icon}
			/>
			<Text style={generateTripStyles.title}>Trip Generator</Text>
			<Text style={generateTripStyles.subtitle}>
				Click here to generate your future route
			</Text>
		</LinearGradient>
	</TouchableOpacity>
);

const handleGenerateTrip = () => {
	// Placeholder for future functionality
	Alert.alert("Generate trip feature coming soon!");
};

export default function RoutesScreen({ navigation }) {
	const [routes, setRoutes] = useState([]);
	const [loading, setLoading] = useState(true);

	const fetchRoutes = async () => {
		try {
			const q = query(
				collection(db, "routes"),
				orderBy("createdAt", "desc")
			);
			const snap = await getDocs(q);
			const data = snap.docs.map((doc) => ({
				id: doc.id,
				...doc.data(),
			}));
			setRoutes(data);
		} catch (err) {
			console.log("Failed to load routes", err);
		}
	};

	const { isRefreshing, onRefresh } = useRefresh(fetchRoutes);

	useEffect(() => {
		const init = async () => {
			await fetchRoutes();
			setLoading(false);
		};
		init();
	}, []);

	const renderItem = ({ item }) => {
		return RenderRouteCard(item, () => {
			navigation.navigate("RouteDetail", { routeData: item });
		});
	};

	return (
		<SafeAreaView style={styles.container}>
			<View style={styles.header}>
				<Text style={styles.headerTitle}>מסלולים</Text>
				<Text style={styles.headerSubTitle}>
					המסלולים הכי שווים, ישר מהשטח
				</Text>
			</View>

			{loading ? (
				<ActivityIndicator style={{ marginTop: 20 }} />
			) : (
				<FlatList
					contentContainerStyle={{ padding: 15 }}
					data={routes}
					keyExtractor={(item) => item.id}
					renderItem={renderItem}
					ListHeaderComponent={
						<GenerateTripPlaceholder onPress={handleGenerateTrip} />
					}
					refreshControl={
						<RefreshControl
							refreshing={isRefreshing}
							onRefresh={onRefresh}
							colors={["#1E3A5F"]}
							tintColor='#1E3A5F'
						/>
					}
					ListEmptyComponent={
						<Text style={{ textAlign: "center", marginTop: 20 }}>
							No routes yet.
						</Text>
					}
				/>
			)}

			<TouchableOpacity
				style={addIconStyle.fab}
				onPress={() => navigation.navigate("AddRoutesScreen")}
			>
				<Ionicons name='add' size={32} color='#fff' />
			</TouchableOpacity>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1, justifyContent: "flex-start", alignItems: "center" },
	headerTitle: {
		fontSize: 22,
		fontWeight: "bold",
		color: "#fff",
		textAlign: "center",
	},
	popularCard: {
		width: "48%",
		backgroundColor: "#fff",
		borderRadius: 12,
		marginBottom: 15,
		overflow: "hidden",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.1,
		shadowRadius: 2,
		elevation: 2,
	},
	header: {
		backgroundColor: "#49bc8eff",
		padding: 20,
		paddingBottom: 5,
		borderBottomLeftRadius: 0,
		borderBottomRightRadius: 0,
		width: "100%",
	},
	headerSubTitle: {
		fontSize: 16,
		fontWeight: "400",
		color: "#fff",
		textAlign: "center",
		marginBottom: 20,
	},
});

const tagStyle = StyleSheet.create({
	tagsContainer: {
		flexDirection: "row",
		// flexWrap: "wrap",
		gap: 10,
		marginTop: 10,
	},
	tagItem: {
		paddingVertical: 6,
		paddingHorizontal: 16,
		borderRadius: 999,
		borderWidth: 1,
		borderColor: "#E5E7EB",
		backgroundColor: "#fff",
		marginRight: 0,
	},
	tagText: {
		fontSize: 12,
		color: "#111827",
		fontWeight: "500",
	},
	tagItemSelected: { backgroundColor: "#E0F2FE", borderColor: "#0284C7" },
	tagTextSelected: { color: "#0284C7", fontWeight: "600" },
	moreText: {
		fontSize: 11,
		color: "#0284C7",
		fontWeight: "600",
	},
});

const addIconStyle = StyleSheet.create({
	fab: {
		position: "absolute",
		bottom: 20,
		right: 20,
		width: 60,
		height: 60,
		borderRadius: 30,
		backgroundColor: "#FF9F1C",
		justifyContent: "center",
		alignItems: "center",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.3,
		shadowRadius: 4.65,
		elevation: 8,
	},
});

const buttonStyles = StyleSheet.create({
	submitButton: {
		backgroundColor: "#1E3A5F",
		padding: 16,
		borderRadius: 10,
		alignItems: "center",
		marginTop: 10,
		marginBottom: 20,
	},
	submitButtonText: {
		color: "#fff",
		fontSize: 18,
		fontWeight: "bold",
	},
});

const routeCardStyles = StyleSheet.create({
	card: {
		width: "100%",
		backgroundColor: "#fff",
		borderRadius: 15,
		padding: 10,
		marginBottom: 10,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.1,
		shadowRadius: 6,
		elevation: 5,
	},
	cardHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 10,
	},
	cardTitle: {
		fontSize: 20,
		fontWeight: "700",
		color: "#0f172a",
	},
	cardMeta: {
		fontSize: 14,
		color: "#475467",
	},
	cardBody: {
		fontSize: 16,
		color: "#1f2937",
		marginBottom: 12,
		lineHeight: 22,
	},
	cardFooter: {
		flexDirection: "row",
		gap: 12,
		alignItems: "center",
	},
	tag: {
		paddingVertical: 4,
		paddingHorizontal: 12,
		borderRadius: 999,
		backgroundColor: "#E0F2FE",
		color: "#0284C7",
		fontWeight: "600",
	},
	cardDescription: {
		fontSize: 15,
		color: "#222",
		marginVertical: 15,
	},
	userContainer: {
		flexDirection: "row",
		alignItems: "center",
		marginBottom: 5,
		gap: 8,
	},
	profilePic: {
		width: 24,
		height: 24,
		borderRadius: 12,
		backgroundColor: "#E2E8F0",
	},
	profilePicPlaceholder: {
		width: 24,
		height: 24,
		borderRadius: 12,
		backgroundColor: "#E2E8F0",
		alignItems: "center",
		justifyContent: "center",
	},
});

const generateTripStyles = StyleSheet.create({
	card: {
		width: "100%",
		borderRadius: 20,
		padding: 20,
		alignItems: "center",
		justifyContent: "center",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.1,
		shadowRadius: 6,
		elevation: 5,
		minHeight: 180,
	},
	icon: {
		marginBottom: 16,
		opacity: 0.8,
	},
	title: {
		fontSize: 20,
		fontWeight: "700",
		color: "#ffffffff",
		textAlign: "center",
		marginBottom: 8,
	},
	subtitle: {
		fontSize: 15,
		color: "#f0f0f0ff",
		textAlign: "center",
		fontWeight: "400",
	},
});

export { RenderRouteCard, tagStyle, styles, buttonStyles };
