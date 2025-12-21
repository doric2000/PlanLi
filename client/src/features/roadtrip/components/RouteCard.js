import React, { useState } from "react";
import { useUserData } from '../../../hooks/useUserData';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Avatar } from "../../../components/Avatar";
import PlacesRoute from "./PlacesRoute";
import { ActionMenu } from "../../../components/ActionMenu";
import { cards, typography, tags as tagsStyle, colors } from "../../../styles";

/**
 * Component to display tags with a limit on visible items.
 * @param {Object} props
 * @param {string[]} props.tags - Array of tags to display.
 */
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

/**
 * Card component to display route summary.
 *
 * @param {Object} props
 * @param {Object} props.item - Route data.
 * @param {Function} props.onPress - Callback for card press.
 * @param {boolean} props.isOwner - Whether the current user is the owner.
 * @param {Function} props.onEdit - Callback for edit action.
 * @param {Function} props.onDelete - Callback for delete action.
 */
export const RouteCard = ({ item, onPress, isOwner, onEdit, onDelete }) => {
    // Always use useUserData for author info
    const author = useUserData(item.userId);
    const displayUser = author.displayName || "Anonymous";
    const userPhoto = author.photoURL;

    return (
        <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
            <View style={cards.route}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Text style={[typography.h3, { flex: 1 }]}>{item.Title}</Text>
                    {isOwner && (
                        <ActionMenu 
                            onEdit={onEdit} 
                            onDelete={onDelete} 
                            title="Manage Route"
                        />
                    )}
                </View>
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
