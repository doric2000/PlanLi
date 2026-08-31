import React, { forwardRef } from 'react';
import { NestableDraggableFlatList } from 'react-native-draggable-flatlist';

const RtlHorizontalDraggableFlatList = forwardRef(function RtlHorizontalDraggableFlatList(
  props,
  ref
) {
  return (
    <NestableDraggableFlatList
      {...props}
      ref={ref}
      horizontal
      inverted
      showsHorizontalScrollIndicator={false}
    />
  );
});

export default RtlHorizontalDraggableFlatList;
