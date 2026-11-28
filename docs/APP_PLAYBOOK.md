# The app playbook

Everything learned building Hayve that makes an app feel good, calm and trustworthy. It works for
Hayve and for any other consumer app. Each rule is short; the reason is after the dash.

---

## 1. The big ideas

1. **One obvious thing per screen.** If people have to think about where to tap, the screen has failed.
2. **Every tap answers instantly.** A pressed state within 100 ms, then words that say what's happening.
3. **Never show an empty, blank or broken screen.** Loading, empty and error states are part of the feature, not extras.
4. **Value before effort.** Show people something useful before you ask for an account, money or permissions.
5. **Calm beats loud.** Lots of white space, one accent colour, few words. Delight comes from motion and moments, not decoration.
6. **Trust is the product** (for anything with money, rides or strangers). Clear prices, plain words, nothing hidden.
7. **Build the thing people will show their friends.** Growth comes from moments people want to share, not from ads.

---

## 2. Onboarding (Duolingo style)

- **Onboarding comes before sign-up.** Ask the questions, personalise the app, and only ask for an account when they want to save, pay or do a first real action. They've already invested, so they finish.
- **Only ask questions that change what they see.** Write down next to every question what it changes (the first screen, the big button, the default ride type…). If it changes nothing, delete it.
- **Tappable cards, not forms.** Big cards with an icon, a short title and a short hint. Multi-select where it makes sense ("Pick all that fit").
- **Skip questions that don't apply.** Only ask about food if they picked food.
- **Short, warm copy.** One line per screen. "Hi! I'm Hayve. Let's set things up." Not paragraphs, not "no account needed", not explanations of the app.
- **Never explain the interface.** Don't say "it gets the big button": people don't know what that means yet. Just ask "Which one will you do most?" and quietly use the answer.
- **No tutorial at the end.** Finish with "You're all set" and drop them on a personalised Home. They learn by using it.
- **Add a couple of fun questions** (favourite food, who they usually go with). They make it feel like a conversation and improve personalisation.
- **Location: use the real current location** and fill in the actual address, not just the country. Always offer "Not right? Pick your country" as a quiet fallback.
- **Ask for permissions in context**, right when they're needed and with one sentence saying why ("We need your camera for a few seconds to check it's really you").
- **Never pre-check marketing opt-ins or paid add-ons.**
- **Keep answers on the device**, then attach them to the account at sign-up.
- **Personalise the first screen.** Greeting with their name, the services they picked first, their most likely action on the main button.
- **Benefit wording.** "Getting around · Rides in minutes", not "Ride-hailing service".
- **Let them redo it later** ("Personalise again" in Settings).

## 3. Progress bars and waiting

- **A progress bar never starts at zero.** Count the welcome step as already done, so the bar starts partly filled. People are far more likely to finish something that has already started (the endowed-progress effect).
- **Near the end, say what's left:** "2 more questions", "Last one!".
- **Never let it go backwards or jump wildly.** Animate the fill smoothly.
- **For waits over about a second, show progress or a skeleton**, never a frozen screen. For long jobs (imports, uploads) show "Read 12 of 40" plus a Stop button.
- **Name the wait:** "Processing payment…", "Finding your driver…", "Checking…". A spinner alone feels longer.
- **Skeletons instead of spinners** for content: grey shapes where the content will appear, so the layout doesn't jump.

## 4. Screens and buttons

- **One primary button per screen:** full width, in the bottom third (thumb zone), in the accent colour, and **the only element in that colour**.
- **Never put two equal buttons side by side.** The second option is an outline or a text button underneath.
- **Delete, cancel and decline are smaller and away from the primary** (a small ghost button at the bottom). Destructive actions ask to confirm.
- **Hide advanced options** behind "More options" or a sheet until someone needs them.
- **Thumb-friendly:** tap targets at least 44×44 pt; important actions low on the screen.
- **Mobile first.** Design at 375–390 px wide and check that nothing is squeezed, cut off or overflowing.
- **Wide cards and list rows get the full width on a phone.** Only small tiles (product cards) go two per row. Forcing two columns of wide rows is what made text break letter by letter on the seller listings.
- **Text never overflows:** give long titles `numberOfLines`, let text containers shrink (`flex: 1, minWidth: 0`), and wrap meta info instead of cramming it on one line.

## 5. Feedback, states and errors

Every feature needs all of these:

| State | What it looks like |
|---|---|
| Loading | Skeleton in the shape of the content |
| Empty | Icon, one line saying why it's empty, and the action that fills it ("No payment links yet → Request money") |
| Error | What went wrong in plain words, **how to fix it**, and a Retry button |
| Success | A confirmation they can see (toast, tick, celebration for big moments) |
| Pressed | Instant scale-down or colour change on every tappable thing |

