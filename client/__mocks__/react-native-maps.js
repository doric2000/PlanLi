const React = require('react');

function createMockComponent(name) {
	return function Mocked(props) {
		return React.createElement(name, props, props.children);
	};
}

const MapView = createMockComponent('MapView');
const Marker = createMockComponent('Marker');
const Callout = createMockComponent('Callout');

module.exports = MapView;
module.exports.default = MapView;
module.exports.Marker = Marker;
module.exports.Callout = Callout;
