import React from 'react';
import fs from 'fs';
import path from 'path';
import { StyleSheet, Text } from 'react-native';
import { render } from '@testing-library/react-native';

import RtlHorizontalScrollView from '../src/components/RtlHorizontalScrollView';
import RtlPagedFlatList from '../src/components/RtlPagedFlatList';

describe('shared RTL horizontal navigation', () => {
  it('renders paged content from the logical right edge', () => {
    const screen = render(
      <RtlPagedFlatList
        testID="rtl-pager"
        data={['first', 'second']}
        keyExtractor={(item) => item}
        renderItem={({ item }) => <Text>{item}</Text>}
      />
    );

    const pager = screen.getByTestId('rtl-pager');
    expect(pager.props.horizontal).toBe(true);
    expect(pager.props.pagingEnabled).toBe(true);
    expect(pager.props.inverted).toBe(true);
  });

  it('lays native scrolling rails out from right to left', () => {
    const screen = render(
      <RtlHorizontalScrollView testID="rtl-rail">
        <Text>first</Text>
        <Text>second</Text>
      </RtlHorizontalScrollView>
    );

    const rail = screen.getByTestId('rtl-rail');
    expect(rail.props.horizontal).toBe(true);
    expect(StyleSheet.flatten(rail.props.contentContainerStyle).flexDirection).toBe('row-reverse');
  });

  it('keeps every horizontal content surface on a shared RTL implementation', () => {
    const srcRoot = path.resolve(__dirname, '../src');
    const excluded = new Set(['RtlHorizontalScrollView.js', 'RtlPagedFlatList.js']);
    const pending = [srcRoot];
    const offenders = [];

    while (pending.length) {
      const current = pending.pop();
      fs.readdirSync(current, { withFileTypes: true }).forEach((entry) => {
        const entryPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          pending.push(entryPath);
        } else if (entry.name.endsWith('.js') && !excluded.has(entry.name)) {
          const source = fs.readFileSync(entryPath, 'utf8');
          if (/\n\s+horizontal(?:\s|=)/.test(source)) offenders.push(path.relative(srcRoot, entryPath));
        }
      });
    }

    expect(offenders).toEqual([]);
  });
});
