import React, { forwardRef } from "react";
import { Image as ExpoImage } from "expo-image";

export const prefetchImage = (urls) => {
	const sources = (Array.isArray(urls) ? urls : [urls]).filter(Boolean);
	if (!sources.length) return Promise.resolve(false);
	return ExpoImage.prefetch(sources, { cachePolicy: "disk" });
};

const getSourceUri = (source) => {
	if (typeof source === "string") return source;
	return source?.uri || null;
};

const CachedImage = forwardRef(function CachedImage(
	{
		source,
		contentFit,
		resizeMode = "cover",
		cachePolicy = "memory-disk",
		allowDownscaling = true,
		recyclingKey,
		transition = 120,
		loading: _loading,
		decoding: _decoding,
		srcSet: _srcSet,
		sizes: _sizes,
		...props
	},
	ref
) {
	const sourceUri = getSourceUri(source);
	void _loading;
	void _decoding;
	void _srcSet;
	void _sizes;

	return (
		<ExpoImage
			ref={ref}
			source={source}
			contentFit={contentFit || resizeMode}
			cachePolicy={cachePolicy}
			allowDownscaling={allowDownscaling}
			recyclingKey={recyclingKey ?? sourceUri}
			transition={transition}
			{...props}
		/>
	);
});

export default CachedImage;
