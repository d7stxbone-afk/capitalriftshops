# Capital Rift Command Center v0.9.7

## v0.9.7 Building-only Scout and Deals

- Building-only Scout and Deals surveys now reuse previously observed building unit records when a live game chunk contains the building ref but its index anchor is not in the requested chunk. The mixed Scout survey already used those records; building-only surveys could show zero matches in the same view.
- Building-only results still contain buildings only. The dense-chunk cache-read guard from v0.9.6 remains in effect.

## v0.9.6 Dense Scout and Deals surveys

- Scout and Deals can survey dense game chunks with over 10,000 building references. Building results use the already loaded index; unit cache reads in such chunks are limited to buildings with previously observed units.
- The game still limits how many building details are fetched per survey. Unobserved unit details remain unknown until the game exposes them.

## v0.9.5 Community Intel route

- Community Intel public channel reads now use Capital Rift's `/api/social/…` endpoints. This fixes the HTML response and JSON parse error seen when resolving channels in the live game.
- The live game bundle confirms the API prefix. The packaged regression suite checks the route; the updated extension still needs a browser reload for an end-to-end check.

## v0.9.4 Repeat Scout searches

- A new Scout/Deals survey now compares the game viewport at the beginning and end of **that** request. It no longer rejects a second search merely because it is in a different area from the last completed survey.
- Actual movement or loss of a verified viewport while the request is running still prevents stale results from overwriting the current view. Retrying once the view settles works normally.

## v0.9.3 Scout room handoff

- Scout and Deals now show the selected room's exact game unit key, parent building, floor, and area when you choose **Find room in game**. They still move the camera to the verified building location when one is available.
- If the open CapitalRift building panel exposes a unique, visible `data-unit-key` or `data-room-key` matching that exact room, **Find exact room in open game panel** clicks its game row. When the game does not expose a matching row, the target panel remains visible for manual identification; no other room is clicked based on a generic name.
- This does not bypass the game's own listing or availability checks. The project has no verified direct deep link or game command that opens a closed building panel to a room. A live game session is needed to confirm whether the current room panel exposes these stable DOM keys.

## v0.9.2 Active company switching

- The Transactions tab checks CapitalRift's current `/me` identity when opened and every 15 seconds while visible. A changed company triggers a fresh account read and switches the tab to the new company's separate log. The refresh button also checks the current company first. This does not poll transaction endpoints.
- An incomplete pilot response keeps the last company available as clearly cached, read-only data, without requesting its operational feed or describing it as the current pilot. A newly confirmed company name is resolved by its ID from the available-company list; the previous company's name is not reused.

## v0.9.1 Company transaction log

- The **Company → Transactions** view lists individual bank entries from the currently piloted company's authenticated account feed, including timestamp, game transaction ID, source bank, description, amount, kind, and any explicit initiator or recipient field. It offers text, actor, kind, date and amount filters, outflow and review views, and a filtered CSV export.
- Entries are deduplicated by bank and game transaction ID, retained locally across partial refreshes, and separated by signed-in personal ID and company ID. Cached company entries remain read-only after unpiloting; only the currently piloted company is fetched for fresh operational data. Up to 5,000 latest entries per company and eight company scopes are retained.
- Review flags identify certain outflow kinds and large withdrawals for manual inspection. They do not establish wrongdoing. Supplied CapitalRift bank examples do not name an initiating member, so those entries display **Actor unknown**; recipient and beneficiary names are never substituted for the initiator.
- The game's bank feed may provide only a recent transaction window. The extension can preserve entries it observes after installation, but cannot reconstruct older individual transactions from aggregate income history. Live game verification is still needed for current bank response coverage and actor fields.

## v0.9.0 Cache-aware Scout and Community Intel

- Scout first reuses recent Command Center building chunks, then reads individually requested, fresh schema-2 chunks from CapitalRift's own IndexedDB, and finally falls back to the official bounded chunk GET. The game cache is read-only and uses its five-day freshness rule. Scout shows current-survey cache, network, candidate, detail, and optional geometry counts.
- The optional geometry reader uses a chunk-scoped index when available. It sends only small ref, render archetype/subtype, height, skyscraper and bounding-box hints. Advanced Scout filters are labeled render geometry hints; official building-info remains authoritative for area, floors, value, occupancy and ownership.
- Community Intel resolves Dev Announcements, General, Bug Reports, and Suggestions dynamically from the game's social summary. The user can request bounded pages, search an extension-side index, inspect forum posts on demand, track new announcements locally and clear only that index. DMs are excluded; social requests are GET-only and never poll.
- Game cache and geometry availability depend on the game's current IndexedDB schema and indexes. If either cannot be read, Scout continues using the existing network path. Live session testing is still required to validate the current social response shape and cache index.

## v0.8.2 Gross history and visible-area survey fixes

