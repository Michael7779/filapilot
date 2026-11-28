# Changelog (English)

English version of the user-visible entries of [CHANGELOG.md](CHANGELOG.md). It is shown in the app when the interface language is
English; for a version without an entry here the app falls back to the German text. Notes for admins ("Hinweis zum Update" in the
German file) are not translated and do not appear in the app.

Rule: every version with user-visible items in CHANGELOG.md needs a matching entry here with the same number of items (checked by
`packages/backend/tests/unit/changelog.test.ts`). Headings: Added, Changed, Fixed, Security.

## [0.46.0] - 2026-11-28

### Added
- Prints of a printer connected through the Bambu Cloud now appear in the statistics under print jobs, with name, grams and cost. FilaPilot checks shortly after each print and when you click "Update from cloud". Successful prints from this update on are recorded; a matching spool has to be assigned to the AMS slot.

### Changed
- Cloud printers: consumption now comes from Bambu's print history instead of the AMS fill level, which changes too imprecisely for this. Nothing is deducted a second time from spools that come from the Bambu Cloud, because their remaining weight already comes from there.

### Fixed
- Statistics: fluctuations of the remaining weight from the Bambu Cloud no longer count as consumption. A later increase cancels the earlier decrease of the same spool.

## [0.45.1] - 2026-11-27

### Fixed
- Printers: the page now updates by itself. Fill level, material and color of the AMS slots, the automatic assignment and changes by other users appear without reloading; during a print the progress is also shown in percent.
- Printers: if the connection to a printer drops, the page now shows it instead of still reporting "Connected".
- After signing out and in again, live updates arrive again without reloading the page.

## [0.45.0] - 2026-11-25

### Added
- Printers, AMS: every slot now shows the material and color reported by the printer, so you can find the matching spool more easily.
- Printers, AMS: the Bambu sync now assigns spools to the slots automatically (marked "auto") when the Bambu Cloud names the slot and the printer reports the same material and a matching color there. A spool you picked yourself is never overwritten, and nothing changes during a print. After swapping a spool, the assignment follows with the next sync.

### Changed
- Bambu sync: if a spool in FilaPilot has no note yet, it gets the note from the Bambu app. An existing note is never overwritten. If you delete a note only in FilaPilot, it comes back with the next sync.

### Fixed
- Printers: the external spool no longer shows "0 %" when the printer does not know the fill level at all.

## [0.44.0] - 2026-11-25

### Added
- Printers: a printer can now be connected through the Bambu Cloud, without LAN mode and without IP address and access code. The inventory needs a saved Bambu connection (Spools → Import from Bambu Cloud). The connection to the real Bambu Cloud has not yet been checked with a real printer.
- Printers: owners can change the connection of an existing printer ("Change connection" button), for example from local to the Bambu Cloud. The assignment of the AMS slots is kept.
- Printers: if a cloud printer cannot connect, its card shows the reason (no Bambu connection in the inventory or sign-in expired).

### Fixed
- Printers: after connecting, FilaPilot now requests the full state, and short partial messages from the printer no longer empty the AMS display (mainly affects the P1 and A1 models).

## [0.43.0] - 2026-11-24

### Added
- Dashboard, "Needs attention": admins now also see when the nightly automatic backup has failed, with the reason. The notice disappears as soon as a backup succeeds again.
- Printers: a printer can now be moved to another inventory ("Move to another inventory" button on the printer card, only for owners of both inventories). The job history moves along; the assignment of spools to AMS slots is cleared because it refers to spools of the old inventory.
- Printers, AMS: if several AMS units are chained to one printer, FilaPilot now shows all of them (up to four, labeled e.g. "AMS 2 · Slot 1") and books the consumption for every slot. Previously only the first AMS was read. This has not yet been checked on a real printer with several AMS units.
- Bambu import: the note you stored on a spool in the Bambu app is taken over when the spool is created. Notes changed in Bambu later never overwrite the note in FilaPilot.
- Change history: it is now also available in English. With the English interface the English texts appear.
- Spoolman import: spools that are archived in Spoolman (for example used up) also arrive archived in FilaPilot and no longer show up as "almost empty" in the stock.

### Changed
- Deleting users: a user who is the only owner of an inventory can no longer be deleted. The message names the affected inventories; first appoint another owner or delete the inventory. This way no inventory is ever left without an owner.

### Fixed
- Spoolman import: a spool with a very long comment (over 500 characters) was skipped completely. The comment is now shortened and the spool arrives.

## [0.42.1] - 2026-11-23

### Security
- Several components FilaPilot is built on were brought up to date because security vulnerabilities were known in older versions (email sending, input validation, web server framework and a few helper libraries). Nothing changes in look or operation.

## [0.42.0] - 2026-11-22

### Added
- Dashboard, "Needs attention": it now also shows when something is wrong with the backup or the Bambu cloud. Admins see a notice if automatic backup is on but no backup exists or the latest one is older than a day and a half. For an inventory with a saved Bambu cloud connection, a notice appears if the last sync failed (with the reason), the login has expired or expires within the next three days. A click leads to the settings or to the spools.

### Changed
- Every spool and every printer now belongs to an inventory in the database (previously this was only ensured in the program). Nothing changes in daily use.
- Backups from before inventories existed (before version 0.13.0, September 2026) can no longer be restored. The app reports this immediately, before anything is changed. All newer backups work as before.

