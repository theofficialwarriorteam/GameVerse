# GameVerse in-site game player setup

## Configure a game

1. Sign in to the GameVerse admin panel.
2. Open **Manage Games**, then add a game or edit an existing game.
3. For existing games, use **SET ALL HTTPS GAME URLS AS EMBED URLS** in the Manage Games list to copy each current HTTPS game URL into its embed field and enable the in-site player. This is a starting configuration for your testing; it does not prove that the host permits embedding.
4. Edit any game individually in **GAME PLAYER CONFIGURATION** to replace its URL with the provider's official HTTPS embed URL or disable its player if embedding is blocked. Use an embed URL from a provider that explicitly permits iframe embedding. Ordinary landing-page URLs often cannot be embedded.
5. Choose the player aspect ratio, background, loading message and fullscreen setting.
6. Add PC and mobile controls in their separate text areas. Add one control per line using:

   `Control name | Key or touch action | Description | Optional icon`

   Example:

   `Movement | W, A, S, D | Move the character | ⌨`

   `Jump | Space | Jump | ↑`

7. Save the game. Publish it if it is not already published.

## Visitor experience

- Selecting a game opens `#game/<game-id>` (the game details page).
- **PLAY NOW** opens `#play/<game-id>` in the same tab.
- **EXIT GAME** returns to the game details page.
- The player is sandboxed in an iframe. GameVerse background audio is not started by the player page.
- Only controls manually entered by the administrator are displayed. Coarse-pointer/small-screen devices show the mobile list; other devices show the PC list.

## Important compatibility and security notes

- The embed URL must use HTTPS and a different origin from the GameVerse site. This prevents the embedded page from being a same-origin script context.
- The provider must permit framing. `X-Frame-Options` or `Content-Security-Policy: frame-ancestors` can block embedding; browser code cannot reliably inspect another origin's frame response. GameVerse shows a compatibility note, but cannot override provider restrictions.
- The HTML5 option expects a separately hosted HTML5 game entry URL; this update does not upload, extract or host game ZIP packages.
- The iframe sandbox can restrict features some games require. Test each game with its provider's recommended embed URL and supported permissions.
- The bulk configuration action fills missing embed URLs from existing HTTPS game URLs while preserving any already-configured embed URL. It does not change the legacy URL. Disable individual players if their providers block iframe embedding.
- The existing analytics API records the game details view and a Play Now/player-entry event using its current `view` and `play` counters. It does not separately expose iframe load success or verified gameplay.
