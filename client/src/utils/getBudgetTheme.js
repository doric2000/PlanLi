// Budget theme mapping for Israeli-style colors (ILS)
// Used for recommendation budget selector + budget chip display.

export const getBudgetTheme = (budget) => {
	const value = String(budget || '').trim();

	// Defaults (neutral)
	const fallback = {
		backgroundColor: '#F3F4F6',
		borderColor: '#E5E7EB',
		textColor: '#111827',
	};

	if (!value) return fallback;

	switch (value) {
		// 5₪ coin-ish silver
		case 'חינמי':
		case 'free':
			return {
				backgroundColor: '#E5E7EB',
				borderColor: '#9CA3AF',
				textColor: '#111827',
			};

		// 20₪ bill-ish soft pink/red (not too aggressive)
		case '₪':
			return {
				backgroundColor: '#F5A3B7',
				borderColor: '#E46A8C',
				textColor: '#FFFFFF',
			};

		// 50₪ bill green
		case '₪₪':
			return {
				backgroundColor: '#34D399',
				borderColor: '#059669',
				textColor: '#FFFFFF',
			};

		// 100₪ bill gold/yellow
		case '₪₪₪':
			return {
				backgroundColor: '#FBBF24',
				borderColor: '#D97706',
				textColor: '#111827',
			};

		// 200₪ bill blue
		case '₪₪₪₪':
			return {
				backgroundColor: '#60A5FA',
				borderColor: '#2563EB',
				textColor: '#FFFFFF',
			};

		default:
			return fallback;
	}
};
