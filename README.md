# Oulunkylä Transit

Build a lightweight Android-first live transit board for Oulunkylä, Helsinki

Build a production-quality, extremely lightweight mobile web application for Android phones, especially Samsung Galaxy devices using Chrome.

The app is a focused personal utility for checking upcoming commuter trains and tram line 15 at Oulunkylä station in Helsinki.

The primary goal is:

Open the app from the Android home screen and understand within approximately one second when the next trains and trams will arrive in each direction, whether they are delayed, and whether an approaching vehicle appears to have stopped moving for an unusual amount of time.

Do not turn this into a general journey planner.

Do not add maps, route planning, accounts, authentication, social functions, ads, unnecessary navigation, large UI frameworks, unnecessary animations, or other functionality that is not required by this specification.

1. Product principles

The application must be:

extremely fast to open

optimized for mobile first

lightweight in CPU use

lightweight in memory use

lightweight in network traffic

easy to add to the Android home screen

easy to understand with one glance

reliable when realtime data is incomplete

explicit about whether displayed information is realtime or timetable-only

usable even if one external realtime data source temporarily fails

Prioritize:

correctness

clarity

speed

robustness

low resource usage

visual polish

Do not prioritize visual complexity over these goals.

2. Target platform

Primary target:

Samsung Galaxy phones

Android

Google Chrome

portrait orientation

normal mobile data or Wi-Fi connection

Build the app as an installable/mobile-friendly PWA if practical.

The user must be able to add the app to the Android home screen and launch it directly without manually navigating through a website.

Include an appropriate:

web app manifest

app name

app icon placeholder

theme metadata

mobile viewport configuration

standalone-capable PWA setup where supported

Do not implement a native Android application unless absolutely necessary. A lightweight PWA/web application is preferred.

3. Main screen

The main screen should have only the information needed for departures from Oulunkylä.

Separate traffic into four clear direction groups:

TRAINS

HELSINKI ↓

All commuter trains departing Oulunkylä toward Helsinki Central Station.

NORTH / MALMI ↑

All commuter trains departing Oulunkylä toward Malmi / Tikkurila / Kerava / other northern destinations.

Do not hardcode only specific train letters such as K, I or P.

Display every relevant commuter train that actually stops at Oulunkylä.

Classify direction based on actual trip/destination/direction data, not merely the train letter.

TRAM 15

KEILANIEMI

Line 15 toward Keilaniemi.

ITÄKESKUS

Line 15 toward Itäkeskus.

4. Departure row design

Each departure row must show at least:

transport mode

line identifier

realtime or scheduled arrival time

minutes until arrival

delay information when applicable

stationary status when applicable

Example normal row:

K 08:42 6 min

Example delayed row:

K 08:46 10 min
+4 min delayed

Example delayed and stationary row:

K 08:49 13 min
+7 min · Stationary on track 3 min

Example prolonged stop:

K 08:55 19 min
+13 min · Prolonged stop 7 min

For tram:

15 08:17 5 min

The number of minutes remaining should be visually more prominent than the absolute clock time.

However, always show both.

5. Visual hierarchy

The app should be optimized for a fast glance.

Use:

large remaining-minute values

clearly separated direction headers

sufficiently large touch targets

strong contrast

compact but readable spacing

responsive layout for typical Samsung Galaxy screen widths

Train and tram rows should use distinguishable visual styles.

Use color as additional information, but never use color alone.

A delayed departure should use:

delay text such as "+4 min"

and a visual warning style

A prolonged stationary vehicle should use:

explicit text

and a stronger warning style

Do not use excessive red.

Normal operation should visually feel calm.

6. Time horizon

The default live screen displays departures from now until approximately:

60 minutes into the future.

The user must be able to scroll forward to see later departures.

Provide a lightweight control such as:

"Show later"

or an equivalent compact interaction.

Also provide a separate option:

"Show 24 h"

This loads timetable information up to 24 hours ahead.

Do NOT load a full 24-hour timetable automatically when the app starts.

The normal startup experience must remain lightweight.

7. Difference between live mode and timetable mode

For departures approximately within the next 60 minutes:

use full realtime processing where data is available.

This may include:

scheduled arrival

realtime arrival

delay

cancellation

