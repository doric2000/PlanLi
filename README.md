# PlanLi
Our Application for our final Project in Software Engineering.

## Web development (Google Places without CORS extensions)

On web, the Google Places API is blocked by browser CORS. This repo includes a small Express proxy so you can keep any CORS-unblock extension **off** (those extensions can break Firebase/Firestore WebChannel).

1. Create `server/.env` (you can copy `server/.env.example`) and set `GOOGLE_MAPS_KEY`.
2. Start the proxy: `cd server` then `npm install` and `npm run start`.
3. Run the client web app as usual. The web client defaults to `http://localhost:5000` for the proxy.

Optional: override the proxy base URL via `EXPO_PUBLIC_PLACES_PROXY_BASE_URL`.

### Windows: run the proxy with live Places logs

If you want a dedicated terminal window that shows every Places request/response (autocomplete/details), use:

- `server/run-server-with-logs.cmd`

This script:
- Runs the server from the correct folder.
- Loads `server/.env` via `dotenv` (so `GOOGLE_MAPS_KEY` must be set).
- Keeps the window open so you can see live logs while testing the web app.