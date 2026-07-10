import os
import sys
import re
import secrets
import asyncio
import logging
from contextlib import asynccontextmanager
from typing import List, Optional, Dict, Any
from fastapi import FastAPI, HTTPException, Request, Response, status, UploadFile, File, Form, Depends, Security
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials, APIKeyQuery, APIKeyHeader
import pydantic
import torch
import numpy as np
import lameenc

# Load environment configuration immediately
def load_env_file():
    """Reads .env file, parses keys, and strips double/single quotes from values."""
    env_path = os.path.abspath(".env")
    if os.path.exists(env_path):
        with open(env_path, "r") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" in line:
                    key, val = line.split("=", 1)
                    key = key.strip()
                    val = val.strip()
                    # Strip surrounding double or single quotes
                    if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
                        val = val[1:-1]
                    os.environ[key] = val

load_env_file()

# Configure Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("SheroTTS")

# Concurrency & CPU safety configuration
# Optimized for 4-core CPU: 1 thread per parallel inference core to avoid oversubscription
torch.set_num_threads(1)
logger.info("Set PyTorch intra-op threads to 1 for optimal parallel CPU sentence-chunking.")

# App State Globals
tts_model = None
cloning_available = False
voice_state_cache: Dict[str, Any] = {}

# Global CPU core semaphore matching 4 physical cores
pytorch_semaphore = asyncio.Semaphore(4)

# Directory Configurations
VOICES_DIR = os.path.abspath("./voices")
CUSTOM_VOICES_DIR = os.path.abspath("./voices/custom")
VOICE_ZERO_DIR = os.path.abspath("./voices/voice-zero")

# Create directories
os.makedirs(CUSTOM_VOICES_DIR, exist_ok=True)

# 26 standard built-in voices in Kyutai's model catalog
BUILTIN_VOICES = [
    'cosette', 'marius', 'javert', 'alba', 'jean', 'anna', 'vera', 'fantine', 
    'charles', 'paul', 'eponine', 'azelma', 'george', 'mary', 'jane', 'michael', 
    'eve', 'bill_boerst', 'peter_yearsley', 'stuart_bell', 'caro_davy', 'giovanni', 
    'lola', 'juergen', 'rafael', 'estelle'
]

def resolve_voice_path(voice_id: str) -> Optional[str]:
    """Resolves a voice ID to either 'builtin' or its absolute file path."""
    if voice_id in BUILTIN_VOICES:
        return "builtin"
        
    if voice_id.startswith("voice-zero/"):
        rel_path = voice_id[len("voice-zero/"):]
        # Check standard voice-zero voices directory
        for ext in [".flac", ".wav", ".mp3"]:
            path = os.path.join(VOICE_ZERO_DIR, "voices", rel_path + ext)
            if os.path.exists(path):
                return path
        # Check emotional voice-zero voices directory (format: voice-zero/speaker-emotion)
        if "-" in rel_path:
            parts = rel_path.rsplit("-", 1)
            voice_name, emotion = parts[0], parts[1]
            for ext in [".flac", ".wav", ".mp3"]:
                path = os.path.join(VOICE_ZERO_DIR, "voices-emotion", voice_name, emotion + ext)
                if os.path.exists(path):
                    return path
                    
    if voice_id.startswith("custom/"):
        rel_path = voice_id[len("custom/"):]
        for ext in [".flac", ".wav", ".mp3"]:
            path = os.path.join(CUSTOM_VOICES_DIR, rel_path + ext)
            if os.path.exists(path):
                return path
                
    return None