HSL vehicle movement

stationary detection

Fintraffic history for trains

For departures farther in the future:

show primarily timetable information.

If realtime information genuinely exists, it may be shown.

However, never claim that a far-future departure is "on time" merely because realtime information is not yet available.

If realtime data is unavailable, label the departure clearly as:

"timetable"

or equivalent.

8. Primary data source: HSL / Digitransit

Use HSL / Digitransit as the authoritative source for:

scheduled departures

realtime arrival estimates

delays

cancellations/realtime state

route

trip

direction

headsign

stop/platform information

Use the current Digitransit Routing API v2 / HSL GraphQL API.

Do not depend on deprecated Digitransit APIs.

Store the Digitransit API subscription key securely as a server-side secret.

Never expose the Digitransit API key in frontend JavaScript, public environment variables, source code or network calls made directly from the browser if this would expose the secret.

Use a server-side function / Lovable Edge Function for authenticated Digitransit requests.

9. Oulunkylä identifiers

Use these as expected identifiers:

TRAIN STATION:
HSL:1000210

EXPECTED TRAIN STOPS:
HSL:1285501
HSL:1285551

EXPECTED TRAM 15 STOPS:
HSL:1284401
HSL:1284402

However:

DO NOT blindly trust hardcoded IDs forever.

Implement a lightweight validation mechanism.

Validate that:

HSL:1000210 is Oulunkylä train station

the expected train stops belong to Oulunkylä

tram stops correspond to Oulunkylän asema and line 15

If an expected identifier no longer resolves correctly, do not silently display incorrect information.

Log a clear diagnostic and use a safe fallback lookup by station/stop name if supported.

Do not perform expensive name resolution on every refresh if identifiers are valid.

Cache validated identifiers appropriately.

10. Suggested Digitransit GraphQL data model

For each relevant stoptime retrieve, where supported by the current production schema:

stop.gtfsId

stop.name

stop.code

stop.platformCode

serviceDay

scheduledArrival

realtimeArrival

arrivalDelay

scheduledDeparture

realtimeDeparture

departureDelay

realtime

realtimeState

headsign

trip.gtfsId

trip.tripHeadsign

trip.directionId

route gtfsId

route shortName

route longName

route mode

Use the current schema names returned by Digitransit.

If any field name differs from this specification, adapt to the current production schema rather than inventing data.

11. Suggested GraphQL query structure

Prefer one efficient server-side request that retrieves:

train station departures

tram stop A departures

tram stop B departures

Conceptually:

fragment DepartureFields on Stoptime {
  stop {
    gtfsId
    name
    code
    platformCode
  }

  serviceDay

  scheduledArrival
  realtimeArrival
  arrivalDelay

  scheduledDeparture
  realtimeDeparture
  departureDelay

  realtime
  realtimeState
  headsign

  trip {
    gtfsId
    tripHeadsign
    directionId

    route {
      gtfsId
      shortName
      longName
      mode
    }
  }
}

query OulunkylaBoard(
  $startTime: Long!
  $timeRange: Int!
) {

  trains: station(id: "HSL:1000210") {
    gtfsId
    name

    stoptimesWithoutPatterns(
      startTime: $startTime
      timeRange: $timeRange
      numberOfDepartures: 100
      omitCanceled: false
    ) {
      ...DepartureFields
    }
  }

  tramA: stop(id: "HSL:1284401") {
    gtfsId
    name

    stoptimesWithoutPatterns(
      startTime: $startTime
      timeRange: $timeRange
      numberOfDepartures: 40
      omitCanceled: false
    ) {
      ...DepartureFields
    }
  }

  tramB: stop(id: "HSL:1284402") {
    gtfsId
    name

    stoptimesWithoutPatterns(
      startTime: $startTime
      timeRange: $timeRange
      numberOfDepartures: 40
      omitCanceled: false
    ) {
      ...DepartureFields
    }
  }
}


IMPORTANT:

Before finalizing this query, validate it against the current production Digitransit GraphQL schema.

If timeRange is unsupported by the deployed HSL schema, use:

startTime

sufficient numberOfDepartures

server-side filtering by target end time

Do not block the project because of a minor schema difference.

12. Arrival time calculation

Internally keep scheduled and realtime times separate.

