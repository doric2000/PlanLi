describe("RTL stack navigation options", () => {
	afterEach(() => {
		jest.resetModules();
		jest.unmock("react-native");
	});

	test("uses a leftward back gesture on iOS screens and modals", () => {
		jest.doMock("react-native", () => ({
			Platform: { OS: "ios" },
		}));
		jest.doMock("@react-navigation/stack", () => ({
			CardStyleInterpolators: {
				forHorizontalIOS: "horizontal-interpolator",
			},
		}));

		const {
			rtlModalScreenOptions,
			rtlStackScreenOptions,
		} = require("../src/navigation/rtlStackOptions");

		expect(rtlStackScreenOptions).toMatchObject({
			headerShown: false,
			gestureDirection: "horizontal-inverted",
		});
		expect(rtlModalScreenOptions).toMatchObject({
			presentation: "modal",
			gestureDirection: "horizontal-inverted",
			cardStyleInterpolator: "horizontal-interpolator",
		});
	});

	test("keeps the platform navigation defaults outside iOS", () => {
		jest.doMock("react-native", () => ({
			Platform: { OS: "android" },
		}));
		jest.doMock("@react-navigation/stack", () => ({
			CardStyleInterpolators: {
				forHorizontalIOS: "horizontal-interpolator",
			},
		}));

		const {
			rtlModalScreenOptions,
			rtlStackScreenOptions,
		} = require("../src/navigation/rtlStackOptions");

		expect(rtlStackScreenOptions).toEqual({ headerShown: false });
		expect(rtlModalScreenOptions).toEqual({ presentation: "modal" });
	});
});