def get_available_voices() -> List[Dict[str, Any]]:
    """Lists all voices discovered in the filesystem."""
    voices = []
    
    # 1. Built-in voices
    for v in BUILTIN_VOICES:
        voices.append({
            "id": v,
            "display_name": v.capitalize(),
            "source": "Built-in Catalog",
            "cloning_required": False
        })
        
    # 2. Voice-Zero standard voices
    vz_voices_dir = os.path.join(VOICE_ZERO_DIR, "voices")
    if os.path.exists(vz_voices_dir):
        for f in sorted(os.listdir(vz_voices_dir)):
            if f.endswith((".flac", ".wav", ".mp3")):
                name = os.path.splitext(f)[0]
                voices.append({
                    "id": f"voice-zero/{name}",
                    "display_name": f"{name.replace('_', ' ').title()} (Voice-Zero)",
                    "source": "Voice-Zero",
                    "cloning_required": True
                })
                
    # 3. Voice-Zero emotional variations
    vz_emotion_dir = os.path.join(VOICE_ZERO_DIR, "voices-emotion")
    if os.path.exists(vz_emotion_dir):
        for d in sorted(os.listdir(vz_emotion_dir)):
            d_path = os.path.join(vz_emotion_dir, d)
            if os.path.isdir(d_path):
                for f in sorted(os.listdir(d_path)):
                    if f.endswith((".flac", ".wav", ".mp3")):
                        emotion = os.path.splitext(f)[0]
                        voices.append({
                            "id": f"voice-zero/{d}-{emotion}",
                            "display_name": f"{d.replace('_', ' ').title()} ({emotion.title()})",
                            "source": "Voice-Zero (Emotional)",
                            "cloning_required": True
                        })
                        
    # 4. User Cloned Voices
    if os.path.exists(CUSTOM_VOICES_DIR):
        for f in sorted(os.listdir(CUSTOM_VOICES_DIR)):
            if f.endswith((".flac", ".wav", ".mp3")):
                name = os.path.splitext(f)[0]
                voices.append({
                    "id": f"custom/{name}",
                    "display_name": f"{name.replace('_', ' ').title()} (Custom)",
                    "source": "Custom Clone",
                    "cloning_required": True
                })
                
    return voices

async def get_or_create_voice_state(voice_id: str):
    """Loads and compiles voice state prompt embeddings, caching them in memory."""
    global tts_model, cloning_available
    
    if voice_id in voice_state_cache:
        return voice_state_cache[voice_id]
        
    path = resolve_voice_path(voice_id)
    if not path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail=f"Voice ID '{voice_id}' could not be resolved."
        )
        
    if path == "builtin":
        try:
            async with pytorch_semaphore:
                state = tts_model.get_state_for_audio_prompt(voice_id)
            voice_state_cache[voice_id] = state
            return state
        except Exception as e:
            logger.error(f"Failed to load built-in voice {voice_id}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to load built-in voice preset: {str(e)}"
            )
    else:
        try:
            async with pytorch_semaphore:
                state = tts_model.get_state_for_audio_prompt(path)
            voice_state_cache[voice_id] = state
            return state
        except Exception as e:
            logger.error(f"Failed to compile voice prompt from file {path}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to compile zero-shot voice prompt: {str(e)}"
            )

def float_to_pcm16(audio: torch.Tensor) -> bytes:
    """Converts a float tensor to raw 16-bit PCM bytes."""
    audio = torch.clamp(audio, -1.0, 1.0)
    audio = (audio * 32767.0).to(torch.int16)
    return audio.numpy().tobytes()

def resample_chunk(chunk: torch.Tensor, speed: float) -> torch.Tensor:
    """Modifies the playback speed of an audio chunk via interpolation."""
    if speed == 1.0 or speed <= 0:
        return chunk
    xp = np.arange(len(chunk))
    x_new = np.arange(0, len(chunk), speed)
    resampled = np.interp(x_new, xp, chunk.numpy())
    return torch.from_numpy(resampled).float()

