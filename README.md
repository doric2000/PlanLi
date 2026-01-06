# PlanLi
Our Application for our final Project in Software Engineering.

## Web development (Google Places without CORS extensions)

On web, the Google Places API is blocked by browser CORS. This repo includes a small Express proxy so you can keep any CORS-unblock extension **off** (those extensions can break Firebase/Firestore WebChannel).

1. Create `server/.env` (you can copy `server/.env.example`) and set `GOOGLE_MAPS_KEY`.
2. Start the proxy: `cd server` then `npm install` and `npm run start`.
3. Run the client web app as usual. The web client defaults to `http://localhost:5000` for the proxy.

Optional: override the proxy base URL via `EXPO_PUBLIC_PLACES_PROXY_BASE_URL`.