- Gross Empire lists all shops in the selected account feed: assigned Gross numbers first, then shops without Gross numbers. The latter now have their usual on-demand and visible-page history controls without assigning or changing a name. An empty account feed is identified explicitly rather than described as a lack of stable Gross numbers. Already observed history for the selected account can also appear in a separate read-only section when its shop ID is absent from the current roster; that section never claims ownership or issues a request for an unconfirmed shop.
- When Capital Rift exposes geographic map bounds but no land-chunk list, Scout and Deals derive the bounded z15 chunk IDs for the official `/api/chunk/{z}/{x}/{y}` building read. At most 100 chunks can be in the view; each click fetches at most six missing chunks, then at most 48 relevant building details. Existing game-requested chunk IDs still take precedence.
- Deals shows building chunks fetched, failures and pending work. Failed or incomplete surveys are not cached as completed, so a later click can continue. A failed chunk request has a short retry cooldown.
- The selected account still determines which shop history can be requested. A game shop in a different or unavailable account will not be silently attributed to the personal account.

## v0.8.0 Read-only intelligence

- Region Intel can request the current verified map view or an account property on demand. The area summary and observed item opportunities remain separate; only structured, account-scoped retail observations populate the product list. Repeated exact locations can reuse a recent areaId-keyed region observation.
- Compare sorts the current account's structured shops by reported game metrics and loads each shop's game history only when requested. Reported-day 7/30 averages, extremes, and descriptive prior-week trend are shown without interpreting the unverified second item-history metric.
- Deals reuses the bounded visible Scout survey with independent building and room area filters, reported ownership, vacancy, value and rent criteria, and transparent per-square-meter calculations.
- Gross Empire reads the existing stable ID assignments, paginates 40 shops, and loads missing history for the visible page with at most four requests in flight. It never renames shops.

These views require genuine observed Capital Rift data. They show unknown fields as unknown, and a game session is needed to confirm live rendering and endpoint responses.

Unofficial Capital Rift companion extension for Chrome/Edge/Opera/Brave.

## Install / update in Edge, Chrome or Opera GX

1. Extract the ZIP to a permanent folder.
2. Open `edge://extensions` (or `chrome://extensions` / `opera://extensions` in your browser).
3. Turn on **Developer mode**.
4. Remove or disable the older Command Center version.
5. Click **Load unpacked**.
6. Select the extracted folder that contains `manifest.json` directly.
7. **Reload the Capital Rift tab.** This matters because the game camera helper is enabled at page startup.
8. Click the extension icon to show/hide the persistent in-game Command Center.

## v0.7.0 Public-company and structured API compatibility

The operational `/api/game/{id}` account remains the source for shops, properties and shop metrics when the company profile or public equity feeds fail. Partial account sections retain the last valid data for the same account ID; explicit empty sections remain empty. A separately cached company account survives a switch through personal mode. An uncertain active account can be displayed but cannot authorize a game-state write.

Shop Health gives `/api/game/{id}.shops` priority for appeal, region busyness, wealth, customer flow, basket size, checkout use, revenue and costs. The Command Center portfolio grade remains separate. The game panel is observed only for explicitly headed local-demand text while Shops is open, every 30 seconds. Scout continues to use canonical `/api/chunk/{z}/{x}/{y}` building refs and bounded `/api/building-info` detail reads. The Tools tab reports active account and operational feed status. The HAR did not contain a public `/api/me` response, so public-account shape compatibility still needs a live session check.

## v0.6.33 Land panel offers

CapitalRift map chunks may expose parcel IDs and appraised `value` without an offer to purchase. This version observes game `/api/land/...` panel reads, including explicit `listing`, `purchaseOffer`, `saleOffer`, or a purchase permission and price. Once you open a parcel's game panel, **Resolve selected** can reuse an observed read URL for other parcels, check their returned IDs, and obtain their current offers; each batch purchase repeats the live check. A missing offer stays **Needs details**. This only works when the game exposes the offer in a readable response; a map chunk appraisal alone cannot certify that land is for sale. Purchase learning also observes a `buy` action sent to a plain land URL and waits for its success response.

## v0.6.32 Land purchase and Scout navigation fixes

Select observed CapitalRift land parcels even when ownership or sale details have not yet appeared. **Resolve selected** or **Resolve all matching** checks the game's land chunks; opening a parcel's game panel can supply further details. A candidate only enters a purchase batch after the game supplies a sale offer and price. **Learn Purchase Action** guides you through buying one unowned parcel normally in the game and saves the request only after a successful response. Each batch parcel requires a fresh game sale offer and price immediately before its purchase; absent or changed offers are skipped. An appraisal is never treated as a purchase price.

Scout's **Open area in game** now checks camera motion and falls back to verified camera controls when the game's exposed camera helper does not move it. Reload the game tab after installing this update, then pan once to load game land chunks before trying to open a property. This fallback still depends on matching game chunk coordinates; it reports when the coordinates cannot be verified instead of claiming to have moved.

## v0.6.31 Mass land parcel buyer

Land scouting now includes an explicitly confirmed **Mass Land Buyer** for real CapitalRift sale-listed parcels in the current survey. Select individual matching parcels or **Select all matching**, set a maximum spend, maximum parcel count, ordering strategy, and price-increase tolerance, then review one batch confirmation. The queue uses stable parcel IDs, deduplicates overlaps, revalidates each parcel immediately before purchase, stops on account/auth/funds failures, skips parcels whose sale state or protected price changed, and supports **Stop after current**. Purchased parcels update the local scout cache without shifting another row into their queue slot.

