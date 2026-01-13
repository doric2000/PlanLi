import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Avatar } from './Avatar';
import { formatTimestamp } from '../utils/formatTimestamp';
import { common, typography, buttons, cards } from '../styles';
import { useNavigation } from '@react-navigation/native';

export const AuthorInfo = ({ author, item, isOwner }) => {
  const navigation = useNavigation();

  return (
    <View style={[cards.userContainer, { marginTop: 16, marginBottom: 16 }]}>
      <TouchableOpacity
        style={{ flexDirection: "row", alignItems: "center", flex: 1 }}
        activeOpacity={0.75}
        onPress={() => navigation.navigate("UserProfile", { uid: item.userId })}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Avatar photoURL={author.photoURL} displayName={author.displayName} size={48} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <View style={common.rowBetween}>
            <Text style={typography.label}>{author.displayName}</Text>
            {item.createdAt && (
              <Text style={[typography.caption, { color: '#9CA3AF', fontSize: 11 }]}>
                {formatTimestamp(item.createdAt)}
              </Text>
            )}
          </View>
        </View>
      </TouchableOpacity>

      {!isOwner && (
        <TouchableOpacity style={buttons.primarySmall}>
          <Text style={buttons.primarySmallText}>מעקב</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};
