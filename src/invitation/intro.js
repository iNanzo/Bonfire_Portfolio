// The intro's script for Play Intro: the admin's (content.json `invitation.intro`, through
// content.js introScript() once it has one), made safe by dialogue.js normalizeScript, or, while
// there's none or it has nothing to show, FALLBACK_INTRO: a placeholder in NEWT's voice built to
// types.js's DialogueScript (he greets the visitor, says who he is, asks one question with two
// replies and teases the invitation, through most of his faces and gestures).
import * as content from './content.js';
import { normalizeScript } from './dialogue.js';

/** @type {import('./types.js').DialogueScript} */
export const FALLBACK_INTRO = {
  speaker: 'NEWT',
  start: 'found',
  boxes: [
    { id: 'found', text: 'Oh! Hey, you found me.', face: 'surprised', animation: 'Spook', camera: 'medium' },
    { id: 'hello', text: 'Hi! Welcome to my little white room.', face: 'happy', animation: 'Wave', camera: 'medium' },
    { id: 'name', text: 'I’m NEWT. Newton made me, cap and all.', face: 'smug', animation: 'Nod', camera: 'close' },
    {
      id: 'quiet',
      text: 'Sorry, I don’t get many visitors out here.',
      face: 'shy',
      animation: 'Shrug',
      camera: 'close',
    },
    {
      id: 'ask',
      text: 'So… did you come to see me, or for the invitation?',
      face: 'neutral',
      animation: 'Think',
      camera: 'medium',
      choices: [
        { label: 'Just To See You', next: 'you' },
        { label: 'The Invitation', next: 'business' },
      ],
    },
    {
      id: 'you',
      text: 'Really? That’s… really nice. Thank you.',
      face: 'shy',
      animation: 'Nod',
      camera: 'close',
      next: 'soon',
    },
    {
      id: 'business',
      text: 'Straight to business, huh? Fair enough.',
      face: 'angry',
      animation: 'Shrug',
      camera: 'medium',
    },
    {
      id: 'soon',
      text: 'It isn’t ready yet. Newton is still writing it.',
      face: 'sad',
      animation: 'Talk',
      camera: 'medium',
    },
    {
      id: 'list',
      text: 'But it’s coming soon, and you’re on the list!',
      face: 'happy',
      animation: 'Point',
      camera: 'close',
    },
    {
      id: 'bye',
      text: 'Until then, stay and play with me a little.',
      face: 'happy',
      animation: 'Cheer',
      camera: 'wide',
      end: true,
    },
  ],
};

/**
 * The script Play Intro runs: the admin's when it has something to show, else the placeholder.
 * @returns {import('./types.js').DialogueScript}
 */
export function introScript() {
  // (Looked up by name: content.js has no introScript() until the admin's package adds it.)
  const from = Reflect.get(content, 'introScript');
  let admin;
  try {
    admin = typeof from === 'function' ? normalizeScript(from()) : null;
  } catch {
    admin = null;
  }
  return admin ?? /** @type {import('./types.js').DialogueScript} */ (normalizeScript(FALLBACK_INTRO));
}
