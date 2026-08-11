const React = require('react');
const { Pressable, View } = require('react-native');

const MockMapView = React.forwardRef(({
  children,
  onMapReady,
  onPress,
  onRegionChangeComplete,
  testID,
  ...props
}, ref) => {
  React.useImperativeHandle(ref, () => ({}));
  React.useEffect(() => {
    onMapReady?.();
  }, [onMapReady]);
  return React.createElement(
    Pressable,
    {
      ...props,
      testID,
      onPress,
      onRegionChangeComplete,
    },
    children
  );
});

const Marker = ({ children, onPress, testID, ...props }) => React.createElement(
  Pressable,
  { ...props, testID, onPress },
  children
);

const Circle = (props) => React.createElement(View, { ...props, testID: 'map-user-accuracy' });
const Polyline = (props) => React.createElement(View, { ...props, testID: 'map-route-line' });

module.exports = MockMapView;
module.exports.default = MockMapView;
module.exports.Marker = Marker;
module.exports.Circle = Circle;
module.exports.Polyline = Polyline;
module.exports.PROVIDER_GOOGLE = 'google';
