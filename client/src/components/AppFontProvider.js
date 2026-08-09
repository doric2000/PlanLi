import { createContext, useEffect } from "react";
import { Assistant_400Regular } from "@expo-google-fonts/assistant/400Regular";
import { Assistant_500Medium } from "@expo-google-fonts/assistant/500Medium";
import { Assistant_600SemiBold } from "@expo-google-fonts/assistant/600SemiBold";
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
