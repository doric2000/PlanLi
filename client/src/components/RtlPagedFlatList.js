import React, { forwardRef } from 'react';
import { FlatList } from 'react-native';

const RtlPagedFlatList = forwardRef(function RtlPagedFlatList(props, ref) {
  return (
    <FlatList
      {...props}
      ref={ref}
      horizontal
      pagingEnabled
      inverted
      showsHorizontalScrollIndicator={false}
    />
  );
});

export default RtlPagedFlatList;
