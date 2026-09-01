import React, { forwardRef } from 'react';
import DraggableFlatList from 'react-native-draggable-flatlist';

const RtlHorizontalDraggableFlatList = forwardRef(function RtlHorizontalDraggableFlatList(
  props,
  ref
) {
  return (
    <DraggableFlatList
      {...props}
      ref={ref}
      horizontal
      inverted
      showsHorizontalScrollIndicator={false}
    />
  );
});

export default RtlHorizontalDraggableFlatList;
