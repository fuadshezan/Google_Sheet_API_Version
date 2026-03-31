import os
import json
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

def load_credentials():
    """
    Load credentials from:
    1. Local file (development)
    2. Environment variable (production)
    """

    # ✅ Local development
    if Path("credentials.json").exists():
        with open("credentials.json") as f:
            return json.load(f)

    # ✅ Production (Render env)
    env_json = os.getenv("CREDENTIALS_JSON")
    if env_json:
        return json.loads(env_json)

    raise RuntimeError("Credentials not found")