The buyer does not guess a purchase endpoint. Use **Learn Purchase Action**, then buy one unowned parcel through CapitalRift's normal UI. The extension captures the successful official request shape for that account and only replays fields that can be safely remapped to another confirmed parcel. OSM/map leads, appraisal-only prices, stale parcel observations, and unlisted land cannot enter a batch.

## v0.6.30 Focused Scout and room navigation

Scout now reads only the selected category: Room searches omit parcel storage and land results, Building searches skip parcel and unit records, and Land searches avoid building chunk and detail requests. Switching the search category refreshes the targeted survey. Room area filters include 200 m². The redundant Select button is removed; the navigation button pans to the observed building footprint or, if its exact position has not been captured, to the center of its observed game chunk under the explicit label “Open building vicinity.” A game building chunk can fill in missing coordinates on a newer detail observation without overwriting its name or value.

## v0.6.29 Fetch missing game building chunks

Survey Visible Area now requests only missing or stale `/api/chunk/{z}/{x}/{y}` records for chunk IDs CapitalRift itself requested in the current view, up to six chunks per click with two concurrent GETs. The land-only `/api/world` response previously left Scout with zero building refs until each building was manually opened. Once a building chunk arrives, room and filtered-building searches request bounded `/api/building-info` details for its canonical refs. Unchanged building chunks are reused for ten minutes; duplicate requests share in-flight work and failures cool down before retry. The Scout panel shows remaining chunks and detail candidates. NPC ownership filtering recognizes `landlord.kind: "npc"` when the game reports `owner: null`. Reload the game tab after installing the unpacked extension, then pan and survey; a signed-in game session is needed to verify network permissions and the exact live results.

## v0.6.28 Buildings from game chunks

CapitalRift `/api/chunk/{z}/{x}/{y}` responses contain `base.buildings`, even when `/api/world` reports only land and the `.mvt` tile contains streets and map labels. Scout now indexes canonical building refs and footprints from that response, stores compact records only, and merges them with official `/api/building-info` rooms, ownership, value and area when surveyed. Roads, trees and generic landuse are ignored. Official refs replace duplicate synthetic tile identities. Unchanged chunks reuse their normalized records. Searches needing room or filtered building details inspect at most 48 nearby candidate buildings per click and offer **Inspect more room details** if candidates remain. Building room-count filters now work. Reload the CapitalRift tab after updating the unpacked extension, pan to load game chunks, and survey.

## v0.6.27 Scout room discovery

Room and shop surveys refresh details through the game's observed `/api/building-info` GET for canonical building refs already seen in the visible area. They fetch at most 48 buildings per survey, three at a time, reuse recent detail, and do not send synthetic tile IDs or fetch the whole account. Scout now explains when its survey has land parcels but no observed building details. The vector tile decoder accepts explicitly tagged buildings in generic layers and full-width feature IDs. Actual building layer names and field shapes still require a real `.mvt` response body to verify; HAR request metadata alone cannot establish that a tile contains usable building refs.

## v0.6.26 Faster shop rename and open-shop learning

Open an owned shop in Capital Rift, then choose **Learn from the shop open in game** on the Rename tab. The extension matches the visible shop against the current account using a unique shop ID and verifies the active game account. Rename that shop once in the game to the displayed learning marker; the existing dropdown remains available if the open panel cannot be identified. Bulk rename now runs two independent shops at a time, without the fixed 120 ms pause, and persists only confirmed ID assignments once per completed pair. A failed request stops subsequent pairs, keeps successful writes, and can be resumed with a fresh preview.

## v0.6.25 Menu performance

Shop health capture reuses the identified game panel, reads rendered text only from likely shop panels, and polls every five seconds while the tab is visible. Timestamp-only samples no longer rewrite the shop health cache. Storage notifications update health directly and coalesce other snapshot reads; closed panels and unrelated pages avoid needless redraws. The map tile decoder runs on browser idle time with a bounded queue, so loading the city and opening menus do not have to compete with every Scout footprint decode. These changes preserve the existing shop, scouting and rename workflows.

## v0.6.24 Scout building footprints

Scout now observes the building layer of Capital Rift's already-loaded `/api/maptile/{z}/{x}/{y}.mvt` responses. It decodes only building footprints and stores small location/reference records alongside observed land chunks. When the game subsequently sends `/api/building-info`, its official name, area, owner, rentable units and room details enrich the same building; incomplete land responses preserve known building records. Tile-only buildings have unknown availability, ownership and room data until the game supplies details. The extension does not request every building detail or classify a land parcel as a building.

## v0.6.23 Building names and observed retail signals

