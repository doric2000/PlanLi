import { View, Text } from "react-native";
import { common } from "../../../styles/common";
import { typography } from "../../../styles";

export default function FavoritesScreen() {
	return (
		<View style={common.container}>
			<Text style={{ fontSize: typography.h1 }}>Your Favorites, Coming Soon!</Text>
			{/* Add your favorite routes list here */}
		</View>
	);
}
