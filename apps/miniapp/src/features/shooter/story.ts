const modeOneChoices = new Set([
  "keep-seven-second-voice",
  "join-encore-with-consent",
  "mark-missing-loss",
  "cancel-three-overnights",
  "post-caption-correction",
  "keep-both-rooms",
  "hold-future-photo",
  "publish-mismatch-log",
]);

const modeTwoChoices = new Set([
  "delete-learned-reply",
  "stop-autonomous-encore",
  "restore-funniest-loss",
  "share-one-overnight",
  "publish-original-snark",
  "read-session-log",
  "recreate-photo-later",
  "publish-seven-approved-notes",
]);

export const storyChoiceMode = (choiceID: string | undefined): 0 | 1 | 2 => {
  if (!choiceID) return 0;
  if (modeOneChoices.has(choiceID)) return 1;
  if (modeTwoChoices.has(choiceID)) return 2;
  return 0;
};