- Properties shows **Learn building rename** on owned building deeds with stable refs from the Assets menu. Click it, rename that exact building manually in CapitalRift to the shown learning name, then return to Properties and use **Rename building**. The extension uses the observed game endpoint and verifies current account, ownership, and the building's chunk before any write. Shop Gross numbering stays independent. If CapitalRift uses a new request shape, the learner leaves the button in learning mode rather than guessing an endpoint.
- Shop Health labels the Command Center portfolio grade separately from the game's observed layout appeal. It captures numerical appeal grades and explicitly headed local demand/product gaps from the live game shop panel when reported. Missing sections retain earlier captured values, and demand is marked with the capture time. Game shop panels must actually expose these texts for product-level data to appear.
- Only explicitly triggered shop or building renames change game state. Live CapitalRift verification, including the exact new building rename request and demand-panel wording, remains necessary.

## v0.6.22 Game-loaded-area scouting

- When no public geographic bounds getter exists, the bridge observes the game's own `/api/world` land requests while you pan. It surveys only the requested land chunk IDs, never vehicle/presence/farm/mining/ranch layers or owned-only land refreshes. Game-loaded areas can contain the game's prefetch margin, so these results are not claimed to be exactly on screen.
- Missing chunk responses and building details are reported as partial coverage. A large camera move beyond the last observed land request marks the area stale until the game requests land again. Survey/filter reuse reads captured data without making its own game network request.
- On Edge, Chrome or Opera, extract the updated ZIP, load the folder as an unpacked extension and reload the game tab before testing. Live manual-panning behavior still requires a signed-in game session.

## v0.6.21 Visible-map Property Scout

- **Survey Visible Area** requests verified bounds from a game-exposed map object; it does not invent a rectangle from a camera center, address, or external map search. Map movement marks the previous survey stale, and an older survey cannot replace a newer one.
- Passive CapitalRift chunk responses supply chunk IDs, parcel details and any building details the game includes. Observed building details and rentable units are merged by game reference. Building, room/shop unit and land results retain game IDs and source information. Partial coverage is reported explicitly. A one-time migration of earlier unit caches occurs only when needed; subsequent surveys read room records for relevant property references.
- Building/room/land/shop targets use one filter model with explicit Any, target dependencies, corrected min/max bounds, availability separate from ownership, unknown values, and Clear filters. Filter and sort changes reuse the survey snapshot without another request. Repeated surveys of unchanged bounds reuse a short cache.
- The supplied project exposes a camera setter and passive chunk observations but **does not document a stable public viewport getter or arbitrary chunk-read endpoint**. The extension supports game map objects that expose verified geographic bounds. If the live game does not expose one, Survey can use newly captured land chunk requests while you pan; when neither exists, Survey reports missing coverage. It cannot claim to have checked every visible building when the game sends only parcels or sends building details after inspection. A sanitized live sample of the viewport object and chunk/property requests is needed to verify complete coverage.

## v0.6.20 Scout performance

- Scout searches read compact observed building and account-property indexes, not the complete account snapshot or individual unit rosters. Existing observations migrate once; subsequent building observations update only the affected normalized property and room-size summary. Official unit detail remains available in the property UI.
- Candidate selection rejects distant properties and cheap scalar mismatches before checking observed rooms. A 500 m² room remains eligible inside a much larger building. Searches requiring observed rooms, traffic or ownership skip map leads; if qualifying observed properties lack coordinates, a center-only map request locates them without downloading footprints.
- Nearby map footprints have a 10-minute normalized cache with in-flight request sharing. Identical Scout searches reuse results for 45 seconds; observed building, parcel, account or resolved-location updates invalidate that reuse. Filters refresh after a 180 ms debounce, sorts remain local, and earlier requests cannot replace newer results.
- Add `crccScoutDebug=1` to the game URL to log per-search counts and timings to the browser console; the normal UI stays unchanged. Scouting uses previously observed Capital Rift map chunks and does not request extra game chunks. Map data remains an unverified discovery lead until official game details are observed.

## What changed in v0.5

### Property grouping fixed

Properties are keyed by the Capital Rift **building/property reference**, never by a shop name. A property is shown first, then you can expand it to see the shops inside it.

Search matches:
- property/building name
- city / state / country
- any shop name inside that property

If Capital Rift has not exposed a building reference for a shop, it goes into one explicit **Unresolved shop locations** bucket instead of creating fake properties such as `Gross 220` or `test store`.

### Safer in-game navigation

The extension no longer invents coordinates from shop names.

Navigation priority is:
1. a location learned from Capital Rift's own eye/focus action;
2. a verified Capital Rift property anchor;
3. no teleport until a location is learned.

Use **Learn TP** when a shop/property has no verified location, then click the official Capital Rift eye/focus button for that exact entity. The extension watches the game's own camera call and remembers the location.

Before a saved location is opened, the bridge checks `/api/me` to make sure the active account matches the Character or piloted Company scope. This prevents opening a company property while you are back on the personal account, and vice versa.

### Property Scout rebuilt

The Scout now separates two sources:

**Observed Capital Rift properties**
- building/property data Capital Rift has actually exposed while you play;
- may include real in-game foot traffic, appraisal/price, area, floors and location;
- scored against the current shop targets: **>=110 m², >=2.0x traffic, ideally <=$50,000** when those fields are known.

