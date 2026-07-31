import React, { forwardRef } from "react";

export const prefetchImage = (urls) => {
	const sources = (Array.isArray(urls) ? urls : [urls]).filter(Boolean);
	return Promise.all(
		sources.map(
			(uri) =>
				new Promise((resolve) => {
					const image = new Image();
					image.onload = () => resolve(true);
					image.onerror = () => resolve(false);
					image.src = uri;
				})
		)
	);
};

const getSourceUri = (source) => {
	if (typeof source === "string") return source;
	return source?.uri || null;
};

const flattenStyle = (style) => {
	if (Array.isArray(style)) {
		return style.reduce(
			(result, entry) => ({ ...result, ...flattenStyle(entry) }),
			{}
		);
	}
	return style && typeof style === "object" ? style : {};
};

const CachedImage = forwardRef(function CachedImage(
	{
		source,
		style,
		contentFit,
		resizeMode,
		priority = "normal",
		accessibilityLabel,
		alt,
		loading = "lazy",
		decoding = "async",
		testID,
		onLoad,
		onError,
		placeholder,
		srcSet,
		sizes,
	},
	ref
) {
	const sourceUri = getSourceUri(source);
	if (!sourceUri) return null;

	const flattenedStyle = flattenStyle(style);

	return (
		<img
			ref={ref}
			src={sourceUri}
			srcSet={srcSet || undefined}
			sizes={sizes || undefined}
			alt={alt ?? accessibilityLabel ?? ""}
			loading={loading}
			decoding={decoding}
			fetchPriority={priority === "normal" ? "auto" : priority}
			data-testid={testID}
			onLoad={onLoad}
			onError={onError}
			style={{
				...flattenedStyle,
				backgroundColor:
					typeof placeholder === "string"
						? placeholder
						: flattenedStyle.backgroundColor,
				objectFit: contentFit || resizeMode || flattenedStyle.objectFit || "cover",
				display: flattenedStyle.display || "block",
			}}
		/>
	);
});

export default CachedImage;
