"""
AI Agent Configuration
"""
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# OpenAI Configuration
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')
OPENAI_MODEL = "gpt-3.5-turbo"

# File paths
FEEDBACK_LOG_FILE = "feedback_log.json"
DECISION_RULES_FILE = "decision_rules.json"
DEBUG_LOG_FILE = "../adminlte/dist/debug-reporting.js"

# AI Agent Settings
CONFIDENCE_THRESHOLD = 0.8  # Minimum confidence to make decision without asking
MAX_FEEDBACK_HISTORY = 100  # Maximum number of feedback entries to keep
ASK_USER_DELAY = 2  # Seconds to wait before asking user

# Log patterns to monitor
CROSS_DECISION_PATTERN = "CROSS-DECISION"
ANCHOR_PATTERN = "matched_ids"
CROSSING_PATTERN = "CROSSING"

# Decision types
DECISION_TYPES = ["ANO", "NE", "PROČ"]