def get_wav_header(sample_rate: int, channels: int = 1, bits_per_sample: int = 16, data_size: int = 0) -> bytes:
    """Builds a standard 44-byte WAV header template."""
    file_size = data_size + 36
    header = bytearray(44)
    header[0:4] = b'RIFF'
    header[4:8] = file_size.to_bytes(4, 'little')
    header[8:12] = b'WAVE'
    header[12:16] = b'fmt '
    header[16:20] = (16).to_bytes(4, 'little')
    header[20:22] = (1).to_bytes(2, 'little')
    header[22:24] = channels.to_bytes(2, 'little')
    header[24:28] = sample_rate.to_bytes(4, 'little')
    header[28:32] = (sample_rate * channels * bits_per_sample // 8).to_bytes(4, 'little')
    header[32:34] = (channels * bits_per_sample // 8).to_bytes(2, 'little')
    header[34:36] = bits_per_sample.to_bytes(2, 'little')
    header[36:40] = b'data'
    header[40:44] = data_size.to_bytes(4, 'little')
    return bytes(header)

def split_text_into_chunks(text: str, max_chars: int = 120) -> List[str]:
    """Splits a long paragraph by sentence boundaries, then by commas if too long."""
    raw_sentences = re.split(r'(?<=[.!?])\s+', text)
    chunks = []
    for s in raw_sentences:
        s = s.strip()
        if not s:
            continue
        if len(s) <= max_chars:
            chunks.append(s)
        else:
            sub_parts = re.split(r'(?<=[,;])\s+', s)
            current_chunk = ""
            for part in sub_parts:
                part = part.strip()
                if not part:
                    continue
                if len(current_chunk) + len(part) + 1 <= max_chars:
                    current_chunk = f"{current_chunk} {part}".strip()
                else:
                    if current_chunk:
                        chunks.append(current_chunk)
                    current_chunk = part
            if current_chunk:
                chunks.append(current_chunk)
    return chunks

# Lifecycle Manager
@asynccontextmanager
async def lifespan_mgr(app: FastAPI):
    global tts_model, cloning_available
    
    logger.info("Initializing SQLite database connection schema...")
    try:
        import db_manager
        db_manager.init_db()
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")
        
    logger.info("Initializing Kyutai pocket-tts model weights...")
    try:
        from pocket_tts import TTSModel
        tts_model = TTSModel.load_model()
        logger.info("Model loaded in memory successfully.")
        
        # Test cloning weights availability
        try:
            import tempfile
            import scipy.io.wavfile
            
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                dummy_path = tmp.name
                
            scipy.io.wavfile.write(dummy_path, 24000, np.zeros(24000, dtype=np.int16))
            _ = tts_model.get_state_for_audio_prompt(dummy_path)
            cloning_available = True
            logger.info("Voice cloning/zero-shot weights verified. Custom cloning enabled!")
            
            try:
                os.remove(dummy_path)
            except:
                pass
        except Exception as e:
            logger.warning(
                "Zero-shot voice cloning weights are unavailable (Model is gated). "
                "Falling back to Built-in Catalog voices only. "
                "To enable custom cloning, accept terms at https://huggingface.co/kyutai/pocket-tts "
                "and log in by setting the HF_TOKEN environment variable."
            )
            cloning_available = False
            
    except Exception as e:
        logger.critical(f"Failed to load core TTS model: {e}")
        sys.exit(1)
        
    yield
    logger.info("Shutting down Shero-TTS service...")

# Web App Definition
app = FastAPI(
    title="Shero-TTS Mini-Service API",
    description="Sleek API wrapping Kyutai Labs' pocket-tts with voice-zero catalog loading.",
    version="1.0.0",
    lifespan=lifespan_mgr,
    root_path="/api"
)

# CORS Policy configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Security dependencies
security_bearer = HTTPBearer(auto_error=False)
api_key_query = APIKeyQuery(name="token", auto_error=False)
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

# Session store for logged-in admin sessions (in-memory)
active_admin_sessions = set()

async def authenticate_request(
    q_token: Optional[str] = Security(api_key_query),
    h_token: Optional[str] = Security(api_key_header),
    auth_creds: Optional[HTTPAuthorizationCredentials] = Depends(security_bearer)
):
    token = None
    if auth_creds:
        token = auth_creds.credentials
    elif h_token:
        token = h_token
    elif q_token:
        token = q_token

    import db_manager
    if not token or not db_manager.verify_api_token(token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid, missing, or revoked API Token. Authenticate via Bearer header or '?token=' query parameter."
        )
    return token

async def authenticate_admin(
    auth_creds: Optional[HTTPAuthorizationCredentials] = Depends(security_bearer)
):
    token = None
    if auth_creds:
        token = auth_creds.credentials
        
    if not token or token not in active_admin_sessions:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired admin session token."
        )
    return token

# API schemas
class SpeechRequest(pydantic.BaseModel):
    model: str = "pocket-tts"
    input: str
    voice: str = "alba"
    response_format: str = "mp3"  # mp3, wav, pcm
    speed: float = 1.0
    stream: bool = True

class AdminLoginRequest(pydantic.BaseModel):
    username: str
    password: str

class TokenCreateRequest(pydantic.BaseModel):
    name: str

# Parallel Worker Inference Core
def run_cpu_inference(chunk_text: str, voice_state, speed: float) -> bytes:
    """Executes single sequence inference on a single core (releasing the GIL)."""
    logger.info(f"Parallel Worker starting inference: '{chunk_text[:30]}...'")
    try:
        chunks = []
        for audio_chunk in tts_model.generate_audio_stream(voice_state, chunk_text):
            if speed != 1.0 and speed > 0:
                audio_chunk = resample_chunk(audio_chunk, speed)
            chunks.append(audio_chunk)
        if not chunks:
            return b""
        full_audio = torch.cat(chunks)
        return float_to_pcm16(full_audio)
    except Exception as e:
        logger.error(f"Parallel Worker inference failed: {e}")
        return b""

async def generate_chunk_audio(chunk_text: str, voice_state, speed: float) -> bytes:
    """Acquires CPU semaphore and schedules CPU-bound execution in a worker thread."""
    async with pytorch_semaphore:
        return await asyncio.to_thread(run_cpu_inference, chunk_text, voice_state, speed)

# Response Generator Core
async def audio_stream_generator(voice_state, text: str, response_format: str, speed: float):
    try:
        text_chunks = split_text_into_chunks(text)
        logger.info(f"Segmented input into {len(text_chunks)} parallel processing chunks.")
        
        # Dispatch all chunk generations concurrently to the ThreadPool
        tasks = [
            generate_chunk_audio(chunk, voice_state, speed)
            for chunk in text_chunks
        ]
        
        if response_format == "wav":
            yield get_wav_header(sample_rate=tts_model.sample_rate)
            
        elif response_format == "mp3":
            encoder = lameenc.Encoder()
            encoder.set_bit_rate(128)
            encoder.set_in_sample_rate(tts_model.sample_rate)
            encoder.set_channels(1)
            encoder.set_quality(2)
            
        # Yield completed chunks in reading order (streaming begins as soon as chunk 1 completes!)
        for i, task in enumerate(tasks):
            pcm_bytes = await task
            if not pcm_bytes:
                continue
                
            if response_format == "mp3":
                mp3_data = encoder.encode(pcm_bytes)
                if mp3_data:
                    yield bytes(mp3_data)
            else:
                yield pcm_bytes
                
        if response_format == "mp3":
            flushed = encoder.flush()
            if flushed:
                yield bytes(flushed)
                
    except Exception as e:
        logger.error(f"Inference streaming generation error: {e}")
        raise HTTPException(status_code=500, detail=f"Generation failed: {str(e)}")

async def generate_full_audio(voice_state, text: str, response_format: str, speed: float) -> bytes:
    try:
        text_chunks = split_text_into_chunks(text)
        logger.info(f"Static generation segmented into {len(text_chunks)} parallel chunks.")
        
        tasks = [
            generate_chunk_audio(chunk, voice_state, speed)
            for chunk in text_chunks
        ]
        
        # Await completion of all chunks concurrently
        pcm_parts = await asyncio.gather(*tasks)
        pcm_bytes = b"".join([p for p in pcm_parts if p])
        
        if not pcm_bytes:
            raise Exception("Generation returned no audio data.")
            
        if response_format == "pcm":
            return pcm_bytes
            
        elif response_format == "wav":
            header = bytearray(get_wav_header(sample_rate=tts_model.sample_rate))
            data_size = len(pcm_bytes)
            file_size = data_size + 36
            header[4:8] = file_size.to_bytes(4, 'little')
            header[40:44] = data_size.to_bytes(4, 'little')
            return bytes(header) + pcm_bytes
            
        elif response_format == "mp3":
            encoder = lameenc.Encoder()
            encoder.set_bit_rate(128)
            encoder.set_in_sample_rate(tts_model.sample_rate)
            encoder.set_channels(1)
            encoder.set_quality(2)
            mp3_data = encoder.encode(pcm_bytes)
            mp3_data += encoder.flush()
            return bytes(mp3_data)
        else:
            raise Exception(f"Unsupported format: {response_format}")
    except Exception as e:
        logger.error(f"Static inference failed: {e}")
        raise e

# ==================== Core Endpoints ====================

@app.get("/health")
async def health_check():
    global cloning_available
    return {
        "status": "online",
        "cloning_capability": "enabled" if cloning_available else "disabled_gated_weights",
        "loaded_model": "pocket-tts (100M parameter CALM)",
        "cached_voice_states": len(voice_state_cache)
    }

@app.get("/v1/voices")
async def list_voices(token: str = Depends(authenticate_request)):
    return {"voices": get_available_voices()}

@app.get("/v1/models")
async def list_models(token: str = Depends(authenticate_request)):
    return {
        "object": "list",
        "data": [
            {
                "id": "pocket-tts",
                "object": "model",
                "created": 1720000000,
                "owned_by": "kyutai-labs"
            }
        ]
    }

@app.post("/v1/audio/speech")
async def text_to_speech(request: SpeechRequest, token: str = Depends(authenticate_request)):
    voice_id = request.voice
    text = request.input.strip()
    
    if not text:
        raise HTTPException(status_code=400, detail="Input text cannot be empty.")
        
    response_format = request.response_format.lower()
    if response_format not in ("mp3", "wav", "pcm"):
        raise HTTPException(status_code=400, detail=f"Response format must be mp3, wav, or pcm. Got {response_format}")
        
    voice_state = await get_or_create_voice_state(voice_id)
    
    mime_mapping = {
        "mp3": "audio/mpeg",
        "wav": "audio/wav",
        "pcm": "audio/pcm"
    }
    media_type = mime_mapping[response_format]
    
    if request.stream:
        return StreamingResponse(
            audio_stream_generator(voice_state, text, response_format, request.speed),
            media_type=media_type
        )
    else:
        try:
            audio_bytes = await generate_full_audio(voice_state, text, response_format, request.speed)
            return Response(content=audio_bytes, media_type=media_type)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Inference failed: {str(e)}")

@app.get("/v1/audio/speech")
async def text_to_speech_get(
    input: str,
    voice: str = "alba",
    response_format: str = "mp3",
    speed: float = 1.0,
    stream: bool = True,
    token: str = Depends(authenticate_request)
):
    text = input.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Input text cannot be empty.")
        
    response_format = response_format.lower()
    if response_format not in ("mp3", "wav", "pcm"):
        raise HTTPException(status_code=400, detail=f"Response format must be mp3, wav, or pcm. Got {response_format}")
        
    voice_state = await get_or_create_voice_state(voice)
    
    mime_mapping = {
        "mp3": "audio/mpeg",
        "wav": "audio/wav",
        "pcm": "audio/pcm"
    }
    media_type = mime_mapping[response_format]
    
    if stream:
        return StreamingResponse(
            audio_stream_generator(voice_state, text, response_format, speed),
            media_type=media_type
        )
    else:
        try:
            audio_bytes = await generate_full_audio(voice_state, text, response_format, speed)
            return Response(content=audio_bytes, media_type=media_type)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Inference failed: {str(e)}")

@app.post("/v1/voices/clone")
async def clone_voice(
    file: UploadFile = File(...),
    name: str = Form(...),
    token: str = Depends(authenticate_request)
):
    global cloning_available, tts_model
    
    if not cloning_available:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Voice cloning is disabled on this server. "
                "Zero-shot voice cloning requires Hugging Face authentication to download cloning model weights. "
                "Please configure HF_TOKEN in the server environment."
            )
        )
        
    safe_name = "".join([c for c in name if c.isalnum() or c in ("-", "_")]).strip()
    if not safe_name:
        raise HTTPException(status_code=400, detail="Invalid/empty voice name provided.")
        
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in (".wav", ".flac", ".mp3"):
        raise HTTPException(
            status_code=400, 
            detail="Only WAV, FLAC, and MP3 audio samples are supported for voice cloning."
        )
        
    dest_path = os.path.join(CUSTOM_VOICES_DIR, f"{safe_name}{file_ext}")
    
    try:
        with open(dest_path, "wb") as f:
            while chunk := await file.read(65536):
                f.write(chunk)
                
        logger.info(f"Saved custom cloning file: {dest_path}")
        
        voice_id = f"custom/{safe_name}"
        async with pytorch_semaphore:
            state = tts_model.get_state_for_audio_prompt(dest_path)
        voice_state_cache[voice_id] = state
        
        return {"status": "success", "voice_id": voice_id}
    except Exception as e:
        logger.error(f"Cloning compilation failed: {e}")
        if os.path.exists(dest_path):
            os.remove(dest_path)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to save and process cloning sample: {str(e)}"
        )

