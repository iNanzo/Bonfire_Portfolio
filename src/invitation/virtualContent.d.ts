// The type of `virtual:invitation-content` (vite.config.js invitationContent): content.json's
// `invitation` subtree, as the admin wrote it (content.js reads it with fallbacks).
declare module 'virtual:invitation-content' {
  const content: unknown;
  export default content;
}