## [0.41.1] - 2026-11-19

### Security
- The web server that delivers the interface (nginx) was updated to version 1.31.9. It closes several known vulnerabilities from 18 Nov 2026. In our assessment there was no concrete risk for this installation, because the affected features are not used.

## [0.41.0] - 2026-11-18

### Changed
- Spools: "Started" and "Unopened" now appear as two tabs side by side (started first) instead of two long sections one below the other. A click on a tab shows only the spools of that group, with count and total weight on the right of the bar. Paging counts per tab. If only one of the two groups exists, no tab bar appears, as before.

## [0.40.0] - 2026-11-17

### Changed
- Spools, list view: the details you previously saw only after expanding a row (nozzle, bed, remaining length, purchase price, date, note, custom fields) now appear small and compact on one line directly below each spool. Details without a value (e.g. no price, no note) are simply left out. Expanding and the arrow at the start of the row are gone; "Sort further by" above stays.

## [0.39.1] - 2026-11-17

### Fixed
- Spools, search: search now also finds words from a spool's note (e.g. a name or place of purchase), not just manufacturer, material, color and storage location.

## [0.39.0] - 2026-11-05

### Added
- Dashboard, "Remaining stock by material type": a click on a material (e.g. PLA) expands all spools of that material below it, each with color, manufacturer, bar, grams and percent; the bar has the color of the filament. Another click collapses the list again. Several materials can be open at once; next to the name you now also see how many spools are behind it.
- Statistics: the three breakdowns (consumption by material type, by material and by manufacturer) can be expanded the same way. Below them are the individual spools with color, color bar, fill level in grams and percent, and consumption; archived spools are marked.

## [0.38.0] - 2026-11-04

### Added
- Spools, list view: if there are further spools of a filament (same manufacturer, same material, same color), they now appear small below the spool's buttons, each with bar, grams and percent. This shows at a glance whether a replacement is in stock. A click on one of these rows jumps straight to that spool in the list and briefly highlights it, even if it is on another page or currently filtered out.

## [0.37.0] - 2026-11-04

### Added
- Spools, list view: below the header there is now "Sort further by:" with nozzle, bed, remaining length, price, purchased on, added on, changed on and note. This lets you sort ascending and descending by these details without expanding a row first. The list stays as tidy as before. The delivery form in the header is now sortable too.

## [0.36.0] - 2026-10-23

### Added
- SizzleBrothers: when you open the wishlist, products and prices are updated automatically, at most every 5 minutes. The list appears immediately, the new prices follow as soon as the update is done.
- SizzleBrothers: new "Update prices" button at the top of the page. It always updates, even within the 5 minutes. The button in the "Choose products from the shop" dialog is gone.
- SizzleBrothers: the update shows its progress. On a computer a card with the three steps (query shop, evaluate products, save prices) and the elapsed seconds appears, on a phone a small badge next to the button; a tap shows the details. If it takes longer than 8 seconds, a note about a slow connection appears, and the list stays usable with the old data in the meantime.
- SizzleBrothers: a running update can be ended with "Cancel", for example on a poor internet connection. Everything stays unchanged; afterwards there is "Try again". If the shop cannot be reached, this is shown together with the last known state.

## [0.35.0] - 2026-10-23

### Added
- SizzleBrothers order list: new "Discount in %" field for the whole order, in addition to "Discount in €". The percentage discount is deducted from the goods (rounded to whole cents) and, together with shipping and the euro discount, distributed among the people by goods value. Enter with comma or dot, for example 7.5. The overview in order list and settlement shows goods, shipping and all discounts together.

## [0.34.0] - 2026-10-21

### Added
- SizzleBrothers order list: new "Shipping" and "Discount" fields for the whole order. Both amounts are distributed among the people by goods value in the settlement, accurate to the cent. The settlement shows each person's share of shipping and discount, plus an overview with goods, shipping, discount and total. The CSV file and the text for copying contain the share as well. If you have a percentage discount, keep entering it via the price per item.
- SizzleBrothers: "Remove completed" resets shipping and discount as soon as nothing is left in the order list, so they don't carry over into the next order.

## [0.33.1] - 2026-10-21

### Fixed
- Phone: the bottom menu bar stayed tidy with all areas. The labels are shorter ("Home", "Wishes", "Sizzle", "Options") and no longer run into each other, even on narrow phones.
- SizzleBrothers: on the Sizzle page the inventory selector no longer appears at the top on a phone, because it has no effect there. The tabs "Wishlist", "Order list" and "Settlement" now also fit on very narrow screens.

## [0.33.0] - 2026-10-21

### Added
- SizzleBrothers wishlist: new "SizzleBrothers" area for a shared group order from the sizzlebrothers.de shop. Via "Choose products from the shop" you can select all products of the shop, with a small image, variants (for example 250 ml or 500 ml), price and quantity; a search and a filter by product type help you find things. On the wishlist the products appear with an image, and everyone sees who wants what.
- SizzleBrothers order list: on the wishlist you can tick products into the order list. Identical products from several people are combined there. The price initially comes from the shop and can be changed, for example because of a discount; this price then applies to the settlement, even if the shop price changes later.
- SizzleBrothers settlement: shows what each person has to pay and can be saved as a CSV file (for Excel) or copied as text, for example for the messenger.
- Current prices and products: the shop's products and prices are synchronized with the shop automatically several times a day. With "Update prices" in the selection dialog this also works immediately; new products then appear right away, products no longer offered disappear from the selection, existing wishes are kept.
- Permissions per user: under "Users" in the settings you can define for each account whether it may see the filament management and/or the SizzleBrothers wishlist. Without permission the menu items are missing and direct access is not possible either. Your own account and the settings are always reachable.
- Super admin: a super admin always sees both and is the only one who may change permissions and appoint super admins. Other admins can neither change nor delete super admin accounts nor reset their password. There is always at least one super admin.

