# JD vs Resume Matcher Bot (Telegram)

## Quick Start
1. Create a virtual env and install deps:
   ```powershell
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   ```
2. Copy `.env.example` to `.env` and fill in your keys:
   ```powershell
   Copy-Item .env.example .env
   ```
3. Run the bot:
   ```powershell
   python bot.py
   ```

## Usage
- Send `/start`
- Paste the Job Description
- Paste the Resume or upload a PDF

## Next Step
Replace the stub `analyze_jd_resume` in `bot.py` with your OpenAI call.