# ZUKAIT combined Stock + Mechanical Consumables candidate — DRAFT / HOLD

This integration test branch combines the code from [Stock PR #61](https://github.com/zukaitauto/zukait-time-track-android/pull/61) and [Mechanical PR #62](https://github.com/zukaitauto/zukait-time-track-android/pull/62). It is **not a production deployment**.

Important overlaps were reconciled deliberately:
- The shared Consumables menu exposes **both** Stock and Mechanical.
- The web/Android entry HTML loads **both** Stock and Mechanical JavaScript.
- Cloud sync retains the legacy Stock API `zukaitCloud.stockRequest` **and** the small saved-Master link queue, while preserving the original sync behavior.
- Both isolated test suites run together through the existing GitHub workflows.

The Stock/Mechanical flags remain **off**. This branch must not be merged or deployed until integrated CI, signed physical stock counts, verified isolated backup restore, real role/Android/Web acceptance and production IO health have passed.

Do not merge both original PRs independently as substitutes for this combined release test; their overlapping files can overwrite each other.
