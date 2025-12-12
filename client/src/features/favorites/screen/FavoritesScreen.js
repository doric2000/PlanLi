import { View, Text, Alert } from "react-native";
import { common } from "../../../styles/common";
import { typography } from "../../../styles/index";
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useState } from "react"; // Add useEffect

export default function FavoritesScreen({navigation}) {

	useEffect(()=>
			Alert.alert("Comming Soon!","This feature is not ready yet.",[{text: "OK", onPress: () => {navigation.navigate("Home");}}]));
	
	return (
	<SafeAreaView style={common.container}>
		<View style={common.container}>
			<Text style={{textAlign:'center', fontSize:16}}>Your Favorites, Coming Soon!</Text>
		</View>
	</SafeAreaView>
	);
}
