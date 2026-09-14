import styles from "./story-actions.module.css";

// Durable option IDs are explicit: changing a label never changes a save.
export const storyActions: Record<
  string,
  { en: string; zh: string; action: string }
> = {
  "keep-seven-second-voice": {
    en: "Seal recording",
    zh: "封存录音",
    action: "seal",
  },
  "delete-learned-reply": { en: "Erase copy", zh: "删除副本", action: "erase" },
  "stop-autonomous-encore": {
    en: "End encore",
    zh: "停止返场",
    action: "lights",
  },
  "join-encore-with-consent": {
    en: "Own the stage",
    zh: "自主登台",
    action: "stage",
  },
  "restore-funniest-loss": {
    en: "Restore blooper",
    zh: "找回失误",
    action: "rewind",
  },
  "mark-missing-loss": { en: "Mark the gap", zh: "标记空白", action: "gap" },
  "cancel-three-overnights": {
    en: "Time to rest",
    zh: "今晚休息",
    action: "moon",
  },
  "share-one-overnight": {
    en: "Share the watch",
    zh: "一起值班",
    action: "watch",
  },
  "publish-original-snark": {
    en: "Original voice",
    zh: "保留原声",
    action: "voice",
  },
  "post-caption-correction": {
    en: "Fix captions",
    zh: "修正字幕",
    action: "caption",
  },
  "keep-both-rooms": { en: "Keep both", zh: "保留两间", action: "rooms" },
  "read-session-log": { en: "Read the log", zh: "查看记录", action: "log" },
  "hold-future-photo": {
    en: "Save the photo",
    zh: "收好照片",
    action: "photo",
  },
  "recreate-photo-later": {
    en: "Make new memories",
    zh: "重新合影",
    action: "camera",
  },
  "publish-mismatch-log": {
    en: "Reveal the gaps",
    zh: "公开差异",
    action: "reveal",
  },
  "publish-seven-approved-notes": {
    en: "Seven voices",
    zh: "七人发声",
    action: "voices",
  },
  "open-archive": { en: "Open archive", zh: "开放档案", action: "archive" },
  "shared-cut": { en: "Create together", zh: "共同剪辑", action: "together" },
  "quiet-signoff": { en: "Quiet signoff", zh: "安静下播", action: "signoff" },
};

