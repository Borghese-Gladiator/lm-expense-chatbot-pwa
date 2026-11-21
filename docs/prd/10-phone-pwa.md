# PRD 10: Phone use as a PWA

## User and goal

The user is the account owner. The user opens the app on a phone to do two quick jobs: check spending and clear new transactions. The app installs to the home screen. It is a PWA. It is not a native app.

## Facts

- A manifest and icons exist (`manifest.ts`, 192 px and 512 px icons).
- No service worker exists. It stays that way unless offline use is needed.
- The app never caches `/api/` responses, because they hold bank data.
- The target width is 375 px.
- Test devices: iOS Safari and Android Chrome.

## Steps

| # | Step | Result the user sees | Status | Notes |
|---|---|---|---|---|
| 1 | Open the app URL on the phone | The login page fits the screen | Verify | |
| 2 | Sign in | The Overview opens | Verify | |
| 3 | Install to the home screen | An icon and a name | Verify | iOS: Add to Home Screen. Android: Install. |
| 4 | Open from the icon | The app opens with no browser bar | Verify | |
| 5 | Stay signed in after a close and a reopen | No second login | Verify | The cookie must work in the installed app |
| 6 | Use the menu | A menu button opens the page list | Works | The code has a burger menu |
| 7 | Read the Overview | Cards stack. The chart fits. | Verify | |
| 8 | Use Explore | Controls stack. The table scrolls or stacks. | Verify | |
| 9 | Open Transactions | Rows show as a list. Key fields are visible. | Verify | |
| 10 | Open a row | The detail opens full screen | Verify | |
| 11 | Edit a row and mark it reviewed | The row saves | Verify | |
| 12 | Tap targets | Each target is 44 px or larger | Verify | |
| 13 | Use the Trips page | The list and the summary fit the screen | Verify | |
| 14 | Use the Accounts page and Reconnect | Plaid Link opens and returns | Verify | |
| 15 | Open with no network | A clear offline message. No bank data shows. | Missing | |
| 16 | Receive a push notice for a broken connection | A notice | Missing | Optional. After the banner in PRD 07. |

## Result

The user checks the month and clears new rows on the phone in less than two minutes.

## Acceptance criteria

- Each page works at 375 px with no sideways scroll of the whole page.
- A table scrolls inside its own box or stacks.
- A drawer opens full screen on a phone.
- The installed app keeps the login.
- No response from `/api/` is cached.
- The app passes the Lighthouse PWA install check.

## Gaps to build

- A pass over each page at 375 px.
- A test on both devices.
- An offline message with no cached data.
