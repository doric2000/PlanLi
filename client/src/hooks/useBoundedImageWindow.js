import { useMemo } from "react";

export const MAX_BOUNDED_IMAGE_WINDOW = 3;

export function getBoundedImageWindow(activeIndex, itemCount) {
	const count = Number.isFinite(itemCount)
		? Math.max(0, Math.floor(itemCount))
		: 0;

	if (count === 0) {
		return { currentIndex: 0, indices: [] };
	}

	const requestedIndex = Number.isFinite(activeIndex)
		? Math.floor(activeIndex)
		: 0;
	const currentIndex = Math.max(0, Math.min(requestedIndex, count - 1));
	const windowSize = Math.min(MAX_BOUNDED_IMAGE_WINDOW, count);
	const maxStartIndex = count - windowSize;
	const startIndex = Math.min(
		Math.max(currentIndex - 1, 0),
		maxStartIndex
	);
	const indices = Array.from(
		{ length: windowSize },
		(_, offset) => startIndex + offset
	);

	return { currentIndex, indices };
}

export function useBoundedImageWindow(activeIndex, itemCount) {
	return useMemo(
		() => getBoundedImageWindow(activeIndex, itemCount),
		[activeIndex, itemCount]
	);
}