For every departure calculate:

scheduledArrivalTimestamp

and, if realtime data is genuinely available:

realtimeArrivalTimestamp

Display:

realtimeArrivalTimestamp

when realtime data is valid.

Otherwise display:

scheduledArrivalTimestamp

Minutes remaining:

ceil or sensibly round the difference between current Helsinki local time and the displayed arrival time.

Avoid showing "-1 min".

When a vehicle has effectively arrived/passed, remove it from the active upcoming list after a small sensible grace period.

Use timezone-safe calculations.

Primary timezone:

Europe/Helsinki

Correctly handle:

daylight saving time

service dates crossing midnight

GTFS times greater than 24:00 where relevant

Do not use naive browser-local timestamp arithmetic if it can create DST or service-day bugs.

13. Realtime status

Use the API's explicit realtime indicator.

If:

realtime == false

do not treat matching scheduled and realtime values as proof that the vehicle is on time.

Show:

"timetable"

when appropriate.

If realtime information is valid and delay is zero or negligible, no extra text is necessary.

14. Delay presentation

Use API delay data where available.

For example:

scheduled arrival: 08:42
realtime arrival: 08:46

Display:

08:46
+4 min delayed

Do not independently invent a delay if the authoritative API provides one.

A delayed departure must remain sortable according to its estimated realtime arrival when appropriate.

15. Cancellations

Do not hide cancelled departures without explanation.

If a departure is cancelled, display something such as:

K 08:42 CANCELLED

Use realtime state / cancellation information supplied by Digitransit.

Do not unnecessarily fetch the complete system-wide cancellation dataset on every 20-second refresh.

If a separate cancellations/alerts reconciliation is necessary, fetch it at a lower frequency.

16. Train and tram direction classification

Do not infer direction solely from line name.

Trains

Classify Oulunkylä train departures into:

HELSINKI

or

NORTH / MALMI

Use actual:

trip direction

route

headsign

stop sequence/destination

as needed.

The implementation must continue working if another commuter train line begins stopping at Oulunkylä.

Do not hardcode only K/I/P.

Tram 15

Classify into:

KEILANIEMI

or

ITÄKESKUS

using actual trip direction/headsign.

Do not assume stop ID alone is always sufficient if temporary platform changes are possible.

17. HSL High Frequency Positioning — HFP

Use HSL High Frequency Positioning data to determine whether an approaching vehicle is actually moving.

Do NOT display a map.

Do NOT render moving vehicle markers.

The only purpose of location/movement data in this app is to derive a useful movement status.

Use HFP only for departures in the live monitoring horizon.

Do not track vehicles that are many hours away.

18. HFP vehicle matching

A Digitransit trip must be matched to the correct physical HFP vehicle.

Use documented HFP trip properties such as:

route

direction

start time

operating day

operator

vehicle number

where available.

Remember the known direction numbering difference:

Digitransit / GTFS:
0 / 1

HFP:
1 / 2

Convert correctly.

Where appropriate, use the Digitransit fuzzy trip mapping approach using:

route ID

converted direction

trip start time

operating/service day

Cache successful mapping.

Do NOT run an expensive fuzzyTrip lookup for every 1-second HFP message.

Example cache key concept:

route + direction + startTime + operatingDay
→ digitransitTripGtfsId

19. Critical HFP safety rule

There are known cases where HFP route identifiers do not map cleanly to Routing API route identifiers.

Therefore:

If the HFP vehicle cannot be matched unambiguously to the displayed Digitransit trip:

DO NOT GUESS.

Do not attach movement data from a possibly incorrect vehicle.

Continue showing the normal timetable/realtime departure without stationary information.

Accuracy is more important than showing every possible status.

20. HFP subscription efficiency

Do not subscribe to all HSL vehicle traffic.

Only subscribe to the modes/routes/directions currently relevant to the visible live departures.

Prefer narrow HFP topics.

Stop unnecessary subscriptions when:

a departure disappears from the live list

the app goes into the background

the page becomes hidden

Reconnect when the user returns to the app.

21. Stationary vehicle detection

Implement a dedicated stationary detector.

Do not use a single:

speed == 0

check.

GPS and speed values may fluctuate.

Use a combination of:

speed

GPS displacement

observation time

data freshness

Initial parameters:

stationary speed threshold:
<= 0.5 m/s

observation window:
approximately 30 seconds

maximum displacement during stationary observation:
approximately 30 metres

stationary information threshold:
120 seconds

prolonged stop warning:
240 seconds

movement recovery:
approximately 5 seconds of sustained movement

These thresholds should be defined in configuration constants so they can easily be adjusted later.

22. Locked stationary-status behavior

These thresholds are mandatory.

Under 2 minutes

Do not show a stationary warning.

2:00–3:59

Show:

Stationary 2 min

Stationary 3 min

Use an informational but noticeable style.

Do not label this as a disruption.

4:00 and above

Show:

Prolonged stop · 4 min

Then:

Prolonged stop · 5 min
Prolonged stop · 6 min

etc.

Use a more prominent warning style.

The stationary timer must continue to increase independently from the HSL realtime ETA.

23. Station vs track distinction for trains

Where location quality allows a reliable determination, distinguish:

Stationary at station

from:

Stationary on track

Example:

K 08:49 13 min
+7 min · Stationary on track 3 min

Do not claim "on track" or "at station" if location confidence is insufficient.

Fallback text:

Stationary 3 min

is preferable to an incorrect location claim.

24. Stale or missing movement data

Movement data quality must be considered.

If HFP or GPS data becomes stale:

do not count the entire data outage as confirmed stationary time.

Do not conclude:

"Stationary 12 min"

merely because no location packets were received for 12 minutes.

Represent stale movement data internally.

If necessary show a subtle status such as:

Movement data unavailable

but do not overwhelm the normal departure view.

25. Fintraffic integration for commuter trains

Use Fintraffic railway APIs as a secondary source specifically for train identity/history and movement history.

Do NOT use Fintraffic to replace HSL/Digitransit as the primary passenger-facing arrival estimate.

HSL/Digitransit remains authoritative for:

Oulunkylä timetable

displayed ETA

delay

cancellation

Fintraffic is supplemental.

26. HSL-to-Fintraffic train matching

There is no assumption of a guaranteed shared direct train ID.

Therefore match conservatively.

For a Digitransit commuter train trip, identify a Fintraffic train using the combination of:

operating/departure date

commuter line ID

Oulunkylä station stop

exact scheduled Oulunkylä time

direction

Only accept a match when exactly one Fintraffic train satisfies the matching conditions.

Then store:

Fintraffic departureDate
Fintraffic trainNumber

against:

Digitransit trip.gtfsId

Cache this match for the lifetime of the trip.

27. Critical Fintraffic safety rule

If Fintraffic matching returns:

0 candidates

or

more than 1 candidate

DO NOT GUESS.

Set the match confidence to something equivalent to:

NONE

or

AMBIGUOUS

and do not use historical GPS data for that departure.

Suggested internal states:

EXACT
NONE
AMBIGUOUS

Only EXACT matches may be used for retrospective stationary-duration calculations.

28. Fintraffic location history

For an EXACT train match, retrieve recent train location history.

Use timestamped position and speed data to determine whether the train had already been stationary before the user opened the app.

This solves the following important use case:

The train stopped at 08:23.

The user opens the app at 08:30.

The app should be capable of immediately showing:

Prolonged stop · 7 min

instead of waiting until 08:32 to first report two minutes of stationary time.

Merge historical data and current HFP data carefully.

Do not double-count overlapping time.

29. Historical stationary calculation quality

Use only sufficiently continuous and recent location history.

If GPS history contains a long gap:

do not treat the entire gap as confirmed stationary.

The application must prefer uncertainty over false precision.

For example:

good:
Movement history incomplete

bad:
Stationary 14 min

when seven minutes of that duration had no reliable data.

30. Tram stationary history

For tram 15, use HFP live data.

Do not build a persistent 24/7 backend location-history database solely for the tram in this first version.

If the app was opened after the tram had already stopped, stationary duration may initially begin from the first reliably observed HFP state.

This limitation is acceptable for the first version.

Design the code so historical tram tracking could be added later without redesigning the UI.

31. Internal departure model

Use a clean normalized model similar to:

type Departure = {
  id: string;

  mode: "TRAIN" | "TRAM";
  line: string;

  direction:
    | "HELSINKI"
    | "NORTH"
    | "KEILANIEMI"
    | "ITAKESKUS";

  headsign: string | null;

  scheduledArrival: string;
  realtimeArrival: string | null;

  delaySeconds: number | null;
  realtimeAvailable: boolean;
  realtimeState: string | null;
  cancelled: boolean;

  digitransitTripId: string;
  digitransitRouteId: string;
  directionId: number | null;

  hfpVehicleId: string | null;

  movementStatus:
    | "UNKNOWN"
    | "MOVING"
    | "STATIONARY"
    | "STALE";

  stationarySince: string | null;
  stationarySeconds: number | null;

  stationarySeverity:
    | "NONE"
    | "INFO"
    | "WARNING";

  stationaryLocation:
    | "UNKNOWN"
    | "AT_STATION"
    | "ON_TRACK";

  fintrafficTrainNumber: number | null;
  fintrafficDepartureDate: string | null;

  fintrafficMatchConfidence:
    | "EXACT"
    | "NONE"
    | "AMBIGUOUS";
};


Adjust exact TypeScript fields as appropriate, but retain the separation of concerns.

32. Refresh strategy

On initial app open:

fetch current departure information immediately.

Do not make the user press Refresh first.

Suggested refresh behavior:

Digitransit departure data:
approximately every 20 seconds while app is visible

HFP:
stream only while relevant and while page is visible

Fintraffic history:
fetch only when required for an active approaching train, with appropriate caching

24-hour timetable:
fetch only when explicitly requested

When the app/page becomes hidden:

stop unnecessary high-frequency processing

close or reduce realtime subscriptions where appropriate

do not continuously burn battery in the background

When the app returns to foreground:

immediately refresh Digitransit

reconnect relevant HFP streams

reconcile visible departures

33. Last-updated information

Display a small status near the bottom of the screen:

Updated 08:14:23

Update this only after a successful data refresh.

Do not falsely update the timestamp if the API request failed.

34. Manual refresh

Provide a small manual refresh control.

It must not dominate the interface.

Manual refresh should:

fetch new Digitransit data

reconcile active movement subscriptions

update relevant supplemental data

Prevent accidental refresh spamming.

35. Error handling

The app must fail gracefully.

Digitransit temporarily unavailable

Keep the most recent valid data visible for a short reasonable period.

Clearly mark:

Data may be outdated

and show:

Last successful update 08:12

Do not silently present stale data as live.

Realtime unavailable but schedule available

Show the scheduled departure.

Label as:

timetable

Do not show an error page.

HFP unavailable

Continue to show HSL arrival estimates normally.

Simply omit movement/stationary information.

Fintraffic unavailable

Continue to use Digitransit and HFP.

Do not block the app.

Invalid stop configuration

Show a diagnostic-safe user message.

Do not display departures from an incorrectly matched station.

36. Sorting

Within each direction group:

sort primarily by effective expected arrival time.

Use:

realtime arrival

if valid.

Otherwise:

scheduled arrival.

Cancelled departures may remain in chronological position but must be visibly marked as cancelled.

37. Duplicate handling

Ensure that the same physical departure is not displayed twice due to:

station and child stop data overlap

duplicated realtime records

alternate source reconciliation

Use the Digitransit trip ID + stop/service date combination as part of deduplication.

Do not deduplicate merely by line + clock time if this could remove legitimate departures.

38. Midnight and service-day handling

Correctly handle:

departures after midnight

GTFS service dates

GTFS times that conceptually belong to the previous service day

trips whose start time is represented beyond 24:00

HFP operating-day/start-time mapping

Fintraffic departureDate

Test specifically around:

23:50–00:30

39. Accessibility

Use accessible HTML.

Requirements:

sufficient text/background contrast

readable mobile font sizes

no essential information communicated only through color

labels usable by screen readers where practical

touch targets large enough for comfortable mobile use

40. Performance requirements

Keep the application extremely small and responsive.

Avoid unnecessary dependencies.

Do not add:

map libraries

charting libraries

large component libraries

analytics SDKs

authentication SDKs

database SDKs

unless genuinely necessary.

Prefer browser-native APIs and small utility functions.