**Map leads nearby**
- OpenStreetMap/Nominatim autocomplete plus nearby building footprints;
- useful for finding real-world buildings around a city/address/landmark;
- does not claim a building is purchasable in Capital Rift unless it has been matched to observed game data.

The search box now gives place suggestions while you type.

### Deep shop grading

Grades are calculated against **your own shop portfolio**, not a fixed arbitrary revenue target.

Available components and weights:
- Net income vs portfolio — 25%
- Gross sales vs portfolio — 12%
- Margin vs portfolio — 8%
- Region busyness — 8%
- Appeal — 7%
- Local demand / shopper spend — 7%
- Register headroom — 8%
- Stock availability — 8%
- Worker / supply flow — 7%
- Live-vs-smoothed sales — 5%
- Live profit margin — 5%

Only metrics that are actually available are used; weights are renormalized. Every grade therefore shows a **coverage/confidence** level. The final portfolio index is 70% relative portfolio percentile + 30% absolute mechanics score. Negative estimated-net shops are forced to F.

When the game exposes it, Health also shows/uses:
- foot traffic
- appeal multiplier / appeal grade
- shoppers per minute
- spend per shopper
- register utilization
- live takings and profit
- restocking and wages
- stockout warnings
- neighborhood spending ceiling
- worker/supply bottleneck text
- assigned worker and blocked-worker information
- restocker utilization only when both restocker count and direct units/min data are actually available (no guessed utilization)

A neighborhood spending ceiling is shown as a **growth ceiling**, not automatically treated as a broken shop.

### Exact shop numbers + automatic refresh

Shop gross is shown as an exact value such as `$1,048.08/min`, not `$1.0K`.

The extension refreshes Capital Rift account/income data approximately every **5 minutes** while a game tab is open.

### True Net Worth Breakdown

Top level:
- Cash
- Real Estate
  - Land
  - Buildings
  - Rooms
- Vehicles
- Public Shares
- Other Assets
- Reconciliation Difference

Real Estate is one combined category with expandable detail beneath it. The reconciliation line is the game net-worth total minus categories the API exposed separately; the extension does not invent missing values.

### Character and Company are separate

Character and currently piloted Company have separate:
- cash / net worth
- income and expenses
- shops
- workers
- properties
- vehicles
- market orders / market catalog
- history

The company page also includes:
- book value
- progress to the $100M public-company threshold
- retained revenue percentage
- member revenue shares
- revenue accounts when exposed
- permission matrix

### Market Intelligence

Search both goods **and public companies**.

Includes, when Capital Rift exposes the fields:
- last price
- best bid / ask
- spread
- order-book depth
- volume
- day move
- public-company market cap
- thin-market warning
- local watchlist stars / Watchlist-only mode

Open the game's Market / Share Exchange once if you want the extension to passively learn richer read-only fields.

### Historical analytics

Capital Rift documents 24 game days per real day, so one game day = one real hour.

The extension stores:
- ~5-minute snapshots
- hourly game-day snapshots
- 24h, 7d and 30d views

### Rename speed-up

Bulk rename now treats an existing numbered name such as **Gross 106** as permanent when the pattern is `Gross {n}`. It preserves every unique existing number and assigns only unmatched/new shops after the highest number already in use, so adding shops never restarts or reshuffles the old numbering. Duplicate numbers are repaired by keeping the first one and continuing the duplicate at the end.

Shop/building renames and explicitly confirmed mass land purchases are the only optional game-state writes. Every write method must first be learned from an action you manually perform in the official CapitalRift UI.

## Safety boundary

Normal scouting, analytics, market, account and property reads made directly by this extension are **GET-only**.

It does not implement selling, hiring, firing, changing shop prices, moving company money, placing market orders, retiring businesses, or demolishing.

The only optional mutations are explicitly requested learned **shop/building renames** and an explicitly confirmed **mass land-purchase batch**. The land buyer accepts only confirmed CapitalRift sale listings, requires one manual purchase to learn the official request shape for that account, revalidates each parcel before writing, and never purchases external map leads.

OpenStreetMap requests are used only for public place/building discovery and reverse geocoding.

## If a field is missing

Open the relevant official Capital Rift screen once, for example:
- Shop Overview / Profit Pipeline
- Assets
- Income Report detail
- Workers
- Company Terminal
- Market / Share Exchange

The extension passively observes Capital Rift **GET** responses and can remember fields that the base account endpoint does not include.


## v0.6.1 hotfix
- Fixed the in-game **Net worth** tab crash (`arr is not defined`).
- Keeps the v0.6 features: income interval projections, company property purchaser attribution when the ledger exposes an actor, full market scan/watchlist, property grouping, exact shop values, history, and optimized rename.


## v0.6.2 asset-source fix
- Net-worth **Land / Buildings / Rooms** now prefers the same account holdings that back Capital Rift's Assets menu instead of inferring categories from labels.
- Land comes from `landHoldings[]`.
- Building deeds come from `landHoldings[].buildings[]` plus any explicit building-holdings arrays.
- Owned rooms come from explicit room-holdings arrays, with owned listings used only when they expose acquisition/value fields.
- Nested building deeds are also added to property anchors, which improves building names/counts and location matching.
- Net worth shows Assets-derived parcel/deed/room counts and leaves anything the game does not expose as **Reconciliation difference** rather than guessing.