### Changed
- New users get the filament management by default, but not the SizzleBrothers wishlist. Existing accounts keep the filament management.

## [0.32.0] - 2026-10-20

### Added
- Spools: unopened spools now show with their own icon whether they are "filament with spool" (spool with flange and hub) or a "refill" (filament roll without a spool in an arrow circle). The spool is subtly green, the refill subtly red. A mouseover shows the text; on a phone a tap on the icon shows the name in a small speech bubble above the icon, which disappears after a few seconds or when tapping elsewhere. In the list there is a new "Delivery form" column between manufacturer and remaining weight; in the tiles the icon sits at the bottom left of the color area, in Standard and Compact next to the weight or the pill.

### Changed
- Spools: the pill on unopened spools now only shows "Unopened". The delivery form is now in the icon next to it.
- Update notice: when a new version is available, a blue bar now appears across the full width at the top (also on the login page) with the "Refresh" button. The app now checks for new versions more reliably: on opening and reloading, when you return to the tab and after reconnecting to the server. The button reliably loads the new version, also in Safari. The English texts are now "A new version is ready. Please refresh to use the current version." and "Refresh".

## [0.31.0] - 2026-10-17

### Added
- Wishlist, order list: you can enter the price per spool for each item (with comma or dot). The row total appears immediately. If a guide price is stored for the material, it is offered as a suggestion. Shipping and discount can also be entered per manufacturer.
- Wishlist: new "Settlement" view. It shows goods, shipping, discount and total per manufacturer and what each person has to pay. Shipping and discount are distributed among the people by goods value, accurate to the cent. If an item has no price, the settlement points this out. It can be saved as a CSV file (for Excel) or copied as text, for example for the messenger.
- Bambu Lab: the catalog now contains all filaments of the Bambu Lab shop with all colors listed there, for example PLA Wood (incl. Classic Birch), PLA Matte with all 25 colors (incl. Ash Gray), PLA Marble, Galaxy, Sparkle, Metal, Glow, Aero, Translucent, Pure, Silk+, Silk Multi-Color, Basic Gradient, Tough+, PETG Matte, PETG-CF, TPU for AMS, TPU 85A/90A, ABS-GF, ASA-CF, PC FR, PET-CF and many more. This applies to spool management and to the wishlist.

### Changed
- Wishlist, order list: identical wishes (same manufacturer, same material, same color) are combined into one item, for example "3x Bambu Lab TPU Black" with a note on who wants how many. Selecting, status and price apply to the whole item. Editing and deleting still work individually per wish.
- Wishlist: when adding a new wish, the manufacturer is now pre-filled with the default manufacturer from the settings (the same as for "New spool"). It can be changed at any time or set to "Any manufacturer". After saving, the default manufacturer is in the form again.
- Wishlist and spools: Bambu Lab color names now match the names in the shop. Spools already created keep their color name. As a result, when importing from the printer, a white PLA Basic spool gets the name "Jade White" instead of "White", for example.

### Fixed
- Spools: when you switch manufacturer or material in the form, you no longer keep a color the new material doesn't offer (for example "Gray" for PLA Matte). Custom colors typed by hand are kept.

## [0.30.0] - 2026-10-17

### Added
- Wishlist: new "Order list" view for the group order. It shows everyone's wishes, sorted by manufacturer. With the checkbox you choose what is really ordered and can deselect it at any time. Per manufacturer there are "Select all" and "Clear selection" as well as the total of the selected spools. "Show selected only" hides the rest.
- Wishlist: per manufacturer you can mark the selection as "ordered" or "done" with one click. The status applies in the order list and the wishlist at the same time. Wishes that are in the order list are marked in the wishlist.
- Wishlist: search and filters by status, manufacturer, material and the person who added the wish. They work in the wishlist and in the order list.

### Changed
- Wishlist: the quantity is now always shown, even for a single spool ("1x").
- Wishlist: on the phone the status wraps below the title instead of squeezing the title.

## [0.29.2] - 2026-10-10

### Changed
- Spools: "Spools per page" is now also remembered per device instead of per user, just like the view. A phone can, for example, show 12 per page while the desktop shows all. On a device where you haven't chosen anything yet, the default applies.

## [0.29.1] - 2026-10-10

### Changed
- Spools: the chosen view (Standard, Compact, List, Color tiles) is now remembered per device instead of per user. So iPhone and desktop can have different views. On first opening on a device, a narrow screen starts in "Compact", a wide one in "Standard"; "Spools per page" still applies to the whole account.

## [0.29.0] - 2026-10-10

### Added
- Wishlist: a color can now be chosen for each wish. The "Color" field offers the colors of the selected manufacturer and material (as when creating a spool) and completes the title. The color appears with a color dot in the list.
- Wishlist: "Add to wishlist" on a spool now also takes over its color.

