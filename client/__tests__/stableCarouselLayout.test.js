import React from "react";
import fs from "fs";
import path from "path";
import { act, renderHook } from "@testing-library/react-native";

import {
	getStableCarouselDimensions,
	useStableCarouselLayout,
} from "../src/hooks/useStableCarouselLayout";
import { cards } from "../src/styles/cards";

describe("stable carousel layout", () => {
	test("keeps recommendation and route ratios bounded to their frame width", () => {
		expect(
			getStableCarouselDimensions({ fallbackWidth: 390, aspectRatio: 1.1 })
		).toEqual({ pageWidth: 390, frameHeight: 390 / 1.1 });
		expect(
			getStableCarouselDimensions({ fallbackWidth: 390, aspectRatio: 1.25 })
		).toEqual({ pageWidth: 390, frameHeight: 312 });
	});

	test("uses a valid measurement and ignores zero or invalid layout events", () => {
		const { result } = renderHook(() =>
			useStableCarouselLayout({ aspectRatio: 1.1 })
		);

		act(() => {
			result.current.onLayout({ nativeEvent: { layout: { width: 360 } } });
		});
		expect(result.current).toMatchObject({
			pageWidth: 360,
			frameHeight: 360 / 1.1,
		});

		act(() => {
			result.current.onLayout({ nativeEvent: { layout: { width: 0 } } });
			result.current.onLayout({ nativeEvent: { layout: { width: NaN } } });
		});
		expect(result.current).toMatchObject({
			pageWidth: 360,
			frameHeight: 360 / 1.1,
		});
	});

	test("a filter rerender changes only the intentional first-card inset", () => {
		const { result, rerender } = renderHook(
			({ inset }) =>
				useStableCarouselLayout({ aspectRatio: 1.1, extraHeight: inset }),
			{ initialProps: { inset: 28 } }
		);
		const unfilteredHeight = result.current.frameHeight;
		const pageWidth = result.current.pageWidth;

		rerender({ inset: 0 });

		expect(result.current.pageWidth).toBe(pageWidth);
		expect(unfilteredHeight - result.current.frameHeight).toBe(28);
		expect(result.current.frameHeight).toBe(pageWidth / 1.1);
	});

	test("falls back safely when every supplied dimension is invalid", () => {
		expect(
			getStableCarouselDimensions({
				measuredWidth: 0,
				fallbackWidth: NaN,
				aspectRatio: 0,
				extraHeight: Infinity,
			})
		).toEqual({ pageWidth: 1, frameHeight: 1 });
	});

	test("both feed cards constrain the nested list to the measured frame", () => {
		expect(cards.recCarouselList).toMatchObject({
			width: "100%",
			height: "100%",
			flexGrow: 0,
			flexShrink: 0,
		});

		const sources = [
			"../src/components/RecommendationCard.js",
			"../src/features/roadtrip/components/RouteCard.js",
		].map((relativePath) =>
			fs.readFileSync(path.resolve(__dirname, relativePath), "utf8")
		);

		sources.forEach((source) => {
			expect(source).toContain("useStableCarouselLayout");
			expect(source).toContain(
				"style={[cards.recCarouselList, { width: pageWidth, height: frameHeight }]}"
			);
			expect(source).toContain("{ width: pageWidth, height: frameHeight }");
			expect(source).not.toMatch(/carouselWidth\s*\|\|\s*windowWidth/);
		});
	});
});
