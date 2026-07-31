import {
	MAX_BOUNDED_IMAGE_WINDOW,
	getBoundedImageWindow,
} from "../src/hooks/useBoundedImageWindow";

describe("getBoundedImageWindow", () => {
	test("returns no indices for an empty collection", () => {
		expect(getBoundedImageWindow(0, 0)).toEqual({
			currentIndex: 0,
			indices: [],
		});
	});

	test("keeps the first image and its next neighbors bounded", () => {
		expect(getBoundedImageWindow(0, 8)).toEqual({
			currentIndex: 0,
			indices: [0, 1, 2],
		});
	});

	test("centers the bounded window around a middle image", () => {
		expect(getBoundedImageWindow(4, 8)).toEqual({
			currentIndex: 4,
			indices: [3, 4, 5],
		});
	});

	test("keeps the last image and its previous neighbors bounded", () => {
		expect(getBoundedImageWindow(7, 8)).toEqual({
			currentIndex: 7,
			indices: [5, 6, 7],
		});
	});

	test("never returns more than the configured maximum", () => {
		for (let itemCount = 0; itemCount < 12; itemCount += 1) {
			for (let activeIndex = -2; activeIndex < 14; activeIndex += 1) {
				const window = getBoundedImageWindow(activeIndex, itemCount);
				expect(window.indices.length).toBeLessThanOrEqual(
					MAX_BOUNDED_IMAGE_WINDOW
				);
				expect(window.indices).toHaveLength(
					Math.min(itemCount, MAX_BOUNDED_IMAGE_WINDOW)
				);
				if (itemCount > 0) {
					expect(window.indices).toContain(window.currentIndex);
				}
			}
		}
	});
});
