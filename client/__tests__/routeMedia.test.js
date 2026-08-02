import {
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
