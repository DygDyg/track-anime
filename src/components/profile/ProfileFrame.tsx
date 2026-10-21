import {
  profileFrameLayerUrl,
  type ProfileFrame,
  type ProfileFrameLayer,
} from "@/lib/profile-frames";

function Layer({ frameId, layer }: { frameId: string; layer: ProfileFrameLayer }) {
  const src = profileFrameLayerUrl(frameId, layer.file);
  if (!src) return null;

  const depthClass =
    layer.depth === "front" ? "profile-frame-layer--front" : "profile-frame-layer--back";

  if (layer.placement === "rail" || layer.placement === "stretch") {
    return (
      <div
        aria-hidden
        className={`profile-frame-layer profile-frame-layer--${layer.placement} ${depthClass}`}
        style={{ backgroundImage: `url(${src})` }}
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      aria-hidden
      draggable={false}
      decoding="async"
      className={`profile-frame-layer profile-frame-layer--${layer.placement} ${depthClass}`}
    />
  );
}

export function ProfileFrame({ frame }: { frame: ProfileFrame }) {
  const back = frame.layers.filter((layer) => layer.depth === "back");
  const front = frame.layers.filter((layer) => layer.depth === "front");

  return (
    <>
      <div className="profile-frame profile-frame--back" aria-hidden>
        {back.map((layer) => (
          <Layer key={`${layer.depth}-${layer.file}`} frameId={frame.id} layer={layer} />
        ))}
      </div>
      <div className="profile-frame profile-frame--front" aria-hidden>
        {front.map((layer) => (
          <Layer key={`${layer.depth}-${layer.file}`} frameId={frame.id} layer={layer} />
        ))}
      </div>
    </>
  );
}
