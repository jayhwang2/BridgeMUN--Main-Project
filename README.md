# Bridge MUN

An inclusive Model United Nations platform for students, small schools, emerging communities, and AI-supported committees.

## What is included

- Public, responsive landing page
- Registration with email, password, gender, school, grade, and nationality
- Login flow and protected conference dashboard
- Conference search, filters, and conference creation
- Browser-local demo persistence for immediate preview
- Python/Flask API scaffold using Firebase Authentication and Firestore

## Preview the frontend

Serve the `dist` directory with any static server, for example:

```bash
python3 -m http.server 4173 --directory dist
```

Then open `http://localhost:4173`.

## Connect Firebase

1. Create a Firebase project and enable Email/Password Authentication and Firestore.
2. Download a Firebase Admin service-account JSON file. Keep it outside the repository.
3. Set `GOOGLE_APPLICATION_CREDENTIALS` to that file's absolute path.
4. Install `backend/requirements.txt` and run the Flask app.
5. Replace the frontend's local demo adapter with Firebase client authentication and the API endpoints in `backend/app.py`.

The published static preview intentionally uses local browser storage because no Firebase project credentials were supplied. Never commit Firebase service-account credentials.