Do not introduce a database unless required by the implementation.

Use in-memory/cache storage for temporary trip mappings where sufficient.

Avoid excessive React rerenders from 1 Hz HFP messages.

Do not rerender the entire board every time a GPS packet arrives.

Separate movement processing from presentation state.

Update visible stationary durations at a reasonable UI frequency.

41. Security

All secret API keys must remain server-side.

Never commit secrets to source control.

Use secure environment secrets.

Validate all responses before using them.

Treat external API data as untrusted input.

Do not expose internal debugging information or API keys in user-visible errors.

42. Privacy

The application does not require:

user accounts

user profile

user location

tracking the user's phone

analytics

cookies for advertising

Do not request location permission.

The app monitors public transport vehicles, not the user.

43. No unnecessary backend state

Avoid building an always-running server process unless absolutely necessary.

The intended architecture is lightweight:

Android / Chrome / PWA
↓
Lovable frontend
↓
small server-side functions for protected API access
↓
Digitransit

plus:

HFP realtime stream

and:

Fintraffic supplemental train data

Use stateless or minimally stateful architecture where possible.

44. Suggested component architecture

Keep components focused.

For example:

App

TransitBoard

DirectionSection

DepartureRow

StatusBar

RefreshButton

TimetableRangeControl

Data layer:

digitransitService

fintrafficService

hfpService

departureNormalizer

directionClassifier

stationaryDetector

trainMatcher

timeUtils

Do not overengineer.

45. Stationary detector separation

Implement the stationary detector as a testable pure or mostly pure module.

Its logic must not be buried inside a UI component.

Inputs should conceptually include:

timestamped speed observations

timestamped GPS coordinates

data freshness

previous movement state

Outputs should conceptually include:

movementStatus

stationarySince

stationarySeconds

stationarySeverity

Create unit tests for threshold boundaries.

Especially test:

119 seconds → no stationary label
120 seconds → INFO
239 seconds → INFO
240 seconds → WARNING

46. Required tests

Create tests for at least:

Time calculations

normal realtime departure

delayed departure

timetable-only departure

service day crossing midnight

daylight saving edge case if practical

Direction classification

train toward Helsinki

train toward north

tram toward Keilaniemi

tram toward Itäkeskus

Stationary state

under 2 minutes

exactly 2 minutes

between 2 and 4 minutes

exactly 4 minutes

prolonged stop

vehicle begins moving again

GPS jitter

stale location stream

Fintraffic matching

exactly one match

no match

two possible matches

wrong line

same line but wrong scheduled time

wrong direction

Failure modes

Digitransit unavailable

HFP unavailable

Fintraffic unavailable

realtime unavailable

invalid stop identifier

47. Development diagnostics

Create a development-only diagnostics view or console diagnostics that can show:

resolved stop IDs

current Digitransit trip ID

route ID

direction ID

HFP vehicle ID

HFP matching result

Fintraffic train number

Fintraffic match confidence

stationary detector raw state

last successful API timestamps

Do not show this diagnostics information in the normal production UI.

This will be important for testing and code review.

48. User interface behavior during loading

First startup should feel immediate.

Use a lightweight skeleton or previous cached valid board if available.

Do not display a large blocking spinner for every refresh.

Subsequent background refreshes should not cause rows to flash or disappear unnecessarily.

Maintain stable layout.

49. Caching

Use caching carefully.

Acceptable:

validated stop identifiers

static metadata

trip mapping

exact Fintraffic match for the current trip

most recent valid departure board for brief network failure fallback

Do NOT cache realtime data in a way that could make old data appear current.

Every cached realtime snapshot must retain its original timestamp.

50. Initial screen copy

Use concise Finnish UI text.

Suggested direction headers:

JUNAT

HELSINKI ↓

POHJOINEN / MALMI ↑

PIKARATIKKA 15

KEILANIEMI

ITÄKESKUS

Suggested statuses:

aikataulu

+4 min myöhässä

Paikallaan 2 min

Paikallaan asemalla 3 min

Paikallaan radalla 3 min

Pitkittynyt pysähdys · 4 min

PERUTTU

Reaaliaikatieto ei saatavilla

Tiedot eivät ehkä ole ajan tasalla

