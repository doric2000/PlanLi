import { useCallback, useMemo, useState } from "react";
import { useWindowDimensions } from "react-native";

const MIN_CAROUSEL_SIZE = 1;

const positiveNumberOrNull = (value) => {
	const number = Number(value);
	return Number.isFinite(number) && number > 0 ? number : null;
};

export function getStableCarouselDimensions({
	measuredWidth,
	fallbackWidth,
	aspectRatio,
	extraHeight = 0,
}) {
	const width =
		positiveNumberOrNull(measuredWidth) ??
		positiveNumberOrNull(fallbackWidth) ??
		MIN_CAROUSEL_SIZE;
	const ratio = positiveNumberOrNull(aspectRatio) ?? 1;
	const inset = positiveNumberOrNull(extraHeight) ?? 0;

	return {
		pageWidth: width,
		frameHeight: width / ratio + inset,
	};
}

export function useStableCarouselLayout({ aspectRatio, extraHeight = 0 }) {
	const { width: fallbackWidth } = useWindowDimensions();
	const [measuredWidth, setMeasuredWidth] = useState(null);

	const dimensions = useMemo(
		() =>
			getStableCarouselDimensions({
				measuredWidth,
				fallbackWidth,
				aspectRatio,
				extraHeight,
			}),
		[aspectRatio, extraHeight, fallbackWidth, measuredWidth]
	);

	const onLayout = useCallback((event) => {
		const nextWidth = positiveNumberOrNull(event?.nativeEvent?.layout?.width);
		if (!nextWidth) return;

		setMeasuredWidth((currentWidth) =>
			currentWidth === null || Math.abs(currentWidth - nextWidth) >= 0.5
				? nextWidth
				: currentWidth
		);
	}, []);

	return { ...dimensions, onLayout };
}
