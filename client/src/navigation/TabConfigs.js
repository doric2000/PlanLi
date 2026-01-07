import HomeScreen from "../features/home/screens/HomeScreen";
import CommunityScreen from "../features/community/screens/CommunityScreen";
import RoutesScreen from "../features/roadtrip/screens/RoutesScreen";
import ProfileScreen from "../features/profile/screens/ProfileScreen";
import FavoritesScreen from "../features/favorites/screen/FavoritesScreen";

export const tabConfigs = {
	Home: { icon: "home", activeColor: "#1A73E8" }, // Orange (brand)
	Community: { icon: "people", activeColor: "#1E8E3E" }, // Blue (social)
	Routes: { icon: "map", activeColor: "#673AB7" }, // Green (travel)
	Favorite: { icon: "bookmark", activeColor: "#F9A825" }, // i think bookmark icon looks more modern, dor thinks like a old head and wants a star, if star is chosen as the favorite among our friends, chagne it to 'star'
	Profile: { icon: "person", activeColor: "#E67C00" }, // Purple (personal)
};

export const tabScreens = [
	{ name: "Home", component: HomeScreen },
	{ name: "Community", component: CommunityScreen },
	{ name: "Routes", component: RoutesScreen },
	{ name: "Favorites", component: FavoritesScreen },
	{ name: "Profile", component: ProfileScreen },
];