- **Error messages explain the fix:** "Paste at least one link that starts with https://", not "Invalid input".
- **Disable a button only with a reason shown** ("Add a title to continue"); better still, let them tap and tell them what's missing.
- **Optimistic updates for small actions** (likes, favourites); show and undo if it fails.
- **Undo beats "Are you sure?"** for reversible actions.

## 6. Motion and animation

Principles:
- **Nothing starts or stops instantly.** Ease out when things enter (fast start, soft landing), ease in when they leave, springs for anything physical (buttons, sheets, cards).
- **Durations:** 120–160 ms for small feedback, 200–250 ms for most transitions, 300–400 ms for big ones. Leaving is faster than arriving.
- **Things grow out of what you tapped.** Menus fan out from the button; sheets rise from the bottom; detail pages open from the card.
- **Stagger lists and menus:** items arrive one after another (about 20–40 ms apart), from the middle outwards for radial menus.
- **Small wind-up and follow-through:** scale to about 0.95 on press and spring back on release.
- **Errors shake, wins celebrate, the selected item stands out** (scales up and takes the accent colour).
- **Frequent actions are instant.** Tabs, back, keyboard shortcuts: no animation in the way.
- **Respect Reduce Motion:** with it on, use fades only (or nothing).
- **Animate transforms and opacity**, never layout, and use the native driver so it runs at 60 fps.
- **Don't ask heavy native views to redraw every frame.** Thin out long map routes and update an animated route about 20 times, not 60 times a second (this was part of the map crash).

Example: the hold menu on the centre button
- The button is just an icon; it turns into an ✕ (rotate and cross-fade) when the menu opens.
- The menu is **icons only**. Text labels on every item overlapped; now only the item under your thumb shows its name, in a small pill **above** it (your thumb covers anything below), kept on screen at the edges.
- The item under your thumb springs up to about 1.25×, turns indigo with a white icon, and gives a light haptic tick.
- Ignore mouse hover while the icons are still flying out, or the last one to pass under the pointer lights up by mistake.
- Neighbours must never touch, even when one is enlarged: size the arc from the screen width.

## 7. Visual design

