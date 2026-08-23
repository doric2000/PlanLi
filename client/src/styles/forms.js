import { fontFamilies } from "./typography";
import { Dimensions } from 'react-native';

const { width } = Dimensions.get('window');

export const forms = {
	inputWrapper: {
		marginBottom: 14,
	},

	label: {
		fontSize: 14,
		color: "#111827",
		marginBottom: 4,
		fontFamily: fontFamilies.medium,
	},

	input: {
		backgroundColor: "#F8FAFC",
		paddingHorizontal: 12,
		paddingVertical: 12,
		borderRadius: 12,
		borderWidth: 1,
		borderColor: "#E5E7EB",
		fontSize: 15,
		color: "#111827",
	},

	inputMultiline: {
		minHeight: 110,
		textAlignVertical: "top",
		paddingTop: 12,
	},

	inputError: {
		borderColor: "#EF4444",
		backgroundColor: "#FEE2E2",
	},

	errorText: {
		color: "#EF4444",
		fontSize: 12,
		marginTop: 4,
	},

	placeholder: "#9CA3AF",

	// Auth form styles
	authContainer: {
		flex: 1,
	},
	authSafeArea: {
		flex: 1,
	},
	authKeyboardView: {
		flex: 1,
	},
	authScrollContent: {
		flexGrow: 1,
		padding: 20,
		justifyContent: 'center',
	},
	authCard: {
		backgroundColor: '#FFFFFF',
		borderRadius: 24,
		padding: 24,
		width: '100%',
		shadowColor: '#000000',
		shadowOffset: { width: 0, height: 8 },
		shadowOpacity: 0.12,
		shadowRadius: 12,
		elevation: 8,
		overflow: 'hidden',
	},
	authCardDecoration: {
		position: 'absolute',
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		alignItems: 'center',
		justifyContent: 'center',
		zIndex: 10,
	},
	authCardLogo: {
		width: width * 1.0,
		height: width * 1.0,
		opacity: 0.2,
		tintColor: '#9CA3AF',
		transform: [{ rotate: '-15deg' }],
	},
	authHeader: {
		alignItems: 'center',
		marginBottom: 32,
	},
	authLogoContainer: {
		marginBottom: 16,
		shadowColor: '#1E3A8A',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.15,
		shadowRadius: 12,
		elevation: 8,
		backgroundColor: '#fff',
		borderRadius: 25,
		padding: 4,
	},
	authLogo: {
		width: 120,
		height: 120,
		borderRadius: 20,
	},
	authTitle: {
		fontSize: 28,
		fontFamily: fontFamilies.medium,
		color: '#1E3A8A',
		marginBottom: 8,
		letterSpacing: 0.5,
	},
	authSubtitle: {
		fontSize: 14,
		fontFamily: fontFamilies.medium,
		color: '#6B7280',
		letterSpacing: 0.2,
	},
	authForm: {
		width: '100%',
	},
	authInputContainer: {
		marginBottom: 20,
	},
	authInputLabel: {
		fontSize: 14,
		fontFamily: fontFamilies.medium,
		color: '#4B5563',
		marginBottom: 8,
		marginLeft: 4,
	},
	authInputWrapper: {
		flexDirection: 'row',
		alignItems: 'center',
		backgroundColor: '#F8FAFC',
		borderWidth: 1,
		borderColor: '#E5E7EB',
		borderRadius: 14,
		paddingHorizontal: 16,
	},
	authInputIcon: {
		marginRight: 12,
	},
	authInput: {
		flex: 1,
		paddingVertical: 14,
		fontSize: 15,
		color: '#111827',
	},
	authEyeIcon: {
		marginLeft: 8,
	},
	authForgotPassword: {
		alignItems: 'flex-end',
		marginBottom: 28,
	},
	authForgotPasswordText: {
		color: '#2563EB',
		fontSize: 13,
		fontFamily: fontFamilies.medium,
	},
	authErrorText: {
		color: '#EF4444',
		textAlign: 'center',
		marginBottom: 16,
		fontSize: 13,
	},
	authButton: {
		borderRadius: 14,
		paddingVertical: 16,
		alignItems: 'center',
		marginBottom: 24,
		shadowColor: '#2563EB',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.25,
		shadowRadius: 8,
		elevation: 4,
	},
	authButtonText: {
		color: '#FFFFFF',
		fontSize: 16,
		fontFamily: fontFamilies.medium,
		letterSpacing: 0.5,
	},
	authDividerContainer: {
		flexDirection: 'row',
		alignItems: 'center',
		marginBottom: 24,
	},
	authDivider: {
		flex: 1,
		height: 1,
		backgroundColor: '#E5E7EB',
	},
	authDividerText: {
		marginHorizontal: 16,
		color: '#9CA3AF',
		fontSize: 13,
	},
	authSocialContainer: {
		width: '100%',
		direction: 'ltr',
		flexDirection: 'row',
		justifyContent: 'center',
		alignItems: 'center',
		gap: 16,
		marginBottom: 0,
	},
	authProviderIconSlot: {
		width: 48,
		height: 48,
		borderRadius: 24,
		alignItems: 'center',
		justifyContent: 'center',
		overflow: 'hidden',
		backgroundColor: '#FFFFFF',
		shadowColor: '#102A43',
		shadowOffset: { width: 0, height: 3 },
		shadowOpacity: 0.12,
		shadowRadius: 8,
		elevation: 3,
	},
	authGoogleIconButton: {
		width: 48,
		height: 48,
	},
	authAppleIcon: {
		width: 44,
		height: 44,
		borderRadius: 22,
	},
	authProviderIconPressed: {
		opacity: 0.72,
		transform: [{ scale: 0.97 }],
	},
	authProviderLoadingOverlay: {
		position: 'absolute',
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: 'rgba(255, 255, 255, 0.88)',
	},
	authFooter: {
		alignItems: 'center',
	},
	authFooterText: {
		fontSize: 12,
		fontFamily: fontFamilies.medium,
		color: '#6B7280',
		textAlign: 'center',
	},
	authLinkContainer: {
		flexDirection: 'row',
		marginTop: 8,
		alignItems: 'center',
	},
	authLinkText: {
		fontSize: 14,
		color: '#6B7280',
	},
	authLink: {
		fontSize: 14,
		color: '#1E3A8A',
		fontFamily: fontFamilies.medium,
	},
	authTermsContainer: {
		marginVertical: 16,
		alignItems: 'center',
	},
	authTermsText: {
		fontSize: 12,
		fontFamily: fontFamilies.medium,
		color: '#6B7280',
		textAlign: 'center',
		lineHeight: 18,
	},
	authTermsLink: {
		color: '#3B82F6',
		fontFamily: fontFamilies.medium,
	},
};
