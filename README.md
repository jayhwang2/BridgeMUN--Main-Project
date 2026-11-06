# Bridge MUN

An inclusive Model United Nations platform for students, small schools, emerging communities, and AI-supported committees.

## What is included

- Public, responsive landing page
- Registration with email, password, gender, school, grade, and nationality
- Login flow and protected conference dashboard
- Conference search, filters, and conference creation
- Full MUN forum builder with topic, date, duration, country-count presets, country search, random selection, and per-country AI delegates
- Working forum room with agenda phases, countdown timer, delegation roster, and committee messages
- Transaction-safe random country assignment for human delegates
- Firestore-backed random speakers lists created when a conference starts
- GPT-powered AI delegate speeches, saved under each forum's `speeches` subcollection
- Real-time Firestore forum persistence scoped to each authenticated owner
- Firebase Authentication for real email/password registration, login, session persistence, and logout
- Browser-local persistence for the extended delegate profile and demo conferences
- Python/Flask API scaffold using Firebase Admin and Firestore

## Preview the frontend

Serve the `dist` directory with any static server, for example:

```bash
python3 -m http.server 4173 --directory dist
```

Then open `http://localhost:4173`.

## Firebase

The frontend is connected to the `bridgemun--main-project` Firebase web app. Email/Password authentication is enabled. The official Firebase 13.2.0 app and auth browser SDK files are vendored under `dist/vendor/firebase`, so authentication also initializes when `dist/index.html` is opened directly.

Created forums are stored in the Firestore `forums` collection. The app migrates older local-only forums after login, subscribes to the signed-in user's forum documents in real time, and applies the owner-only rules in `firestore.rules`.

For the Python API and AI delegates:

1. Keep the Firebase Admin service-account JSON outside version control.
2. Revoke any API key that has been shared in a message or screenshot, then create a new OpenAI project key.
3. Copy `.env.example` to a private `.env` or export its variables in your shell. Set `GOOGLE_APPLICATION_CREDENTIALS` and `OPENAI_API_KEY` there.
4. Install `backend/requirements.txt` in a virtual environment and run `python backend/app.py`.

The API runs at `http://127.0.0.1:4181` by default. The static local preview at port `4180` connects to it automatically. OpenAI keys are read only by the Flask server and must never be placed in `dist`.

Firebase web configuration is designed to be public in browser code. Firebase Admin service-account credentials are private and must never be committed or placed in `dist`.