Päivitetty 08:14:23

Näytä myöhemmät

Näytä 24 h

Päivitä

The UI language should be Finnish.

Code, variables and technical comments may be English.

51. Keep the interface intentionally simple

Do not add a bottom tab bar.

Do not add a hamburger menu unless later functionality genuinely requires it.

Do not add onboarding.

Do not add login.

Do not add settings in the first version except perhaps a small development-only configuration mechanism.

The home screen itself is the application.

52. Acceptance criteria

The first version is successful when all of the following are true.

Startup

Opening the home-screen shortcut quickly displays current Oulunkylä departures.

Four directions

The user can immediately see:

trains toward Helsinki

trains toward north/Malmi

tram 15 toward Keilaniemi

tram 15 toward Itäkeskus

Arrival information

Every departure displays:

arrival time

minutes remaining

Realtime

If HSL provides realtime ETA, use it.

If not, clearly use timetable information.

Delay

Delayed departures clearly show the delay.

Cancellation

Cancelled departures are visible as cancelled.

Stationary detection

After 2 minutes of reliably detected stationary state:

show stationary information.

After 4 minutes:

show prolonged stop warning.

Historical train stop

Where an exact Fintraffic train match and sufficient history are available, the app can detect that a train was already stationary before the app was opened.

Safe uncertainty

The app never knowingly attaches movement data from an ambiguous vehicle to a departure.

60-minute board

Normal live view covers approximately the next hour.

24-hour schedule

The user can intentionally request timetable information up to 24 hours ahead.

Performance

The application remains lightweight and responsive on Samsung Galaxy Android phones.

53. Implementation order

Implement in this order.

Phase A — static UI

Build the complete mobile interface using mock departure data.

Do not begin with complex realtime integrations.

Verify layout on common Samsung Galaxy screen widths.

Phase B — Digitransit

Implement server-side Digitransit access.

Validate stop/station identifiers.

Display real departures.

Implement:

schedule

realtime ETA

delay

cancellation

four direction classification

60-minute view

24-hour view

Phase C — HFP

Add HFP vehicle matching and live movement monitoring.

Implement stationary detector.

Do not proceed by guessing ambiguous trip matches.

Phase D — Fintraffic

Implement conservative commuter-train cross-matching.

Only use historical location data for EXACT matches.

Phase E — PWA and performance

Finalize:

home-screen installation

manifest

caching

refresh strategy

visibility/background behavior

bundle optimization

accessibility

Phase F — tests and diagnostics

Run:

build

TypeScript checks

lint

tests

Fix failures.

54. Before claiming completion

Before saying the project is finished:

Verify the actual current Digitransit GraphQL schema.

Verify the Oulunkylä station and stop IDs against the live API.

Verify that line 15 directions resolve correctly.

Verify that actual Oulunkylä train trips classify correctly north/south.

Verify HFP matching with real data.

Verify that ambiguous HFP matching does not attach incorrect data.

Verify at least one actual commuter train Fintraffic match if live data is available.

Verify Fintraffic history processing does not count missing GPS intervals as stationary.

Test the app in a narrow Android mobile viewport.

Test foreground → background → foreground behavior.

Verify API secrets are absent from the frontend bundle.

Verify production build succeeds.

If an external API cannot be tested because credentials are not yet configured, clearly state exactly which test is pending.

Do not fabricate successful API test results.

55. Important engineering rule

When the specification, an external API and observed live data conflict:

do not silently guess.

Prefer this order:

current authoritative API response

current official API schema/documentation

this specification

fallback assumptions

If adaptation is required because an external API has changed, keep the intended user behavior unchanged and document the technical adjustment.

56. What I want you to produce now

Build the application according to this specification.

First:

create the UI

create the normalized data architecture

create the server-side Digitransit integration structure

keep secrets server-side

Then progressively add realtime integrations.

Keep the code clean enough for an external senior engineer to review later.

At the end, provide a concise implementation report containing:

architecture used

major source files/components

external APIs used

stop identifiers actually validated

environment secrets that I must configure

tests run

any tests that could not be completed

known limitations

any assumptions that remain

Do not add features outside this specification without explaining why they are necessary.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/6569a805-4b05-4795-97f4-a0783536db72).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