export const StoryAction = ({
  id,
  portraitURL,
  selected = false,
}: {
  id: string;
  portraitURL?: string;
  selected?: boolean;
}) => {
  const action = storyActions[id]?.action ?? "archive";
  const wave = (
    <g className={styles.wave}>
      {[0, 1, 2, 3, 4].map((i) => (
        <rect
          key={i}
          x={48 + i * 14}
          y={54 - (i % 3) * 7}
          width="7"
          height={18 + (i % 3) * 14}
        />
      ))}
    </g>
  );
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 160 128"
      className={`${styles.scene} ${selected ? styles.selected : ""}`}
      data-story-action={action}
    >
      <path d="M12 108h136v8H12z" fill="#23405a" />
      {action === "seal" ? (
        <>
          <g className={styles.drop} fill="#a5f3fc">
            {wave}
          </g>
          <path d="M35 77h90v29H35z" fill="#566c97" />
          <path className={styles.lid} d="M29 70h102v9H29z" fill="#f9a8d4" />
          <path d="M75 83h10v14H75z" fill="#fde68a" />
        </>
      ) : action === "erase" ? (
        <>
          <g fill="#f9a8d4" opacity=".4" transform="translate(-18 -10)">
            {wave}
          </g>
          <g className={styles.dissolve} fill="#a5f3fc">
            {wave}
            <path d="M30 35h6v6h-6zM122 82h7v7h-7zM104 25h5v5h-5z" />
          </g>
          <path d="M117 36l14 14m0-14l-14 14" stroke="#fff" strokeWidth="5" />
        </>
      ) : action === "lights" || action === "stage" ? (
        <>
          <g
            className={action === "lights" ? styles.dissolve : styles.spotlight}
          >
            <path d="M65 12h30l34 91H31z" fill="#fde68a" opacity=".24" />
            <path d="M65 9h30v9H65z" fill="#fde68a" />
          </g>
          <g className={action === "stage" ? styles.walk : styles.exit}>
            {portraitURL ? (
              <image href={portraitURL} x="47" y="40" width="66" height="66" />
            ) : (
              <path fill="#f9a8d4" d="M70 48h20v20H70zM64 68h32v30H64z" />
            )}
          </g>
        </>
      ) : action === "moon" || action === "signoff" ? (
        <>
          <path
            className={styles.float}
            d="M98 25A34 34 0 1 0 108 82A30 30 0 0 1 98 25"
            fill="#c4b5fd"
          />
          <g className={styles.dissolve} fill="#fde68a">
            <path d="M34 20h6v6h-6zM119 49h7v7h-7zM41 77h5v5h-5z" />
          </g>
          {action === "signoff" && (
            <path
              d="M68 45v26m-12-18a20 20 0 1 0 24 0"
              stroke="#fff"
              strokeWidth="4"
              fill="none"
            />
          )}
        </>
      ) : action === "photo" || action === "camera" ? (
        <>
          <g className={action === "photo" ? styles.drop : styles.flash}>
            <path fill="#e0f2fe" d="M37 29h86v68H37z" />
            <path fill="#324a70" d="M43 35h74v49H43z" />
            <path fill="#f9a8d4" d="M55 59h18v22H55zM88 54h18v27H88z" />
            <path fill="#fde68a" d="M54 43h18v16H54zM88 38h18v16H88z" />
          </g>
          {action === "camera" && (
            <path d="M116 15v16m-8-8h16" stroke="#fff" strokeWidth="5" />
          )}
        </>
      ) : action === "rooms" || action === "watch" || action === "together" ? (
        <>
          <g fill="#67e8f9" className={styles.left}>
            <path d="M23 42h45v60H23z" />
            <path fill="#10263b" d="M30 49h31v46H30z" />
          </g>
          <g fill="#f9a8d4" className={styles.right}>
            <path d="M92 42h45v60H92z" />
            <path fill="#10263b" d="M99 49h31v46H99z" />
          </g>
          {action !== "rooms" && (
            <path
              className={styles.flash}
              d={
                action === "watch"
                  ? "M66 64h28v5H66zM78 53h5v28h-5z"
                  : "M63 56l34 30m0-30L63 86"
              }
              stroke="#fde68a"
              strokeWidth="5"
            />
          )}
        </>
      ) : action === "voice" || action === "voices" ? (
        <g fill="#a5f3fc">
          {wave}
          {action === "voices" &&
            [0, 1, 2, 3, 4, 5, 6].map((i) => (
              <rect
                className={styles.float}
                key={i}
                x={25 + i * 16}
                y="92"
                width="10"
                height="10"
                fill={i % 2 ? "#f9a8d4" : "#fde68a"}
              />
            ))}
        </g>
      ) : action === "rewind" ? (
        <>
          <path
            className={styles.left}
            d="M77 38L38 68l39 30zM122 38L83 68l39 30z"
            fill="#f9a8d4"
          />
          <path
            d="M29 31h102v73H29z"
            stroke="#a5f3fc"
            strokeWidth="3"
            fill="none"
          />
        </>
      ) : (
        <>
          <path d="M39 24h82v78H39z" fill="#334a6b" />
          <g
            className={action === "archive" ? styles.lid : styles.float}
            fill="#a5f3fc"
          >
            <path d="M49 36h62v6H49zM49 50h45v6H49zM49 64h62v6H49z" />
          </g>
          {action === "gap" ? (
            <path
              className={styles.flash}
              d="M49 78h62v12H49z"
              stroke="#fde68a"
              strokeDasharray="5 5"
              fill="none"
            />
          ) : action === "caption" ? (
            <path
              className={styles.flash}
              d="M67 83l10 10 24-25"
              stroke="#86efac"
              strokeWidth="6"
              fill="none"
            />
          ) : action === "reveal" ? (
            <path
              className={styles.right}
              d="M78 24h43v78H78z"
              fill="#071225"
            />
          ) : (
            <path
              className={styles.drop}
              d="M100 77h29v21h-29z"
              fill="#fde68a"
            />
          )}
        </>
      )}
    </svg>
  );
};
