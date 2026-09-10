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
			TransitionPresets: { SlideFromRightIOS: { transitionSpec: { open: "ios-spring", close: "ios-spring" }, cardStyleInterpolator: "horizontal-interpolator" } },
			CardStyleInterpolators: {
				forHorizontalIOS: "horizontal-interpolator",
			},
		}));

		const {
			profileStackScreenOptions,
			rtlContentScreenOptions,
			rtlModalScreenOptions,
			rtlStackScreenOptions,
		} = require("../src/navigation/rtlStackOptions");

		expect(profileStackScreenOptions).toMatchObject({ headerMode: 'screen', headerShown: false, gestureDirection: 'horizontal-inverted', cardStyleInterpolator: 'horizontal-interpolator', transitionSpec: { open: 'ios-spring', close: 'ios-spring' } });
		expect(rtlStackScreenOptions).toMatchObject({
			headerShown: false,
			gestureDirection: "horizontal-inverted",
		});
		expect(rtlModalScreenOptions).toMatchObject({
			presentation: "modal",
			gestureDirection: "horizontal-inverted",
			cardStyleInterpolator: "horizontal-interpolator",
		});
		expect(rtlContentScreenOptions).toMatchObject({
			headerShown: false,
			gestureEnabled: true,
			gestureDirection: "horizontal-inverted",
			gestureResponseDistance: 90,
		});
	});

	test("keeps the platform navigation defaults outside iOS", () => {
		jest.doMock("react-native", () => ({
			Platform: { OS: "android" },
		}));
		jest.doMock("@react-navigation/stack", () => ({
			TransitionPresets: { SlideFromRightIOS: { transitionSpec: { open: "ios-spring", close: "ios-spring" }, cardStyleInterpolator: "horizontal-interpolator" } },
			CardStyleInterpolators: {
				forHorizontalIOS: "horizontal-interpolator",
			},
		}));

		const {
			profileStackScreenOptions,
			rtlContentScreenOptions,
			rtlModalScreenOptions,
			rtlStackScreenOptions,
		} = require("../src/navigation/rtlStackOptions");

		expect(profileStackScreenOptions).toEqual({ headerShown: false, headerMode: 'screen' });
		expect(rtlStackScreenOptions).toEqual({ headerShown: false });
		expect(rtlModalScreenOptions).toEqual({ presentation: "modal" });
		expect(rtlContentScreenOptions).toEqual({ headerShown: false, gestureEnabled: true });
	});
});
