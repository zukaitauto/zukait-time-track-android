# V376 coordinated Mechanical UI and report candidate

Preserve all architecture-v2 fixes through bcaf027331a2998fc3c061a81741f6555cc037a4.
No main changes. No backend, permission or live business-data changes.

The eleven Mechanical cards have two equal columns:
Estimate | Estimate List; Create Checklist | Check Lists; Create Job Card | Job Cards;
WIP | QC Pending; Ready for Delivery | Delivered Vehicles; Suggested Time Exceed.

Estimate and Job Card shortcuts use existing Reception/Estimate entry points for
Manager/Supervisor logins already permitted by those modules. WIP uses the existing
Manager workshop queue. QC/Ready/Delivered use existing workshop-wide queues.
Their subtitles identify the shared scope; displayed counts copy existing badges
without new calculations, requests or guessed zeros. Exceed opens the existing
Job Card list with Mechanic and Exceeded filters. The last card occupies the left
column of the final row.

Mechanical checklist registration/list focus existing controls. Jibin/SUP003 retains
the dedicated Mechanical role: Reception/shared-report shortcuts stay restricted;
QC/readiness shortcuts guide selection of a checklist and its existing authority
checks. No button approves QC, delivers a vehicle or writes a record automatically.
Pending saved commands block navigating to a shared page; existing durable retry
storage is unchanged.

All eleven shortcuts, exact ordering, equal two-column sizing, six soft card tones,
icons/light header, keyboard focus, permissions/stale sessions and no automatic
calls passed synthetic DOM/Chromium tests at 320/375/768/1280 on 5f34ac4.
Existing Mechanical contracts, native persistence and browser regression also
passed at that pre-version-freeze source. These are not physical-device results.

The V376/code339 release record is intentionally unapproved. Current updater stays
V375/code338. Final source CI/signed APK and the existing seven standard release
gates must be completed and attested before one coordinated publication. Do not
retarget V375 physical evidence or bypass scripts/verify-v305-acceptance.cjs.
