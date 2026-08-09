import { forwardRef, useContext } from "react";
import { Text } from "react-native";

import { fontFamilies } from "../styles/typography";
import { AppFontContext } from "./AppFontProvider";

const AppText = forwardRef(function AppText(
	{ style, weight = "regular", ...props },
	ref,
) {
	const fontsLoaded = useContext(AppFontContext);
	const fontFamily = fontsLoaded ? fontFamilies[weight] || fontFamilies.regular : undefined;

	return <Text ref={ref} style={[fontFamily ? { fontFamily } : null, style]} {...props} />;
});

export default AppText;