## v0.6.3 continuation + Assets-menu fix
- Numbered bulk renames continue after the highest existing number instead of re-ranking and renaming shops that already follow the scheme.
- Existing unique `Gross N` names stay untouched; only new/unmatched/duplicate shops receive new continuation numbers.
- Net-worth real estate now also consumes passively observed **Assets menu** GET responses, preserving the menu hierarchy for Land, Buildings and Rooms when the base account payload omits those holdings.
- Asset-menu rows are merged with account holdings by stable IDs to avoid double-counting.

## v0.6.4 asset and rename reliability
- Official Assets section arrays determine Land, Buildings, and Rooms. Observations are scoped to the signed-in account, and incomplete responses do not clear stored data. Refresh the Assets menu after loading the extension to capture the latest sections.
- Stable shop identifiers keep assigned Gross numbers through reordering, income changes and repeated runs. Duplicate numbers move only the conflicting shop; rows without a unique ID are skipped safely.
- Existing snapshots, settings and other features retain their storage keys.

## v0.6.5 verified Assets ledger
- Confirmed against an actual Capital Rift account response: `/api/game/:id` includes an `assets[]` ledger. `kind: "property"` entries are building deeds, `kind: "land"` entries are land parcels, and the array supplies the individual values.
- Parcels with `assets[].id = "parcel/<id>"` are reconciled with `landHoldings[].id = "<id>"` to preserve parcel details without duplicating values. Building classification uses the explicit Assets `kind`, including generic names such as Offices.
- Synthetic regression tests reproduce the observed ledger shape; no private account data is included in this ZIP.

## v0.6.6 logistics supply status
- Reads the official `/game/:id/logistics` response when available and shows unmet supply requests, out-of-stock rows, active lanes, and vehicles needed in both overviews. If the optional endpoint is unavailable, the account's own `network` summary supplies the overview values.
- Links supply requests to a shop only when its `toUnitKey` uniquely matches that shop's `unitKey`; unresolved requests remain in the account total. The Health panel displays linked request reasons and quantities.
- Does not treat logistics `room` endpoints as owned room assets. Delivery coverage appears only when lanes exist. No logistics controls change game state.

## v0.6.7 canonical shop count
- The account `shops[]` list is authoritative when present. Income rows enrich those shops only after a unique match by normalized shop ID, unit key, or unique name. Unmatched income records cannot double the owned shop count or the shop gross total.
- Keeps the account's shop ID and property identifiers for navigation, health and persistent Gross renaming. If the account's `shops[]` array is missing, the income-only fallback still works.
- Tested the 331 + 331 duplication case and confirmed 331 unique shop IDs and 331 property-linked shops.

## v0.6.8 observed regional rental market
- The Market page in the game overlay and full dashboard shows Capital Rift's reported rental market by region and unit type after visiting the rental market in game. Pool, housed, looking, listings, and your listings are copied from the response. These regional figures never change owned assets, shops, or account income.
- Observations are keyed by account ID and region. Missing or older response fields do not erase newer valid observations. Null metrics remain unknown rather than appearing as zero.
- The six supplied responses also include a one-shop sales history, one building's rented units (two copies of the same response), casino state, farm parcels, and one building's furniture. None is the account-wide income detail response; those are separate possible enhancements.

## v0.6.9 Capital Rift recorded cash movements
- The History screen now shows real transactions reported by the game's income history endpoint, alongside the existing portfolio snapshots. Hourly buckets provide the rolling 24-hour view; the existing 30-day daily endpoint provides 7-day and 30-day UTC calendar views. If the optional hourly request is unavailable, the shorter view is clearly labeled Current UTC day.
- Displays inflow, outflow, net cash movement, and the original transaction types separately. Funding, transfers, property purchases and casino funding are cash movements, not shop earnings; current run-rate projections remain labeled as projections. Missing history is reported as missing transactions.
- Confirmed against two supplied income-detail responses with 331 distinct shops each. Their shop gross totals exactly equal Capital Rift's official `rates.grossPerMin` in both captures. The supplied hourly response contains 222 transaction rows.

## v0.6.10 locations and shop Health
- Property location resolution falls back from an OpenStreetMap reference lookup to reverse geocoding the game-supplied building coordinates. Partial lookup results can fill missing city/country via reverse geocoding. The Resolve locations action advances through the next 12 unresolved properties per click; failed auto lookups no longer retrigger endlessly on every render.
- Health reads appeal, register usage, customers, sales units, foot traffic and shop net from the actual account shop record. Its optional live panel values are displayed distinctly. Missing measurements stay unknown instead of becoming zero. Restocker load is reported as observed sales per assigned restocker; the previous 54-units/min capacity assumption and its percentage have been removed.
- Sale shelf counts and empty shelves are captured from the game's building-furniture response by sale.shopId, reconciled to the current account. The Health panel has an explicit read-only button for the selected shop's building. Smaller partial responses cannot erase a more complete shelf capture.
- Panel observations now require a unique shop inside the game's property panel; they no longer scan the entire page or write an unchanged observation every 2.5 seconds. Partial responses do not clear previously valid shop-health values.
- Tested the pictured $1,006.35/min shop using fields from its real account record; its game shop net is $490.50/min, appeal 79/100, checkout approximately 86%, and customers 21.57/min.

