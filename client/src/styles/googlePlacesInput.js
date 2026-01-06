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
	},
	searchIcon: {
		position: 'absolute',
		right: spacing.lg,
		top: (SEARCH_BAR_HEIGHT - 20) / 2,
		zIndex: 1,
	},
	input: {
		flex: 1,
		height: '100%',
		color: colors.textPrimary,
		textAlign: 'right',
		paddingRight: spacing.xxxl,
	},
	loader: {
		position: 'absolute',
		left: spacing.lg,
		top: (SEARCH_BAR_HEIGHT - 14) / 2,
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
	listItem: {
		flexDirection: 'row',
		alignItems: 'center',
		padding: spacing.md,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
	},
	locationIcon: {
		marginRight: spacing.sm,
	},
	listText: {
		fontSize: 14,
		color: colors.textPrimary,
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
