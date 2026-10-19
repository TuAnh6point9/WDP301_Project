# Google Maps integration retired

The application now uses MapLibre. Follow [the current map setup guide](map-setup.md); Google Maps API keys, Map IDs and billing are no longer required or consumed by the frontend.

The previous Google Maps attempt was blocked during onboarding by a billing-region restriction. See [Google's official prohibited-territories list](https://cloud.google.com/maps-platform/terms/maps-prohibited-territories). Enabling billing and creating a Map ID did not resolve the authorization failure.

Existing Google Cloud projects, keys and billing accounts have not been deleted or upgraded by this migration. Manage them separately in Google Cloud if needed.