## v0.6.11 share market

- Company listings are keyed by the game’s `companyId`, including companies with the same display name. A previously saved name-based watch entry remains visible until toggled onto its stable ID.
- The Market view displays official backing, yield, holders, float, share count, IPO price, live best bid/ask and quantity depth. The existing “Load live for visible” reads official share order books and 24-hour history; the “Load 30d history” action reads an individual company’s official 30-day share history. Day move and 30-day change are separate metrics.
- When the game's IPO screen requests IPO offerings, the passive observer caches offerings by `listingId` and shows active floor price, offered shares, demand, bidders and expiry. Expired offerings are hidden. Opening the in-game IPO screen is necessary to capture its endpoint; no unverified endpoint is called.
- Partial or stale IPO/market observations do not discard valid cached values. Market reads remain read-only.

## v0.6.12 official land parcel scouting

- Passively capture parcel records from Capital Rift map chunk responses; cache by official parcel ID and deduplicate repeated `same` chunk references. Preserve prior observations when a response is partial or older. The generic observation log stores only chunk metadata to avoid duplicating large polygon payloads.
- Scout searches show nearby observed parcels ranked by in-game busyness, with area, game value, city-proximity score, owner at capture time, and timestamp. Open the parcel location in the game via its official centroid. Parcels are scouting leads, never added to owned assets.
- Visit a game map area to populate the cache, then search that location in Scout. Captures depend on Capital Rift requesting those chunks while the extension is running.

## v0.6.13 observed retail units

- Capture read-only Capital Rift building details with `rentableUnits` as a separately cached roster keyed by official building `ref` and unit `key`. Stale or partial observations retain newer valid unit details.
- Exact unit-key joins enrich the Shops view with area, reported rent per game day and current furnishing value. The in-game shop Health panel shows observed tenant, fair rent, use and observation time; shops can be sorted by observed unit area.
- Properties show observed unit occupancy, public tenant names, shop matches and per-unit rent, area and furnishing values. The full dashboard includes the same unit fields. Unit rosters never add owned assets or change profit calculations. Furnishing value is **not** historical conversion cost, and reported rent is **not** subtracted twice.
- Open a Capital Rift building detail page to let the extension observe its unit roster, then view that building in Properties or its shops in Shops.

## v0.6.14 Scout building and room filters

- Scout resolves an observed Capital Rift building against the same OpenStreetMap `way/…` or relation ref in search results before rendering. Recently observed unmatched refs are resolved first; unrelated, unlocated properties no longer displace local results. Matched map leads show an observed badge and official game values.
- Official rentable-unit data distinguishes building area from its individual rooms: show room count, vacant count, room-size range and retail-unit count. Filter by minimum building area, minimum number of qualifying rooms, minimum individual room area, or game-observed buildings only. Room filters require actual game data, so map-only leads without rooms are excluded.
- Generic OSM `building=yes` is omitted from labels. Scout preserves search radius and filters between renders and explains when current filters hide observed buildings.
- Open the building's detail panel in Capital Rift while the extension is installed to let it observe the game response; the extension does not invent room counts from an OSM footprint.

## v0.6.15 one-time shifted Gross range repair

- The normal rename planner continues to preserve assigned Gross numbers and append new shops after the highest valid ID. A **separate, explicit** repair preview appears only when the entire account has at least 10 uniquely identified shops whose Gross names form a contiguous range beginning at or above the shop count. Example: 331 owned shops numbered Gross 331–661 can be previewed as Gross 1–331.
- The repair targets exact game shop IDs rather than array position, gross income, or sorting order. Preview creates no game-state writes; apply still confirms the number of actual rename requests. Account-scoped repair targets persist if a run stops and resume without changing already-correct shops. Confirmed ID mappings are updated only after successful game renames.
- Rename previews now always inspect all owned shops even when Shops search/filter is active. After completing the repair, ordinary runs are idempotent and a new shop receives Gross 332 in the 331-shop example.

## v0.6.16 observed building scouting

- Scout captures official building archetype, subtype, total and usable floors, owner and landlord when the game reports them. An explicit null owner does not mean the building lacks an NPC or player landlord. Room occupants are tenants, not room owners.
- Observed buildings show game traffic, appraisal/value, area, floors, room counts, distance and owner/landlord. Filter by minimum game traffic or owner/landlord type; sort observed buildings by traffic, distance or value. Unobserved map leads are excluded when filtering by game-only traffic or ownership.
- Building fields are keyed by game property reference, and newer complete observations update ownership while partial or stale observations preserve previously known fields. These cached observations can become out of date until the game requests building details again.

## v0.6.17 whole-account shop renumber