### Changed
- Spools: the "Spools per page" selector is now at the top next to the filters instead of at the very bottom below the list.
- Spools, list view: the list now fits on the screen and no longer needs to be scrolled sideways. It only shows color, manufacturer and material, remaining weight, storage location and status. A click on the row (or the arrow on the left) expands everything else: temperatures, remaining length, price, dates, delivery form, note and custom fields. The arrow in the header expands or collapses all at once. To sort by an expanded detail, click its heading.
- Spools, list view: new "Normal / Compact" switch for the row height. The browser remembers the choice.
- Spools: "Add to wishlist" is now its own button (bookmark) on each spool instead of in the three-dot menu. Low spools (at most 15 % left) show the "Reorder" button instead in the list and the standard view. If a spool is already on the list as an open or ordered wish, the button is grayed out, so no duplicate entry arises.

## [0.28.0] - 2026-10-09

### Fixed
- Spools already imported from the Bambu cloud get the correct color name once on update (e.g. a light green was wrongly called "Gray"). Only names the import itself assigned are changed; names changed by hand stay untouched. Every rename appears in the spool's change log.

### Added
- Bambu Lab PETG Basic: color "Natural" in the color buttons (the color value is estimated, the shop has no color swatch for it).

## [0.27.1] - 2026-10-09

### Fixed
- Installed app on the iPhone (iOS 26/27): the top edge below the status bar looked blurred. There is now an invisible strip at the top edge that gives iOS a fixed reference point with the page color. After the update, close the app completely once (swipe up in the app switcher) and reopen it. Whether the edge really becomes sharp can only be checked on a real iPhone with iOS 27 - the effect cannot be reproduced in the browser or simulator. If it doesn't help there, please report it.

## [0.27.0] - 2026-10-04

### Added
- Spools: new "Multiple spools" button for quickly creating many spools at once. Choose manufacturer and material, click the colors (each click adds a spool to the list, repeated clicks count up, +/− changes the quantity) and create everything with one click. You can switch material or delivery form in between; the price is suggested per material and delivery form and can be changed in the list. Storage location and "already started" apply to all spools.
- Bambu Lab PETG Basic and PETG Translucent now have their own color lists (names from the Bambu Lab shop) in the color buttons.

## [0.26.1] - 2026-10-04

### Fixed
- Bambu import and automatic sync: colors now get the right name. Previously, for example, a light green was named "Gray" because only similar numeric values were searched instead of the color impression. Now the name is chosen the way the human eye sees the color, the list additionally knows light green, dark green, light blue, light gray, dark gray, magenta and dark red, and if the color value exactly matches a known color of the manufacturer (e.g. Bambu Lab PLA Basic "Bambu Green"), its name is used. Spools already created keep their name and can be changed in the spool if needed.

## [0.26.0] - 2026-10-04

