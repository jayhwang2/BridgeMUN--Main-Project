"""Bridge MUN API backed by Firebase and the OpenAI Responses API.

Keep both service credentials on the server. For local development, configure
GOOGLE_APPLICATION_CREDENTIALS and OPENAI_API_KEY, then run this module.
"""

import os
from datetime import datetime, timezone
from pathlib import Path

import firebase_admin
from firebase_admin import auth, credentials, firestore
from flask import Flask, jsonify, request
from flask_cors import CORS
from openai import OpenAI
from dotenv import load_dotenv


PROJECT_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(PROJECT_ROOT / ".env")


def create_app() -> Flask:
    app = Flask(__name__, static_folder=str(PROJECT_ROOT / "dist"), static_url_path="")
    CORS(app, resources={r"/api/*": {"origins": os.getenv("FRONTEND_ORIGIN", "*")}})

    if not firebase_admin._apps:
        credentials_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
        if credentials_path:
            firebase_admin.initialize_app(credentials.Certificate(credentials_path))
        else:
            firebase_admin.initialize_app()

    db = firestore.client()

    @app.get("/")
    def index():
        return app.send_static_file("index.html")

    @app.get("/health")
    def health():
        return jsonify(
            {
                "status": "ok",
                "service": "bridge-mun-api",
                "openaiConfigured": bool(os.getenv("OPENAI_API_KEY")),
                "model": os.getenv("OPENAI_MODEL", "gpt-5.6-terra"),
            }
        )

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
        except Exception as exc:
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

    @app.post("/api/ai/speech")
    def create_ai_speech():
        uid = verified_uid()
        if not uid:
            return jsonify({"error": "unauthorized"}), 401
        if not os.getenv("OPENAI_API_KEY"):
            return jsonify({"error": "openai_not_configured"}), 503

        payload = request.get_json(silent=True) or {}
        forum_id = str(payload.get("forumId", "")).strip()
        country_name = str(payload.get("country", "")).strip()
        phase = str(payload.get("phase", "General Speakers List")).strip()
        if not forum_id or not country_name:
            return jsonify({"error": "missing_fields", "fields": ["forumId", "country"]}), 400

        forum_ref = db.collection("forums").document(forum_id)
        forum_snapshot = forum_ref.get()
        if not forum_snapshot.exists:
            return jsonify({"error": "forum_not_found"}), 404
        forum = forum_snapshot.to_dict()
        if forum.get("createdBy") != uid:
            return jsonify({"error": "forbidden"}), 403

        country = next(
            (item for item in forum.get("countries", []) if item.get("name") == country_name),
            None,
        )
        if not country or not country.get("ai"):
            return jsonify({"error": "country_is_not_ai_enabled"}), 400

        topic = forum.get("topic", "International cooperation")
        subtopic = forum.get("subtopic") or "No narrower subtopic was provided."
        prior_messages = payload.get("priorMessages", [])
        context = "\n".join(str(message)[:400] for message in prior_messages[-5:])
        prompt = f"""Forum topic: {topic}
Subtopic: {subtopic}
Current committee phase: {phase}
Delegation: {country_name}
Recent committee context:
{context or 'No prior speeches yet.'}

Write this delegation's next MUN speech in 120-180 words. State a plausible national
position, one concrete proposal, and one invitation for cooperation. Do not invent
precise statistics, treaties, or quotes. Return only the speech text in English."""

        try:
            client = OpenAI()
            response = client.responses.create(
                model=os.getenv("OPENAI_MODEL", "gpt-5.6-terra"),
                instructions=(
                    "You are an AI delegate in a school Model United Nations committee. "
                    "Be diplomatic, realistic, age-appropriate, concise, and respectful."
                ),
                input=prompt,
                max_output_tokens=450,
            )
            speech = response.output_text.strip()
            if not speech:
                raise ValueError("The model returned an empty speech.")
        except Exception:
            app.logger.exception("OpenAI speech generation failed")
            return jsonify({"error": "speech_generation_failed", "message": "The AI delegate could not generate a speech."}), 502

        speech_data = {
            "country": country_name,
            "text": speech,
            "phase": phase,
            "createdBy": uid,
            "createdAt": firestore.SERVER_TIMESTAMP,
            "model": os.getenv("OPENAI_MODEL", "gpt-5.6-terra"),
        }
        speech_ref = forum_ref.collection("speeches").document()
        speech_ref.set(speech_data)
        return jsonify({"id": speech_ref.id, **{k: v for k, v in speech_data.items() if k != "createdAt"}})

    return app


app = create_app()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "4181")))
