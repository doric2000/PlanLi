import { StyleSheet } from 'react-native';
import { colors } from './colors';
import { shadows } from './shadows';
import { spacing } from './spacing';

const SEARCH_BAR_HEIGHT = 30;

export const googlePlacesInput = StyleSheet.create({
	container: {
		zIndex: 100,
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
		backgroundColor: colors.white,
		borderRadius: spacing.radiusSmall,
		borderWidth: 1,
		borderColor: colors.borderLight,
		...shadows.small,
		maxHeight: 200,
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
});
