# Bridge MUN

An inclusive Model United Nations platform for students, small schools, emerging communities, and AI-supported committees.

## What is included

- Public, responsive landing page
- Registration with email, password, gender, school, grade, and nationality
- Login flow and protected conference dashboard
- Conference search, filters, and conference creation
- Full MUN forum builder with topic, date, duration, country-count presets, country search, random selection, and per-country AI delegates
- Working forum room with agenda phases, countdown timer, delegation roster, and committee messages
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

For the optional Python API:

1. Keep the Firebase Admin service-account JSON outside version control.
2. Set `GOOGLE_APPLICATION_CREDENTIALS` to that file's absolute path.
3. Install `backend/requirements.txt` and run the Flask app.

Firebase web configuration is designed to be public in browser code. Firebase Admin service-account credentials are private and must never be committed or placed in `dist`.
