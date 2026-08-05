import React from "react";
import { View, Text, TextInput } from "react-native";
import { forms } from "../styles";

/**
 * FormInput - A reusable text input component with label and error support.
 * 
 * This component provides a consistent input field design across the app,
 * with support for labels, error messages, and multiline text.
 * 
 * USE THIS COMPONENT for any form field where the user needs to enter text,
 * such as titles, descriptions, names, etc.
 * 
 * @param {string} label - Text label shown above the input (optional)
 * @param {string} value - Current value of the input
 * @param {function} onChangeText - Function called when text changes
 * @param {string} placeholder - Placeholder text when input is empty
 * @param {string} keyboardType - Keyboard type: 'default', 'email-address', 'numeric', etc.
 * @param {boolean} multiline - If true, allows multiple lines (for descriptions)
 * @param {Object} style - Additional custom styles (optional)
 * @param {string} error - Error message to display below input (optional)
 * 
 * @example
 * // Simple input
 * <FormInput
 *   label="Title"
 *   value={title}
 *   onChangeText={setTitle}
 *   placeholder="Enter title..."
 * />
 * 
 * // Multiline description with error
 * <FormInput
 *   label="Description"
 *   value={description}
 *   onChangeText={setDescription}
 *   multiline={true}
 *   error={descriptionError}
 * />
 */
export const FormInput = ({
	label,
	value,
	onChangeText,
	placeholder,
	keyboardType = "default",
	multiline = false,
	style,
	error,
	helperText,
	required = false,
	rtl = false,
	containerStyle,
	inputRef,
	...props
}) => (
	<View style={[forms.inputWrapper, containerStyle]}>
		{label && (
			<Text style={[forms.label, rtl && { textAlign: "right", writingDirection: "rtl" }]}>
				{label}{required ? " (חובה)" : ""}
			</Text>
		)}
		{helperText && (
			<Text style={{ color: "#6B7280", fontSize: 12, marginBottom: 6, textAlign: rtl ? "right" : undefined, writingDirection: rtl ? "rtl" : undefined }}>
				{helperText}
			</Text>
		)}
		<TextInput
			ref={inputRef}
			style={[
				forms.input,
				multiline && forms.inputMultiline,
				error && forms.inputError,
				rtl && { textAlign: "right", writingDirection: "rtl" },
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
		{error && (
			<Text
				style={[forms.errorText, rtl && { textAlign: "right", writingDirection: "rtl" }]}
				accessibilityLiveRegion="polite"
			>
				{error}
			</Text>
		)}
	</View>
);
