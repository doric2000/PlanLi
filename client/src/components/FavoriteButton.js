import React from 'react';
import { TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFavorite } from '../hooks/useFavorite';
import { colors, common } from '../styles';

/**
 * FavoriteButton - Reusable favorite/bookmark button component
 *
 * @param {Object} props
 * @param {string} props.type - Type of item ('recommendations', 'routes', 'cities', etc.)
 * @param {string} props.id - ID of the item to favorite
 * @param {string} [props.variant='light'] - Button variant: 'light' (white background) or 'dark' (colored background)
 * @param {Object} [props.style] - Additional styles to apply
 */
const FavoriteButton = ({ type, id, variant = 'light', style }) => {
  const { isFavorite, toggleFavorite, loading: saving } = useFavorite(type, id);

  const getButtonStyle = () => {
    const baseStyle = common.iconButton;
    if (variant === 'dark') {
      return [baseStyle, { backgroundColor: colors.background }, style];
    }
    return [baseStyle, style];
  };

  const getIconColor = () => {
    if (isFavorite) return colors.primary;
    return variant === 'light' ? colors.white : colors.textPrimary;
  };

  return (
    <TouchableOpacity
      style={getButtonStyle()}
      onPress={toggleFavorite}
      disabled={saving}
    >
      <Ionicons
        name={isFavorite ? "bookmark" : "bookmark-outline"}
        size={24}
        color={getIconColor()}
      />
    </TouchableOpacity>
  );
};

export default FavoriteButton;