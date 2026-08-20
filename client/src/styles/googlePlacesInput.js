import { fontFamilies } from "./typography";
import { StyleSheet } from 'react-native';
import { colors } from './colors';
import { shadows } from './shadows';
import { spacing } from './spacing';

const SEARCH_BAR_HEIGHT = 30;

export const googlePlacesInput = StyleSheet.create({
	container: {
		position: 'relative',
		zIndex: 10000,
		width: '100%',
	},
	inputWrapper: {
		position: 'relative',
		width: '100%',
		height: SEARCH_BAR_HEIGHT,
		backgroundColor: 'transparent',
	},
	explicitInputWrapper: {
		height: 48,
	},
	searchIcon: {
		position: 'absolute',
		right: spacing.lg,
		top: (SEARCH_BAR_HEIGHT - 20) / 2,
		zIndex: 1,
		marginLeft: spacing.md,
	},
	input: {
		flex: 1,
		height: '100%',
		color: colors.textPrimary,
		textAlign: 'right',
		writingDirection: 'rtl',
		paddingRight: spacing.xxxl + spacing.md,
	},
	explicitInput: {
		paddingRight: 92,
	},
	explicitSearchButton: {
		position: 'absolute',
		right: spacing.sm,
		top: 3,
		bottom: 3,
		zIndex: 2,
		minWidth: 76,
		paddingHorizontal: spacing.sm,
		borderRadius: spacing.radiusSmall,
		backgroundColor: colors.primary,
		flexDirection: 'row-reverse',
		alignItems: 'center',
		justifyContent: 'center',
		gap: 4,
	},
	explicitSearchButtonText: {
		color: colors.white,
		fontSize: 12,
		fontFamily: fontFamilies.semiBold,
	},
	explicitSearchButtonDisabled: {
		opacity: 0.5,
	},
	loader: {
		position: 'absolute',
		left: spacing.lg,
		top: (SEARCH_BAR_HEIGHT - 14) / 2,
	},
	explicitLoader: {
		top: 17,
	},
	listContainer: {
		position: 'absolute',
		top: SEARCH_BAR_HEIGHT + spacing.sm,
		left: 0,
		right: 0,
		zIndex: 10001,
		elevation: 10001,
		backgroundColor: colors.white,
		borderRadius: spacing.radiusSmall,
		borderWidth: 1,
		borderColor: colors.borderLight,
		...shadows.small,
		maxHeight: 200,
	},
	explicitListContainer: {
		top: 48 + spacing.sm,
	},
	dropdownStatusRow: {
		flexDirection: 'row-reverse',
		alignItems: 'center',
		justifyContent: 'center',
		padding: spacing.md,
		gap: spacing.sm,
	},
	dropdownStatusText: {
		fontSize: 14,
		color: colors.textSecondary,
		textAlign: 'right',
	},
	googleAttribution: {
		fontSize: 14,
		fontFamily: fontFamilies.regular,
		color: '#5E5E5E',
		textAlign: 'center',
	},
	groupTitle: {
		paddingHorizontal: spacing.md,
		paddingTop: spacing.md,
		paddingBottom: spacing.sm,
		fontSize: 12,
		fontFamily: fontFamilies.semiBold,
		color: colors.textSecondary,
		textAlign: 'right',
		writingDirection: 'rtl',
	},
	listItem: {
		flexDirection: 'row-reverse',
		alignItems: 'center',
		padding: spacing.md,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
	},
	locationIcon: {
		marginLeft: spacing.sm,
	},
	listText: {
		flex: 1,
		fontSize: 14,
		color: colors.textPrimary,
		textAlign: 'right',
		writingDirection: 'rtl',
	},
	mainText: {
		fontSize: 14,
		fontFamily: fontFamilies.semiBold,
		color: colors.textPrimary,
		textAlign: 'right',
		writingDirection: 'rtl',
	},
	subText: {
		marginTop: 2,
		fontSize: 12,
		color: colors.textSecondary,
		textAlign: 'right',
		writingDirection: 'rtl',
	},
	fallbackContainer: {
		marginTop: spacing.sm,
		alignItems: 'flex-end',
	},
	fallbackButton: {
		alignSelf: 'flex-end',
	},
	fallbackButtonText: {
		textAlign: 'center',
	},
});
