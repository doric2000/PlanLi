import HomeScreen from "../features/home/screens/HomeScreen";
import CommunityScreen from "../features/community/screens/CommunityScreen";
import RoutesScreen from "../features/roadtrip/screens/RoutesScreen";
import ProfileScreen from "../features/profile/screens/ProfileScreen";
import FavoritesScreen from "../features/favorites/screen/FavoritesScreen";
import AuthNavigator from "./AuthNavigator";

const ACTIVE_COLOR = "#1E3A5F";

export const tabConfigs = {
	Home: { icon: "home", activeColor: ACTIVE_COLOR, label: "בית" },
	Community: { icon: "people", activeColor: ACTIVE_COLOR, label: "קהילה" },
	Routes: { icon: "map", activeColor: ACTIVE_COLOR, label: "מסלולים" },
	Favorites: { icon: "bookmark", activeColor: ACTIVE_COLOR, label: "מועדפים" },
	Profile: { icon: "person", activeColor: ACTIVE_COLOR, label: "פרופיל" },
	Auth: { icon: "log-in", activeColor: ACTIVE_COLOR, label: "התחברות" },
};

export const tabScreens = [
	{ name: "Home", component: HomeScreen },
	{ name: "Community", component: CommunityScreen },
	{ name: "Routes", component: RoutesScreen },
	{ name: "Favorites", component: FavoritesScreen },
	{ name: "Profile", component: ProfileScreen },
	{ name: "Auth", component: AuthNavigator },
];
