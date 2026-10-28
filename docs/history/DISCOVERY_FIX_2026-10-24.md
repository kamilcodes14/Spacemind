# NASA ADS discovery recovery — 24 October 2026

The user's screenshot showed the missing-ADS-configuration message in Discover, not an
empty personal collection. Existing fallback handled Semantic Scholar only. ADS now uses
the same authenticated imported-corpus fallback for unavailable configuration and 429/503
provider responses. Invalid queries still fail validation; graph requests are unchanged.
Results explicitly identify NASA ADS as unavailable and imported matches as not live ADS
results. No API credentials or account protections were changed.

Fallback also expands blackholes/blackhole to black holes/black hole. Live database probe:
`match_papers_hybrid(null,'blackholes',30)` returned 0 chunks, while `black holes` returned
30 chunks. These are retrieval chunks, not 30 unique papers or measured answer accuracy.

121 automated tests passed, including missing ADS configuration, provider outage,
successful ADS routing, query normalization, existing fallback provenance and errors.
Discovery cache namespace bumped to v3. paper-discovery v5 deployed ACTIVE with
verify_jwt=true; other live dependencies preserved. Signed-in browser search still needs
user-session acceptance. ADS itself remains unconfigured; fallback does not claim to
restore the live ADS connection.
