import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Avatar } from './Avatar';
import { formatTimestamp } from '../utils/formatTimestamp';
import { common, typography, buttons, cards } from '../styles';

export const AuthorInfo = ({ author, item, isOwner }) => {
  return (
    <View style={[cards.userContainer, { marginTop: 16, marginBottom: 16 }]}> 
      <Avatar photoURL={author.photoURL} displayName={author.displayName} size={48} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <View style={common.rowBetween}>
          <Text style={typography.label}>{author.displayName}</Text>
          {item.createdAt && (
            <Text style={[typography.caption, { color: '#9CA3AF', fontSize: 11 }]}> {formatTimestamp(item.createdAt)} </Text>
          )}
        </View>
      </View>
      {!isOwner && (
        <TouchableOpacity style={buttons.primarySmall}>
          <Text style={buttons.primarySmallText}>מעקב</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};
