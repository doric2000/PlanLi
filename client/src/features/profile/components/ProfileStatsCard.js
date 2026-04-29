import React from "react";
import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { colors, cards, typography } from "../../../styles";

const statsConfig = [
	{ key: "reviews", label: "המלצות", icon: "thumbs-up-outline" },
	{ key: "trips", label: "מסלולים", icon: "map-outline" },
	{ key: "likesReceived", label: "לייקים", icon: "heart-outline" },
];

export default function ProfileStatsCard({ stats }) {
	return (
		<View style={cards.profileStats}>
			{statsConfig.map((item, index) => (
				<React.Fragment key={item.key}>
					<View style={cards.profileStatItem}>
						<Ionicons name={item.icon} size={18} color={colors.primary} />
						<Text style={typography.profileStatNumber}>{stats?.[item.key] || 0}</Text>
						<Text style={typography.profileStatLabel}>{item.label}</Text>
					</View>
					{index < statsConfig.length - 1 ? <View style={cards.profileStatDivider} /> : null}
				</React.Fragment>
			))}
		</View>
	);
}
