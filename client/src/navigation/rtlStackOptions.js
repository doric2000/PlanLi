import { Platform } from "react-native";
import { CardStyleInterpolators } from "@react-navigation/stack";

const iosRtlBackGesture = {
	gestureDirection: "horizontal-inverted",
};

export const rtlStackScreenOptions = {
	headerShown: false,
	...(Platform.OS === "ios" ? iosRtlBackGesture : null),
};

export const rtlModalScreenOptions = {
	presentation: "modal",
	...(Platform.OS === "ios"
		? {
			...iosRtlBackGesture,
			cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
		}
		: null),
};
