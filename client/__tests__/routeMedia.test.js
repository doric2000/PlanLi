import {
  applyRoutePublishMedia,
  ensureRouteDraftIds,
  extractRoutePublishMedia,
  getUploadedAssetPaths,
  isLocalImageUri,
  prepareRouteMedia,
  revokeRouteObjectUrls,
} from "../src/features/roadtrip/utils/routeMedia";

const makeAsset = (id) => ({
  assetId: `123e4567-e89b-42d3-a456-4266141740${id}`,
  large: {
    url: `https://cdn.example/${id}-large.webp`,
    path: `media/u/${id}/large.webp`,
  },
  feed: {
    url: `https://cdn.example/${id}-feed.webp`,
    path: `media/u/${id}/feed.webp`,
  },
  thumb: {
    url: `https://cdn.example/${id}-thumb.webp`,
    path: `media/u/${id}/thumb.webp`,
  },
});

describe("routeMedia", () => {
  it('replaces the local photo count before saving a fully uploaded 40-photo route', () => {
    const extracted = extractRoutePublishMedia(Array.from({ length: 14 }, (_, dayIndex) => ({
      id: `day-${dayIndex}`, stops: [{ id: `stop-${dayIndex}`,
        pendingMedia: Array.from({ length: dayIndex === 13 ? 1 : 3 }, (_, index) => ({ uri: `file:///photo-${dayIndex}-${index}.jpg` })),
      }],
    })));
    const source = { days: extracted.days, localMediaCount: 40 };
    const prepared = applyRoutePublishMedia(source, extracted.media.map((entry, index) => ({ ...entry, asset: makeAsset(String(index).padStart(2, '0')) })));
    const uploadedCount = prepared.days.reduce((sum, day) => sum + day.stops.reduce((count, stop) => count + [stop.media, ...stop.additionalMedia].filter(Boolean).length, 0), 0);
    expect(uploadedCount + prepared.localMediaCount).toBe(40);
    expect(prepared.localMediaCount).toBe(0);
    expect(applyRoutePublishMedia(source, extracted.media, { preview: true }).localMediaCount).toBe(40);
    expect(source.localMediaCount).toBe(40);
  });

  it('preserves interleaved existing and new photos even if uploads complete in reverse order', () => {
    const existing = makeAsset('01');
    const extracted = extractRoutePublishMedia([{ id: 'day', stops: [{
      id: 'stop', media: existing, mediaOrder: ['local', 'remote', 'local'],
      pendingMedia: [{ uri: 'file:///first.jpg' }, { uri: 'file:///last.jpg' }],
    }] }]);
    expect(extracted.media.map((item) => item.slot.mediaIndex)).toEqual([0, 2]);
    const completed = applyRoutePublishMedia({ days: extracted.days }, [
      { ...extracted.media[1], asset: makeAsset('03') }, { ...extracted.media[0], asset: makeAsset('02') },
    ]);
    const stop = completed.days[0].stops[0];
    expect([stop.media, ...stop.additionalMedia].map((asset) => asset.assetId)).toEqual([
      makeAsset('02').assetId, existing.assetId, makeAsset('03').assetId,
    ]);
    expect(stop.mediaOrder).toBeUndefined();
    const preview = applyRoutePublishMedia({ days: extracted.days }, [...extracted.media].reverse(), { preview: true });
    expect(preview.days[0].stops[0].pendingMedia.map((item) => item.uri)).toEqual(['file:///first.jpg', 'file:///last.jpg']);
  });
  it('keeps nested images attached to stable draft IDs after reordering', () => {
    const days = ensureRouteDraftIds([
      { draftId: 'day-a', image: 'file:///a.jpg', stops: [] },
      { draftId: 'day-b', stops: [{ draftId: 'stop-b', image: 'file:///b.jpg' }] },
    ], jest.fn());
    const extracted = extractRoutePublishMedia(days);
    const reordered = { days: [extracted.days[1], extracted.days[0]] };
    const assets = extracted.media.map((entry, index) => ({ ...entry, asset: makeAsset(`0${index + 1}`) }));
    const restored = applyRoutePublishMedia(reordered, assets);
    expect(restored.days[0].stops[0].media.assetId).toContain('02');
    expect(restored.days[1].media.assetId).toContain('01');
  });
  it('preserves existing stop media and appends every locally cropped stop image in order', () => {
    const existing = makeAsset('01');
    const extracted = extractRoutePublishMedia([{
      draftId: 'day-a',
      stops: [{
        draftId: 'stop-a',
        media: existing,
        pendingMedia: [
          { uri: 'file:///two.jpg', mediaId: 'two', localReference: { key: 'two' } },
          { uri: 'file:///three.jpg', mediaId: 'three', localReference: { key: 'three' } },
        ],
        image: 'file:///two.jpg',
      }],
    }]);
    expect(extracted.media.map((entry) => entry.slot.mediaIndex)).toEqual([1, 2]);
    expect(extracted.days[0].stops[0].media).toBe(existing);
    expect(extracted.days[0].stops[0].pendingMedia).toBeUndefined();
    const restored = applyRoutePublishMedia(
      { days: extracted.days },
      extracted.media.map((entry, index) => ({ ...entry, asset: makeAsset(`0${index + 2}`) }))
    );
    expect(restored.days[0].stops[0].media).toBe(existing);
    expect(restored.days[0].stops[0].additionalMedia.map((asset) => asset.assetId)).toEqual([
      makeAsset('02').assetId,
      makeAsset('03').assetId,
    ]);
  });
  it("recognizes local images without treating remote URLs as pending", () => {
    expect(isLocalImageUri("file:///photo.jpg")).toBe(true);
    expect(isLocalImageUri("blob:https://app.local/123")).toBe(true);
    expect(isLocalImageUri("data:image/jpeg;base64,abc")).toBe(true);
    expect(isLocalImageUri("https://cdn.example/photo.webp")).toBe(false);
  });

  it("uploads local day and stop images in route order and keeps canonical remote media", async () => {
    const remoteAsset = makeAsset("03");
    const uploadImageAssets = jest.fn(async (uris, options) => {
      expect(options).toEqual({ limit: Number.POSITIVE_INFINITY });
      return uris.map((_, index) => makeAsset(`0${index + 1}`));
    });
    const source = [{
      image: "file:///day.jpg",
      stops: [
        { image: remoteAsset.feed.url, media: remoteAsset },
        { image: "blob:https://app.local/stop" },
      ],
    }];

    const result = await prepareRouteMedia(source, uploadImageAssets);

    expect(uploadImageAssets).toHaveBeenCalledWith(
      ["file:///day.jpg", "blob:https://app.local/stop"],
      { limit: Number.POSITIVE_INFINITY }
    );
    expect(result.days[0].image).toBeUndefined();
    expect(result.days[0].media.assetId).toContain("01");
    expect(result.days[0].stops[0].image).toBeUndefined();
    expect(result.days[0].stops[0].media).toBe(remoteAsset);
    expect(result.days[0].stops[1].media.assetId).toContain("02");
    expect(source[0].image).toBe("file:///day.jpg");
  });

  it("rejects an unmigrated remote route image", async () => {
    await expect(
      prepareRouteMedia(
        [{ image: "https://legacy.example/day.jpg", stops: [] }],
        jest.fn()
      )
    ).rejects.toThrow("was not migrated");
  });

  it("rejects incomplete processing results without mutating the source", async () => {
    const source = [{ image: "file:///day.jpg", stops: [] }];
    await expect(
      prepareRouteMedia(source, jest.fn(async () => [{ large: {} }]))
    ).rejects.toThrow("did not return every requested image");
    expect(source).toEqual([{ image: "file:///day.jpg", stops: [] }]);
  });

  it("deduplicates canonical cleanup paths", () => {
    const shared = makeAsset("01");
    shared.thumb.path = shared.large.path;
    expect(getUploadedAssetPaths([shared, shared])).toEqual([
      "media/u/01/large.webp",
      "media/u/01/feed.webp",
    ]);
  });

  it("releases each browser object URL once after a successful save", () => {
    const revoke = jest.fn();
    revokeRouteObjectUrls(
      [{
        image: "blob:https://app.local/shared",
        stops: [
          { image: "blob:https://app.local/shared" },
          { image: "blob:https://app.local/stop" },
          { image: "file:///native.jpg" },
        ],
      }],
      revoke
    );
    expect(revoke.mock.calls.map(([uri]) => uri)).toEqual([
      "blob:https://app.local/shared",
      "blob:https://app.local/stop",
    ]);
  });
});
