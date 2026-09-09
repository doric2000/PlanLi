import { createContext, useEffect } from "react";
import { Assistant_400Regular } from "@expo-google-fonts/assistant/400Regular";
import { Assistant_500Medium } from "@expo-google-fonts/assistant/500Medium";
import { Assistant_600SemiBold } from "@expo-google-fonts/assistant/600SemiBold";
import { Assistant_700Bold } from "@expo-google-fonts/assistant/700Bold";
import { Assistant_800ExtraBold } from "@expo-google-fonts/assistant/800ExtraBold";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";

export const AppFontContext = createContext(true);

SplashScreen.preventAutoHideAsync().catch(() => {
	// The splash screen may already be hidden in tests or on web.
});

export default function AppFontProvider({ children }) {
	const [fontsLoaded, fontError] = useFonts({
		Assistant_400Regular,
		Assistant_500Medium,
		Assistant_600SemiBold,
		Assistant_700Bold,
		Assistant_800ExtraBold,
	});

	const ready = fontsLoaded || Boolean(fontError);

	useEffect(() => {
		if (ready) {
			SplashScreen.hideAsync().catch(() => {});
		}
	}, [ready]);

	if (!ready) {
		return null;
	}

	return (
		<AppFontContext.Provider value={fontsLoaded}>
			{children}
		</AppFontContext.Provider>
	);
}