- **A tiny palette:** one accent (Hayve indigo #4F46E5), black text #0E0E10, white, and two or three greys. No gradients, no tinted backgrounds, no coloured tiles or icons.
- **The accent means "act here" or "selected".** Use it for the primary button, the selected state and the user's own location dot, nothing else. Other links and icons are black.
- **Outline icons from one set** (Lucide), black by default, accent only when active.
- **One typeface** (Plus Jakarta Sans), with a clear scale: big bold titles, regular body, grey secondary text.
- **8 px grid** for spacing; 12–16 px corner radius; borders for structure, shadows only for things that float (sheets, the centre button, menus).
- **Lots of white space.** If a screen feels busy, remove things before shrinking them.
- **At most one emoji per screen** (the greeting, a small celebration), drawn the same on every device. No coloured emoji hearts in lists: use the outline icon.
- **Real photos make or break the look.** Stock-looking or missing images make an app feel fake; always have a clean placeholder (an icon and the item's name on light grey).
- **The brand name is always written the same way** (Hayve in bold, product names like "Hayve Pay" with the product word regular).

## 8. Words

- **Short and human.** "Where to?", "You're all set", "Find me a ride".
- **Talk about the benefit, not the feature.**
- **No jargon or internal names** in the interface ("big button", "escrow", "ledger", "KYC"). Say "Check your ID", "Money held safely until delivery".
- **Money words:** buyers see one "Fees" amount, never a percentage. Money back is real balance money: never call it cashback, points or credits.
- **Label anything simulated** with a small "Demo" badge.
- **Errors say how to fix the problem.** Confirmations say what happened ("$18.00 sent to Eva").

## 9. Navigation

- **A bottom bar of at most five items.** Home, two most-used services, a raised centre action and More.
- **The centre button is whatever they're most likely to do** (from onboarding, then from what they actually use). Tap it to start that; hold it to see everything.
- **Everything must be reachable some other way too** (More, Home shortcuts, search). Hidden gestures are shortcuts, never the only path.
- **Back always works** and goes where people expect; deep links open the right screen with a sensible fallback.
- **A search bar on Home** that understands "pizza", "airport" or "vintage jacket" and sends people to the right service.

## 10. Delight and celebrations

- **Congratulate real achievements:** first order, first sale, paying a friend back, a booking, getting verified, finishing a trip. Short title, one line, optional single emoji, confetti that respects Reduce Motion.
- **Don't celebrate routine actions** or it becomes noise.
- **Small surprises:** the route drawing itself in, the pin snapping to the nearest address, the car gliding and turning on the map.
- **Ask for a rating right after a good moment** (trip ended, order delivered), in the app and with one notification, never mid-task.

## 11. Personalisation

- Use the onboarding answers everywhere: the greeting, the order of services, the default ride type, guest count, favourite cuisines, the main button.
- Then learn from behaviour and quietly update (most-used service becomes the main button).
- Always show the person's own currency, city and address; never hard-code a country, city, currency or bank.

## 12. Sharing and growth

- **Build moments people want to post:** the holiday trip card (their photo, the routes they drove, a short code, "Everything in one app"), "Sold in 2 hours" cards, a yearly recap. Every card carries a short link back into onboarding with their invite applied.
- **Let people use the product without the app:** payment links friends can pay by card, then see "Get the app".
- **Referrals pay both sides, after the friend's first completed order or ride**, not at sign-up, with abuse limits.
- **Marketplaces: supply first.** Fill one city with sellers, drivers and restaurants before inviting buyers, so nobody opens an empty app.
- **Invite-only beta in batches**, a waitlist with "move up by inviting friends", and watch the onboarding drop-off per step every day.
- **No paid ads until people stick around** (week-4 retention).

## 13. Money and trust (any app that moves money)

- **Integer cents everywhere** and a double-entry ledger. **Never store a balance:** calculate it from the entries.
- **Hold money until the job is done** (delivery confirmed, ride completed, stay finished), then release it to the seller, driver or host automatically.
- **One status timeline per order** that everyone can see (Paid → In progress → Delivered → Paid out).
- **Price records must equal what the customer paid**, including delivery, cleaning and taxes. Pass-through money is never your revenue.
- **Fees and percentages live in config**, adjustable by an admin, never scattered through the code.
- **Card details never touch your servers;** use the payment provider's checkout.
- **Verification where safety matters:** drivers and couriers check their ID and face before they can register.

## 14. Privacy and security

- Passwords hashed (bcrypt or argon2); admins need a verified email and two-step verification; only admins add admins.
- All keys and secrets in environment variables, never in the code; a placeholder in `.env.example`.
- Uploads checked for file type and size.
- People can download or delete their data, and there's a privacy policy page.
- Anonymous means anonymous (gift buyers are never revealed); public pages show a first name only and leave out exact home or hotel locations.
- Fetching other websites (imports): only public addresses, with timeouts and size limits.

## 15. Maps (hard-won lessons)

- One map component for the whole app, so every map looks and behaves the same.
- **Never give the map padding bigger than the map.** A tall bottom sheet plus a header crashed Apple Maps ("Invalid Region"). Always keep at least 30% of the map free.
- **Drop invalid coordinates before they reach the map:** one NaN crashes MapKit or Mapbox.
- **Thin out long routes** (Apple returns thousands of points) and don't redraw them every frame.
- **Keep map layers mounted** and swap their data; adding and removing layers mid-animation crashes Mapbox.
- Points on top of each other: centre on them instead of "fitting".
- Have fallbacks: Mapbox with a key, Apple Maps on iPhone without one, free OpenStreetMap services, then an offline estimate so the flow still works.
- The pickup pin stays fixed in the middle, the address updates as you move, and it snaps to the nearest real address.

## 16. How to build (the workflow)

1. **Read the code first.** List what exists, what's broken and what you'll change. Refactor step by step; don't rewrite working features; keep the app running.
2. **Tests for logic:** money, statuses, timers, route maths, permissions.
3. **Look at it.** Screenshot every changed screen at phone width (390 px) after every change. Many bugs (overlapping labels, squeezed text, wrong colours) only show up visually.
4. **Simulate real use** with many synthetic people (Hayve's 1,000-person simulation) and check for 0 crashes and a balanced ledger.
5. **Run everything before saying done:** type-check, lint, tests and a production build.
6. **Finish with:** files changed, how to test by hand, what's unfinished.
7. **Ship often:** every push builds an installable app with automatic updates.

## 17. Before you ship a screen: checklist

- [ ] One obvious primary action, full width, bottom third, the only accent-coloured element
- [ ] No two equal buttons side by side; destructive actions small and away
- [ ] Loading skeleton, empty state with an action, error with how to fix it and Retry
- [ ] Every tap has a pressed state; long actions say what they're doing
- [ ] Success is confirmed; big wins are celebrated
- [ ] Looks right at 375–390 px: nothing cut off, squeezed or overlapping
- [ ] Only the allowed colours; outline icons; at most one emoji
- [ ] Short, human words; no jargon; fees as one amount; errors explain the fix
- [ ] Motion eases in and out, comes from where you tapped, and respects Reduce Motion
- [ ] Works without an account until it truly needs one
- [ ] Nothing hard-coded to one country, currency or city
- [ ] Tests and the build pass
