import { forwardRef, useContext } from "react";
import { TextInput } from "react-native";

import { fontFamilies } from "../styles/typography";
import { AppFontContext } from "./AppFontProvider";

const AppTextInput = forwardRef(function AppTextInput(
	{ style, weight = "regular", ...props },
	ref,
) {
	const fontsLoaded = useContext(AppFontContext);
	const fontFamily = fontsLoaded ? fontFamilies[weight] || fontFamilies.regular : undefined;

	return (
		<TextInput
			ref={ref}
			style={[fontFamily ? { fontFamily } : null, style]}
			{...props}
		/>
	);
});

export default AppTextInput;
