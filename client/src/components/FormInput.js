import React from "react";
import { View, Text, TextInput } from "react-native";
import { forms } from "../styles";

export const FormInput = ({
	label,
	value,
	onChangeText,
	placeholder,
	keyboardType = "default",
	multiline = false,
	style,
	error,
	...props
}) => (
	<View style={forms.inputWrapper}>
		{label && <Text style={forms.label}>{label}</Text>}
		<TextInput
			style={[
				forms.input,
				multiline && forms.inputMultiline,
				error && forms.inputError,
				style,
			]}
			placeholder={placeholder}
			placeholderTextColor={forms.placeholder}
			value={value}
			onChangeText={onChangeText}
			keyboardType={keyboardType}
			multiline={multiline}
			{...props}
		/>
		{error && <Text style={forms.errorText}>{error}</Text>}
	</View>
);