- In Rename, **Refresh + preview all N shops as Gross 1–N** requests current Capital Rift account and income data, counts unique shops, and assigns consecutive numbers in the chosen sort order (highest gross first by default). The Start number field applies only to the standard persistent-number preview.
- Every shop must have a unique game shop ID. Preview reports exactly which names will change, including a leftover `CRCC_LEARN_...` learning marker. Apply performs the explicit game rename requests only after confirmation. If the shop roster or names changed between preview and Apply, a fresh preview is required.
- The account-scoped plan is saved by shop ID so network reordering and interrupted runs do not shift unfinished names. Completing it replaces obsolete high-number mappings; new shops then start after the highest assigned Gross number. Repeating the whole-account preview without account changes produces zero rename requests.
- This button renames **shops**, not owned building deeds. Building ownership and property names are separate records; a building-rename request has not been observed or learned by this extension.

## v0.6.18 rename learning shop picker

- The **Learn rename once** dropdown now lists every shop with a unique game shop ID, sorted by actual gross income per minute from highest to lowest. The previous first-200 limit and API-position options are removed.
- The selected shop stays selected by game ID while account results reorder or the panel rerenders. A background update will not replace the dropdown DOM while it is focused. Selection stays local to the active character/company; when the extension is reloaded it defaults to the highest-grossing shop again.
- **Learn using selected shop** now resolves the exact selected game ID from the complete account shop list, independent of the Shops tab search/filter/sort.

## v0.6.19 room-sized property scouting

- Scout has upper limits for individual room area and building area, an upper limit for matching room count, expanded room-size choices including 500 m², and an optional Vacant rooms only filter. Min/max room size and vacancy are applied to the same actual observed room; the room-count thresholds count rooms matching those choices. Buildings with missing room observations and unobserved map leads never pass a room-specific filter.
- Observed building results have an expandable list of individual matching rooms by game unit key, with reported area, floor, vacancy and rent per game day. The source is the last Capital Rift building response, so availability must be checked again in game before acting. A small room in a large building appears when Room area ≤ is set without a restrictive Building area ≤ filter.

## v0.7.2 Captured region data and account transitions

- A company returned by `/api/company/mine` remains available as cached read-only operational data when `/api/me.piloting` is null; game writes still require a fresh matching pilot.
- Missing account sections preserve existing shop IDs, asset deeds and property anchors independently. Public equity `status: listed` is displayed as listed.
- Structured Retail Intel responses observed in the game are stored by account and area ID, with local item filters and sorting. The capture does not establish a fetch URL for this response, so this view appears after the game requests it.
- Shop Health can load verified `/api/game/{accountId}/shop-history?shopId={shopId}` on demand. Captured daily values are displayed without guessing at the second item metric.
- Region Info is cached compactly by account and area ID. Scout building and world parcel sources and land-purchase checks remain unchanged.

## v0.7.3 Verified on-demand account endpoints

- Retail Intel now includes a user-triggered Region Info request for a selected account property location. It uses the current active personal or piloted-company ID and caches the structured region response by account and `areaId`. Region Info does not contain the separate item-opportunity list, which remains available from passive observation.
- Shop Health already loaded `/api/game/{accountId}/shop-history?shopId={shopId}` when clicked. Both read actions now verify the live operational account before constructing the URL. Cached unpiloted companies remain viewable but cannot issue fresh company reads from these buttons.
- No Region Info polling or per-candidate Scout requests were added.

## v0.8.1 Read-only intelligence views

- Intel groups Region Intel, Competition Gaps and Region Scorecard. Gaps apply configurable seller, opportunity, estimated sales and regional sales thresholds to observed item records, with exact zero-seller detection, fixture and player-made filters, and four transparent sorts. Region Scorecard shows separate game traffic/economic fields and derived counts and extrema for each cached area; Region Info fields are shown separately when available. No geographic polygon is inferred.
- Shop Comparison adds Trend Alerts from histories already loaded by the user. It compares the latest up to seven valid reported days against the preceding up to seven valid reported days for revenue and units. The default threshold is 15%, configurable from 5–50%. Missing previous averages and zero denominators report N/A. Regional context is informational and includes its observation time.
- Shops, Shop Comparison and Gross Empire expose Products by stable shop ID. The finder resolves the shop's verified area ID from account data, a validated saved mapping or one explicit Region Info lookup at its known coordinates. It uses only the observed regional item list for that area; if none exists, it explains how to capture it in game. An unpiloted cached company cannot initiate the lookup. Four ranking modes, fixture and player-made filters, top ten cards and actual game price fields are read-only.
- The optional CC Fit Score uses 40% opportunity percentile, 30% estimated sell percentile, 20% regional sold percentile and 10% inverse local-seller percentile across the complete observed area item set; missing components are excluded and remaining weights renormalized. Demand per seller is estimated sell/min divided by max(local sellers, 1). Derived zero-seller and positive-opportunity counts, averages, and seven-day trend percentages are labeled separately from game values.
- Region statistics and item rankings are memoized for each normalized observation, so the same area is reused across shops until a newer response replaces it. No new background polling or game-state writes are introduced.
