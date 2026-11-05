"""Bridge MUN API scaffold backed by Firebase Authentication and Firestore.

Configure GOOGLE_APPLICATION_CREDENTIALS with a Firebase service-account file,
then run with: flask --app app run --debug
"""

import os
from datetime import datetime, timezone

import firebase_admin
from firebase_admin import auth, credentials, firestore
from flask import Flask, jsonify, request
from flask_cors import CORS


def create_app() -> Flask:
    app = Flask(__name__)
    CORS(app, resources={r"/api/*": {"origins": os.getenv("FRONTEND_ORIGIN", "*")}})

    if not firebase_admin._apps:
        credentials_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
        if credentials_path:
            firebase_admin.initialize_app(credentials.Certificate(credentials_path))
        else:
            firebase_admin.initialize_app()

    db = firestore.client()

    @app.get("/health")
    def health():
        return jsonify({"status": "ok", "service": "bridge-mun-api"})

    @app.post("/api/register")
    def register():
        payload = request.get_json(silent=True) or {}
        required = ("email", "password", "gender", "school", "grade", "nationality")
        missing = [key for key in required if not payload.get(key)]
        if missing:
            return jsonify({"error": "missing_fields", "fields": missing}), 400

        try:
            user = auth.create_user(email=payload["email"], password=payload["password"])
            profile = {
                "email": payload["email"],
                "gender": payload["gender"],
                "school": payload["school"],
                "grade": payload["grade"],
                "nationality": payload["nationality"],
                "createdAt": datetime.now(timezone.utc),
            }
            db.collection("users").document(user.uid).set(profile)
            token = auth.create_custom_token(user.uid).decode("utf-8")
            return jsonify({"uid": user.uid, "customToken": token, "profile": profile}), 201
        except Exception as exc:  # Firebase returns the actionable validation error.
            return jsonify({"error": "registration_failed", "message": str(exc)}), 400

    def verified_uid():
        header = request.headers.get("Authorization", "")
        if not header.startswith("Bearer "):
            return None
        try:
            return auth.verify_id_token(header.removeprefix("Bearer "))["uid"]
        except Exception:
            return None

    @app.get("/api/conferences")
    def list_conferences():
        if not verified_uid():
            return jsonify({"error": "unauthorized"}), 401
        rows = db.collection("conferences").order_by("startDate").stream()
        return jsonify([{**row.to_dict(), "id": row.id} for row in rows])

    @app.post("/api/conferences")
    def create_conference():
        uid = verified_uid()
        if not uid:
            return jsonify({"error": "unauthorized"}), 401
        payload = request.get_json(silent=True) or {}
        required = ("name", "committee", "format", "startDate", "level")
        missing = [key for key in required if not payload.get(key)]
        if missing:
            return jsonify({"error": "missing_fields", "fields": missing}), 400
        payload.update({"createdBy": uid, "createdAt": datetime.now(timezone.utc)})
        ref = db.collection("conferences").document()
        ref.set(payload)
        return jsonify({**payload, "id": ref.id}), 201

    return app


app = create_app()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")))