# ==================== Admin Panel Endpoints ====================

@app.post("/admin/login")
async def admin_login(request: AdminLoginRequest):
    import db_manager
    if db_manager.verify_admin(request.username, request.password):
        session_token = "admin_" + secrets.token_hex(24)
        active_admin_sessions.add(session_token)
        return {"status": "success", "session_token": session_token}
    else:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid admin username or password credentials."
        )

@app.get("/admin/tokens")
async def list_tokens(admin_token: str = Depends(authenticate_admin)):
    import db_manager
    return {"tokens": db_manager.list_api_tokens()}

@app.post("/admin/tokens")
async def create_token(request: TokenCreateRequest, admin_token: str = Depends(authenticate_admin)):
    import db_manager
    name = request.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Token description name cannot be empty.")
    new_raw_token = db_manager.create_api_token(name)
    return {"status": "success", "token": new_raw_token}

@app.delete("/admin/tokens/{token_id}")
async def revoke_token(token_id: int, admin_token: str = Depends(authenticate_admin)):
    import db_manager
    db_manager.revoke_api_token(token_id)
    return {"status": "success", "detail": f"Token ID {token_id} successfully revoked and deleted."}

@app.post("/admin/logout")
async def admin_logout(admin_token: str = Depends(authenticate_admin)):
    active_admin_sessions.remove(admin_token)
    return {"status": "success", "detail": "Admin session terminated."}

if __name__ == "__main__":
    import uvicorn
    # Standard entry point
    uvicorn.run("main:app", host="0.0.0.0", port=6767, reload=False)