### Added
- New spool: the purchase price is now suggested. First the last entered price for the same material of the same manufacturer applies (color doesn't matter, used-up spools count too), otherwise the material's guide price. A price changed by hand stays unchanged.
- Spools have a delivery form: "Filament with spool" or "Refill". It can be chosen in the form for spools not yet started and appears in the list (new sortable "Delivery form" column), on the cards ("Unopened · Refill") and in the Excel/CSV export. Refill and spool each get their own price suggestion.
- Settings → Filaments: materials have two guide prices (with spool / refill). For Bambu Lab, the lowest tiered prices (from 10 spools) from the Bambu Lab shop of 4 October 2026 are stored, e.g. PLA Basic €11.99 with spool and €10.19 refill, PETG Basic €11.39 / €9.59. New in the catalog: Bambu Lab PETG Basic and PETG Translucent.

## [0.25.1] - 2026-10-04

### Fixed
- Bambu import and automatic sync: empty entries without a material (visible in Bambu Studio only as "Bambu Lab" with 0 g) are no longer created as a spool with the material "Filament" but skipped. A spool already created that way is archived on the next sync.

## [0.25.0] - 2026-10-04

### Added
- Spool list: a click on a column heading sorts the whole list by that column, another click reverses the order (ascending and descending). Spools without an entry (e.g. without price or storage location) always come last. The "Sort by" selection in the search resets the sorting.

## [0.24.0] - 2026-10-01

### Added
- Spool list: new "Changed on" column shows when a spool was last edited - manually or by the automatic Bambu cloud sync/print consumption, but only if something actually changed. Without a previous change, the added date is shown. Both date columns now also show the time. New "Changed on" filter (from/to) in the spool search.

## [0.23.2] - 2026-10-01

### Fixed
- Spool form: after choosing a manufacturer with its own brand names (e.g. Bambu Lab "PLA Basic"), foreign generic entries also appeared in the material dropdown (e.g. a generic "PLA" this manufacturer doesn't actually carry). Now only the manufacturer's own products are shown; the general list only appears if the manufacturer has no material of its own.

## [0.23.1] - 2026-10-01

### Fixed
- Bambu cloud import/sync: a spool already in stock that was unopened was not recognized and was created twice instead, if its hand-entered color value deviated only slightly from the value actually reported (e.g. "White" as #FFFFFF instead of the #F5F5F0 reported by the cloud). Automatic matching now also treats very similar colors as equal.

## [0.23.0] - 2026-09-30

### Added
- The color selection buttons in the spool form now show the real color names of the respective manufacturer and material (e.g. Bambu Lab PLA Basic "Jade White" instead of just "White") instead of a general list.
- Settings → Filaments: new "Default manufacturer" that is preselected when creating a new spool (changeable in the form at any time).

## [0.22.7] - 2026-09-30

### Added
- Dashboard: new "Needs attention" area shows failed prints, disconnected printers and almost empty spools at a glance, each clickable to the matching page.
- Dashboard: consumption chart (as on the statistics page) and new "Remaining stock by material type" overview.

### Changed
- Spool search and filters swapped: the filters are now permanently visible, the manual search can be expanded and collapsed instead.

## [0.22.6] - 2026-09-29

### Fixed
- The title bar at the top wrongly showed "Dashboard" instead of "Wishlist" on the wishlist page.
- The list view of the spools could, in narrower windows (e.g. 1024 px), make the whole page scroll sideways instead of just the table itself.

## [0.22.5] - 2026-09-29

### Security
- When creating a backup, commands to the operating system had always been assembled via a shell; a malicious or hijacked admin account could have used this to inject its own commands on the server. It now runs without a shell and can no longer be abused.

## [0.22.4] - 2026-09-29

### Changed
- The remaining-weight percentage is now shown in all four views (Standard, Compact, List, Color tiles), not just in two.
- The "Remaining weight in %" filter now uses even 10 % steps (10 to 90) instead of irregular levels.
- Better readability of gray hint text (e.g. manufacturer, hex codes) through darker contrast.
- The manufacturer/material list in the settings now aligns "Edit/Delete" to the right instead of sticking to the name.
- Short number fields in the system settings are no longer stretched unnecessarily wide.
- A spool's three-dot menu now has a slightly larger click area.
- Dialogs on the smartphone now darken the background (including the bottom navigation bar) more clearly.

### Fixed
- On the smartphone the menu items "Wishlist" and "Settings" were cut off at the bottom ("Wishli…") instead of being shown completely.
- The heading "Filament stock" squeezed in next to the buttons on the smartphone and wrapped in the middle of a word.

## [0.22.3] - 2026-09-29

### Added
- New "Remaining weight in %" filter: shows only spools with at most the selected percentage of the initial weight (10/15/20/25/30/50/75 %).

### Changed
- The standard view now shows the remaining-weight percentage right next to the gram value, like the list view.

## [0.22.1] - 2026-09-29

### Fixed
- Since 0.22.0 the server no longer started (crash right at startup) because a file needed for the backup version notice was missing from the built program. Affected installations did not come up at all (login and email sending did not work either).

## [0.22.0] - 2026-09-28

### Added
- Newly created spools are now "unopened" by default until they are actually used (first remaining-weight change, weighing, print or AMS assignment) - or you mark a spool as opened by hand. When creating, this can be overridden with "This spool is already started".
- The filament stock now shows "Unopened" and "Started" as two separate sections with count and total weight, plus a new "Unopened only" filter and a tile on the dashboard and statistics.
- When importing from the Bambu cloud, the preview now detects when a "new" spool is probably already in your own stock as an unopened spool, and suggests linking it instead of creating it twice. For the automatic Bambu sync and the Spoolman import, this happens automatically on a unique match so the stock isn't counted twice.
- Statistics: consumption can now additionally be broken down by printer, compared with the equally long period before, and exported as a CSV file.
- Backups now remember which FilaPilot version they were created with. When restoring a backup from a different version, a notice appears (non-blocking).

## [0.21.3] - 2026-09-28

### Added
- Custom fields can now be marked as required - a spool then can no longer be created or changed without a value for them.
- Wishlist: the selection from the manufacturer/material dropdowns is now saved as a real reference (not just as text) and shown in the list.
- Inventory owners can now open a "History" button for their own inventory and see everything that happened in it - previously this was reserved for admins.

### Fixed
- A server restart in the middle of a running print caused automatic consumption to be lost for exactly that job. The intermediate state is now also saved and survives a restart.

## [0.21.2] - 2026-09-27

### Added
- Empty weight and weighing: for each spool the empty weight of the empty spool can be stored. The new "Weigh" action then only asks for the total weight read from the scale and calculates the remaining weight itself.
- Import from Spoolman: new "Import from Spoolman" action on the spools page - loads the export of your own Spoolman instance as a file, creates missing manufacturers/materials and recognizes already imported spools.
- The bundled manufacturer/material catalog was expanded considerably (10 new manufacturers, about 20 more materials).
- Instead of a single bed temperature, a material can now also store a range (e.g. "60–80 °C").
- Wishlist: new "Remove completed" button clears all completed entries at once.
- Settings → General: the duration for which a login stays valid is now adjustable (7–90 days, default still 30).

### Fixed
- Which version of the change log you have already seen is now remembered in your own account instead of only in the browser - so the notice button no longer blinks again on every new device.
- When an admin deletes a custom field, existing values of that field are now removed from all spools instead of staying stored invisibly.
- Deleting a spool that is still assigned to a printer AMS slot failed. The slot now simply becomes empty instead of preventing the deletion.

## [0.21.1] - 2026-09-27

### Fixed
- On the phone, the labels "Manufacturer" and "Material" overlapped unreadably in the wishlist form. The form now arranges the fields in two columns on narrow screens.
- The spool list showed a confusing row of individual text links per spool (Edit, Archive, QR label, History, Log drying, Add to wishlist, Delete) that wrapped over several lines on the phone and in the list view. All views now show the actions uniformly via a three-dot menu.

### Changed
- The filters of the spools page (manufacturer, material, color, storage location, remaining weight, purchase price, sorting) are now collapsed behind a "Filter" button instead of permanently taking up almost half the page. The search stays visible.

## [0.21.0] - 2026-09-27

### Added
- Drying log: every spool now has the action "Log drying" (temperature, duration, optional note, e.g. for PETG, nylon or TPU). The entry appears together with the other events in the spool's history.

## [0.20.1] - 2026-09-27

### Fixed
- A spool's history previously showed nothing when it was imported from the Bambu cloud or changed by the cloud sync (only a collective entry was written for the inventory). Now each spool gets its own entry for this: creation, remaining-weight change, and archiving/restoring by the sync. A sync without a real change still creates no entry.
- The entries in a spool's history only showed description, date and person - not what had changed. Now it shows whether it was created/changed/an event, and for changes directly "before → after" (e.g. remaining weight).

### Changed
- In the Bambu cloud import, "Remember connection for this inventory" is now ticked by default (owners can still remove the tick).

## [0.20.0] - 2026-09-27

### Fixed
- The CSV/Excel export opened as an empty page when clicked instead of as a download. Reason: the app remembers pages for offline use (PWA) and wrongly took the export link for one. The download now works differently (loaded in the background, then saved) and can no longer be disturbed by this.

### Added
- Real Excel export (.xlsx) in addition to CSV and JSON - numbers and dates stay numbers and dates in Excel, not just text.
- When adding to the wishlist, manufacturer and material can now be chosen from a list as when creating a spool, instead of only typing free text.
- New "Add to wishlist" action on every spool: creates a wish with the spool's manufacturer, material and color with one click - handy for reordering.

## [0.19.0] - 2026-09-27

### Added
- Wishlist (new menu item): a list for the whole installation, intended for a group order. Everyone sees who added what and when. Only the person who created the entry, or an admin, may change or delete title, note and quantity - but anyone may set the status (open/ordered/done) so everyone can take part.
- Custom fields: under Settings → Filaments you can freely create your own fields (e.g. "Batch", "Rating", text/number/date/yes-no). They then appear in every spool's form.
- Two-color filament: when creating a spool a second color can be specified; the color display then shows both colors.
- Filament diameter: materials can be set to 2.85 mm (default remains 1.75 mm); the remaining-length display calculates with it.
- Note per spool (e.g. impression while printing) and a "History" button that shows the change log of exactly this spool.
- Export of the filament stock as a CSV or JSON file (links on the spools page), including remaining length.

### Fixed
- The CSV export opened in Excel with a German language setting as a single column instead of split into columns. It now separates with a semicolon instead of a comma, as German Excel expects on double-click.

## [0.18.0] - 2026-09-27

### Added
- Materials now have a density (g/cm³) - already filled with typical values for the bundled materials (e.g. PLA 1.24, PETG 1.27, ABS 1.04). It can be entered or adjusted per material under Settings → Master data.
- The list view of the spools now shows an approximate remaining length in meters (from remaining weight and density, default diameter 1.75 mm) - an approximation, not a measurement. Without a known density for the material a dash appears.

### Fixed
- The change log in the app ("i" button) did not show versions 0.15.0 to 0.17.0, or only incompletely, because the heading "Hinzugefügt" (with umlaut) in this document did not match the expected spelling. All three versions are now fully visible; the features themselves were not affected.

## [0.17.0] - 2026-09-27

### Added
- Automatic consumption per print: in the printer settings you assign a spool from FilaPilot to each AMS slot (and the externally loaded spool). When a print starts and ends, FilaPilot books the consumption automatically based on the AMS fill level, creates a print job with weight and cost, and updates the remaining weight. Failed prints are marked as such, but the consumption is still booked.
- The statistics page shows "Latest print jobs" with printer, spool, weight, cost and date.
- Known limitation: the AMS field names in the printer status come from publicly known documentation, not verified on a real printer; the AMS fill level in percent refers to the weight the printer knows (not necessarily the initial weight stored in FilaPilot) - the gram figure is an approximation; a server restart during a running print loses the detection for that one job.

## [0.16.0] - 2026-09-27

### Added
- Four views of the spool list: Standard, Compact (small tiles, actions in the menu), List (table with all details: color with color code, manufacturer, material, nozzle and bed temperature, remaining weight, storage location, price, purchase date, added date, status) and Color tiles. The last chosen view is saved per account and shown again on next opening (also on another device). On narrow phones, new accounts start in the Compact view.
- The number of spools per page is adjustable (12, 24, 48, 96 or all) and is also remembered in the account; below there are Back/Next.
- On the spools page, for connected inventories, you can see when it was last updated from the Bambu cloud (date, time, automatic or by hand), whether automatic updating is on and, if the last attempt failed, why.
- Automatic sync with the Bambu cloud for all inventories with a saved connection. The admin sets the interval under Settings → General (off, or every 1, 3, 6, 12 or 24 hours). An error is noted and not repeated immediately; an expired token disconnects the connection as with the manual sync.

## [0.15.0] - 2026-09-26

### Added
- Search and filter spools: search field (manufacturer, material, color, storage location) as well as filters by manufacturer, material, color, storage location, remaining weight (from/to), purchase price (from/to) and "Almost empty only". The list can be sorted by material and color, manufacturer, remaining weight, purchase price or most recently added.
- Counts: above the list it shows how many spools are recorded ("5 of 12 spools", with the number of archived ones if needed) and the total remaining weight of the displayed spools.
- Settings → Inventories → "Move spools": move all spools of an inventory (also archived ones) together with their consumption history to another inventory. This requires owner rights in the source inventory and edit rights in the target inventory.

### Fixed
- When a single spool is moved to another inventory, its consumption history now moves along, so the statistics of both inventories are correct.

## [0.14.6] - 2026-09-26

### Fixed
- Bambu import: if "Update remaining weight of already imported spools" is ticked, all already imported spools are updated even if no new spool is selected. Previously the button stayed locked at "Import 0".

## [0.14.5] - 2026-09-26

### Added
- Statistics over time: on the statistics page a chart shows consumption per day, week, month or year (switchable), plus the consumption in the period, the cost (from the spools' purchase price) and the breakdown by material type and manufacturer. It applies to the chosen inventory or to "All inventories". Archived spools count too.
- Since the update to 0.14.3, consumption is recorded with a date. Earlier consumption has no date and only appears in the totals. The day counted is the day the weight was changed or synced with the cloud, not the day of the print.

## [0.14.4] - 2026-09-26

### Added
- Bambu connection per inventory: when logging in in the import dialog, an owner can choose "Remember connection for this inventory". FilaPilot then stores only the access (encrypted, never your password). Each inventory has its own connection, so you can use a different Bambu account in one inventory than in another. Without password and without code until the access expires (about 90 days), after which you log in again once.
- New "Update from cloud" button on the spools page (for a connected inventory), without selection: existing spools get the current remaining weight from the cloud, new spools are created, and spools removed in the cloud are archived as done. If a spool reappears, it is restored. Spools archived by hand are left untouched.
- Protection against errors: if the list from the cloud is empty, incomplete or an unusual number of spools is missing, nothing is archived, and FilaPilot points this out. For spools from the cloud the cloud wins: a remaining weight changed by hand is overwritten on the next sync.
- The import with selection also works without logging in again for a connected inventory ("Choose spools …").

## [0.14.3] - 2026-09-26

### Added
- Archive spools: instead of deleting an empty spool, you can archive it. It disappears from the stock (and from "Almost empty"), but its consumption stays in the statistics. With "Show archive" you see archived spools, with "Restore" you bring them back.
- FilaPilot now records every change of the remaining weight with a date. This is the basis for the planned statistics by day, week, month and year. It counts from this update on; earlier consumption has no date.

### Changed
- When deleting a spool, FilaPilot points out that its consumption then disappears from the statistics and recommends archiving.

## [0.14.2] - 2026-09-26

### Fixed
- Import from the Bambu cloud: after logging in with password, the entry of the verification code did not appear, but an error message, even though Bambu had sent the code by email. The code step now works, and no unnecessary emails are triggered anymore: a new code is only requested on demand ("Send code", at most once per minute).
- Error messages during import now name the step and the HTTP status (for example "Step: spool list, HTTP 400") so that problems can be narrowed down better.

## [0.14.1] - 2026-09-26

### Fixed
- After the update to 0.14.0, the spools page could get stuck with "An unexpected error occurred" because the database sync did not run during the update. With this version the update runs through again without manual work.

## [0.14.0] - 2026-09-26

### Added
- Import from the Bambu cloud: on an inventory's spools page there is the button "Import from Bambu cloud". You log in with your Bambu account (with the code Bambu emails you if needed), see a preview of your spools from Bambu Studio and choose which ones to take into this inventory. Manufacturer, material, color and remaining weight are taken over. FilaPilot creates missing manufacturers and materials itself.
- Already imported spools are recognized and not created twice. On a repeated import you can update the remaining weight of already imported spools.
- If automatic login doesn't work, you can use a saved filament list (JSON file) instead.

## [0.13.0] - 2026-09-26

### Added
- Multiple inventories: you can keep several separate filament stocks, for example "Workshop" or "Office". Each inventory has its own spools, its own printers, its own dashboard and its own statistics. You switch between inventories at the top of the sidebar (in the header on the phone). "All inventories" shows an overview with the figures of all inventories compared.
- Each inventory has members with roles: owners manage the inventory, its members and printers, editors maintain the spools, viewers may only look. Anyone who is not a member does not see the inventory at all.
- Anyone can create a new inventory under Settings → Inventories and name it freely, rename it and choose a color.
- A spool can be moved to another inventory (in the "Edit spool" dialog).
- An inventory can be deleted together with its spools and printers. To confirm, you have to type the inventory's name.
- The change log shows the inventory for each entry and can be filtered by it.

### Changed
- Printers now belong firmly to one inventory. They can be created and changed by the inventory's owners, no longer only by admins. A printer's live status only goes to the members of its inventory.
- Newly created users initially see no inventory: an owner or admin has to add them as a member, or they create an inventory themselves.

## [0.12.1] - 2026-09-26

### Fixed
- Login did not work when FilaPilot was opened in the home network via a normal http:// address (e.g. http://192.168.1.50:8090), because the browser did not store the login cookie there. Via https:// (e.g. with a reverse proxy) it already worked before and remains unchanged.

## [0.12.0] - 2026-09-26

### Added
- There is now an "i" icon at the top right. There you see what changed in which version. If there is something new, the icon blinks red until you have clicked it once.

## [0.11.0] - 2026-09-25

### Added
- You can now save a photo for each spool, for example taken directly with the phone. It is shown on the spool card. This only works if an admin has switched on "Allow photo upload for spools".
- Spools that are almost empty (less than 15 % left) are now marked "Almost empty".
- In the statistics you now also see consumption by material kind, for example all PLA types together.
- Admins can upload a downloaded backup again, for example when moving to a new device.
- The change log now also contains logins and logouts as well as automatic processes such as the nightly backup.

### Security
- The live status of the printers is now only visible to logged-in users.

## [0.10.0] - 2026-09-24

### Added
- Admins can set how long the change log is kept (Settings → System → General, default 12 months, 0 = forever). Older entries are deleted automatically at night.

## [0.9.0] - 2026-09-24

### Added
- New change log (Settings → Log, admins only): who created, changed or deleted what and when? With search and filters by period, area, action and user. Passwords and access codes are never logged.
- The user list now also shows when someone was last active.

## [0.8.0] - 2026-09-24

### Added
- Old backups are deleted automatically. How many are kept (default 14) is set by admins under Settings → System.
- A backup can be downloaded to your own computer.
- The user list shows when an account was created and when the user last logged in.

## [0.7.0] - 2026-09-24

### Added
- Overview of all existing backups with date, content and size (Settings → System).
- A backup can be restored (admins only, with a confirmation word). Before that, the current state is backed up automatically, and on an error everything stays unchanged. Photos are restored as well. This makes moving to a new device possible.

### Fixed
- After a move, the stored email password caused errors when creating users. Now there is no error anymore, you simply enter the email password once again.

## [0.6.0] - 2026-09-24

### Added
- View for the smartphone, also as an installed app: the navigation is at the bottom of the screen, cards and dialogs adapt to the size, and you find logout under Settings → My account.

## [0.5.0] - 2026-09-23

### Added
- Setup screen: on first start you create the first administrator directly in the browser, with your own password.

## [0.4.0] - 2026-09-23

### Added
- Admins can edit and delete users and reset their password. The last admin and your own account are protected.
- A button sends a test email and shows the mail server's exact error message if there are problems.

## [0.3.2] - 2026-09-23

### Changed
- The settings are divided into tabs: My account, Users, Filaments and System. Normal users only see "My account".
- Everywhere it now says "Benutzer" instead of "Nutzer".

### Fixed
- The "Refresh" button in the update notice now reliably loads the new version. The notice appears at the bottom right and no longer covers the header.

## [0.3.1] - 2026-09-23

### Fixed
- When the database briefly did not respond, the whole app failed. Now an error message appears instead, and the app keeps running.

## [0.3.0] - 2026-09-23

### Added
- You first choose the manufacturer and then the material. Only matching materials are offered. About 70 materials with guide temperatures are already pre-filled.
- The temperatures (nozzle and bed) are shown in the spool dialog and on the spool cards.
- Admins can create, change and delete manufacturers and materials in the settings. Deleting is not possible as long as spools still use the entry.
- In the email settings you now choose the encryption from a list (STARTTLS port 587 or SSL port 465).

### Fixed
- If email sending fails, the user is still created and the initial password is shown.

## [0.2.3] - 2026-09-23

### Added
- When a new version is available, a notice with the "Refresh" button appears. Ctrl+F5 is no longer necessary. It is checked on opening, when returning to the tab and every 15 minutes.

## [0.2.2] - 2026-09-23

### Changed
- All selection lists are now sorted alphabetically.
- When logging in and resetting the password, upper and lower case of username and email address no longer matter. Duplicate users in a different spelling are rejected.

## [0.2.1] - 2026-09-23

### Fixed
- Buttons and select fields now show the hand as mouse pointer.

## [0.2.0] - 2026-09-22

### Added
- Every spool has a printable QR label with material, color and manufacturer ("QR label" action on the spools page).
- New statistics page: total spools, consumed filament, remaining stock and spools with low stock, plus consumption by material and by manufacturer.

## [0.1.0] - 2026-09-22

### Added
- Forgot password: an email brings a link that is only valid for a short time.
- Every user can choose their own accent color in My account and reset it again.
- Settings for admins: photo upload, printer polling interval, backup, email server and user management.
- A backup is created automatically every night.
- Printer management for Bambu Lab: live status, setup guide that can be expanded. The printer's access code is never displayed.

### Fixed
- Backups failed with an error message. Now they work.
- Resetting the password could not be completed without an email server. Now the link then appears in the server log.
- Unreachable printers blocked the connection setup for a long time. Now an error message appears quickly.
- The spools page got stuck at "Loading…" on a loading error. Now an error message with the "Retry" button appears.

## [0.0.2] - 2026-09-21

### Added
- You now choose the manufacturer from a list of known manufacturers instead of typing it. The list can be maintained in the settings.
- The version number is shown at the top right in the app.
- The app now has its own icon (spool) in the browser and on the home screen.

## [0.0.1] - 2026-09-20

### Added
- First version: login with forced password change on first login, as well as creating, changing and deleting spools.
