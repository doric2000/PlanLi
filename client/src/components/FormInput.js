import React from "react";
import { View, Text, TextInput, StyleSheet } from "react-native";

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
	<View style={styles.inputWrapper}>
		{label && <Text style={styles.label}>{label}</Text>}
		<TextInput
			style={[
				styles.input,
				multiline && styles.inputMultiline,
				error && styles.inputError,
				style,
			]}
			placeholder={placeholder}
			placeholderTextColor='#9CA3AF'
			value={value}
			onChangeText={onChangeText}
			keyboardType={keyboardType}
			multiline={multiline}
			{...props}
		/>
		{error && <Text style={styles.errorText}>{error}</Text>}
	</View>
);

const styles = StyleSheet.create({
	inputWrapper: {
		marginBottom: 14,
	},
	label: {
		fontSize: 14,
		color: "#334155",
		marginBottom: 6,
		fontWeight: "600",
	},
	input: {
		backgroundColor: "#F8FAFC",
		paddingHorizontal: 14,
		paddingVertical: 12,
		borderRadius: 12,
		borderWidth: 1,
		borderColor: "#E2E8F0",
		fontSize: 15,
		color: "#000000",
	},
	inputMultiline: {
		minHeight: 110,
		textAlignVertical: "top",
	},
	inputError: {
		borderColor: "#DC2626",
		backgroundColor: "#FEF2F2",
	},
	errorText: {
		color: "#DC2626",
		fontSize: 12,
		marginTop: 4,
	},
});
