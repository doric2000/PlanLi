import React, { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Avatar } from "./Avatar";
import PlacesRoute from "./PlacesRoute";
import { cards, typography, tags as tagsStyle, colors } from "../styles";

const RenderTags = ({ tags }) => {
    const MAX_VISIBLE = 3;
    const [showAll, setShowAll] = useState(false);

    const visibleTags = showAll ? tags : tags.slice(0, MAX_VISIBLE);
    const hasMore = tags.length > MAX_VISIBLE;

    return (
        <View style={tagsStyle.wrapper}>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={tagsStyle.container}
            >
                {visibleTags.map((tag, idx) => (
                    <View key={idx} style={tagsStyle.item}>
                        <Text style={tagsStyle.text}>#{tag}</Text>
                    </View>
                ))}
                {!showAll && hasMore && (
                    <Text style={{ ...tagsStyle.text, color: colors.info, alignSelf: 'center', marginLeft: 8 }}>
                        +{tags.length - MAX_VISIBLE}
                    </Text>
                )}
            </ScrollView>
        </View>
    );
};

export const RouteCard = ({ item, onPress }) => {
    let displayUser = "Unknown";
    let userPhoto = null;
    if (item.user) {
        if (typeof item.user === "object") {
            displayUser =
                item.user.displayName || item.user.email || "Anonymous";
            userPhoto = item.user.photoURL;
        } else {
            displayUser = item.user;
        }
    }

    return (
        <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
            <View style={cards.route}>
                <Text style={typography.h3}>{item.Title}</Text>
                <View style={styles.userContainer}>
                    <Avatar 
                        photoURL={userPhoto} 
                        displayName={displayUser} 
                        size={24} 
                    />
                    <Text style={typography.meta}>
                        by {displayUser}
                    </Text>
                </View>
                <Text style={typography.body}>{item.desc}</Text>
                <Text style={{ ...typography.bodySmall, marginBottom: 12 }}>
                    <Ionicons
                        name='calendar-outline'
                        size={16}
                        color='#64748B'
                    />{" "}
                    {item.days} days |{" "}
                    <Ionicons
                        name='navigate-outline'
                        size={16}
                        color='#64748B'
                    />{" "}
                    {item.distance} km |
                </Text>

                <PlacesRoute places={item.places} />

                {item.tags && item.tags.length > 0 && (
                    <RenderTags tags={item.tags} />
                )}
            </View>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    userContainer: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 5,
        gap: 8,
    },
});
