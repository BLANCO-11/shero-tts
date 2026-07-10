# Shero-TTS Neural Synthesis API Reference

The Shero-TTS FastAPI backend daemon runs on local port `6767` by default. It supports voice listing, real-time zero-shot voice cloning, and low-latency chunk-by-chunk audio streaming in MP3, WAV, and raw PCM formats.

---

## 🔒 Authentication Mappings

All core synthesis and cloning endpoints are auth-gated using SQLite database keys. The system checks three inputs (evaluated in order):

1.  **Bearer Authorization Header (Standard):**
    ```http
    Authorization: Bearer sh_your_api_token_here
    ```
2.  **Custom API Key Header:**
    ```http
    X-API-Key: sh_your_api_token_here
    ```
3.  **Query Parameter (Required for native HTML5 audio tags):**
    ```http
    GET /v1/audio/speech?input=Hello&token=sh_your_api_token_here
    ```

> [!NOTE]
> Generate or revoke API keys by logging in to the **Admin Portal** on your dashboard (`tts.projectblanco.cc`) using your admin password.

---

## 🗺️ Quick Reference Summary

| Endpoint | Method | Authentication | Description |
| :--- | :--- | :--- | :--- |
| [`/health`](#1-system-health-check-get-health) | `GET` | None | System state, active models, and cloning authorization status. |
| [`/v1/voices`](#2-list-voices-get-v1voices) | `GET` | API Token | Fetch available voice IDs, sources, and cloning indicators. |
| [`/v1/voices/clone`](#3-zero-shot-voice-clone-post-v1voicesclone) | `POST` | API Token | Clone and register a new custom voice state from an audio reference file. |
| [`/v1/audio/speech`](#4-speech-synthesis-stream-get-v1audiospeech) | `GET` / `POST` | API Token | Synthesize and stream text into speech. |
| [`/docs`](#5-interactive-swagger-ui-get-docs) | `GET` | None | Interactive Swagger documentation playground. |

---

## 🔌 Endpoint Specifications

### 1. System Health Check (`GET /health`)
Verifies backend connectivity, checks the local weights cache directory, and inspects environment variables to verify Hugging Face zero-shot cloning permissions.

*   **URL:** `https://tts.projectblanco.cc/api/health`
*   **Method:** `GET`
*   **Headers:** `Accept: application/json`

#### Response Example
```json
{
  "status": "online",
  "cloning_capability": "enabled",
  "loaded_model": "pocket-tts (100M parameter CALM)",
  "cached_voice_states": 2
}
```

---

### 2. List Voices (`GET /v1/voices`)
Fetches all usable voice IDs currently registered on the server (combines built-in profiles and dynamically compiled zero-shot voices).

*   **URL:** `https://tts.projectblanco.cc/api/v1/voices`
*   **Method:** `GET`
*   **Headers:**
    *   `Authorization: Bearer sh_your_api_token_here`

#### Response Example
```json
{
  "voices": [
    {
      "id": "alba",
      "display_name": "Alba",
      "source": "Built-in",
      "cloning_required": false
    },
    {
      "id": "voice-zero/a_janelle_risa-anger",
      "display_name": "a janelle risa (Anger)",
      "source": "Voice-Zero (Emotional)",
      "cloning_required": true
    }
  ]
}
```

---

### 3. Zero-Shot Voice Clone (`POST /v1/voices/clone`)
Generates and registers a new cognitive voice embedding using a reference audio clip. Once processed, the returned `voice_id` can be used immediately inside the speech generation endpoint.

*   **URL:** `https://tts.projectblanco.cc/api/v1/voices/clone`
*   **Method:** `POST`
*   **Content Type:** `multipart/form-data`
*   **Headers:**
    *   `Authorization: Bearer sh_your_api_token_here`

#### Request Payload (Multipart Form)
| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `file` | File Binary | **Yes** | Reference audio recording (`.wav`, `.flac`, or `.mp3`). Recommended length: 5 to 15 seconds. |
| `name` | String | **Yes** | Unique identifier label for the new voice state (e.g. `Jarvis`). Spaces are replaced by underscores. |

#### cURL Example
```bash
curl -X POST https://tts.projectblanco.cc/api/v1/voices/clone \
  -H "Authorization: Bearer sh_your_api_token_here" \
  -F "file=@/path/to/my_ref_voice.wav" \
  -F "name=Neo"
```

#### Response Example
```json
{
  "voice_id": "voice-zero/Neo",
  "status": "success"
}
```

---

### 4. Speech Synthesis Stream (`GET /v1/audio/speech`)
Converts input text into spoken audio stream segments. Supports chunked transfer encoding for low-latency streaming playback.

*   **URL:** `https://tts.projectblanco.cc/api/v1/audio/speech`
*   **Method:** `GET` / `POST`

#### Query Parameters (For GET Request)
| Parameter | Type | Required | Default | Options | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `input` | String | **Yes** | | | Text prompt to synthesize. Maximum 1000 characters. |
| `voice` | String | **Yes** | | | Voice identifier matching an `id` from the voices list (e.g. `alba`, `voice-zero/Neo`). |
| `response_format` | String | No | `mp3` | `mp3`, `wav`, `pcm` | Audio output format. `pcm` streams raw 24kHz headerless bytes. |
| `speed` | Float | No | `1.0` | `0.5` - `2.0` | Resampled speech rate multiplier. |
| `stream` | Boolean | No | `true` | `true`, `false` | Enables chunk-by-chunk HTTP stream response (decreases time-to-first-byte). |
| `token` | String | **Yes** | | | API Token string (Alternative to Authorization header, required for audio src elements). |

#### cURL Example (Save Stream output directly to file using Bearer Auth)
```bash
curl -G https://tts.projectblanco.cc/api/v1/audio/speech \
  -H "Authorization: Bearer sh_your_api_token_here" \
  --data-urlencode "input=Hello! Welcome to the Shero text to speech engine." \
  --data-urlencode "voice=alba" \
  --data-urlencode "response_format=mp3" \
  --data-urlencode "speed=1.0" \
  --data-urlencode "stream=true" \
  --output synthesized_audio.mp3
```

---

### 5. Interactive Swagger UI (`GET /docs`)
FastAPI serves an interactive Swagger playground detailing all API schemas, routes, payloads, and letting you run test calls directly from the browser window.

*   **UI Dashboard:** `https://tts.projectblanco.cc/api/docs`
*   **OpenAPI Schema:** `https://tts.projectblanco.cc/api/openapi.json`
*   **Method:** `GET`
*   **Headers:** None
