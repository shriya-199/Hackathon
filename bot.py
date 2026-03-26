import io
import logging
import os
from dataclasses import dataclass
from typing import Optional

import pdfplumber
from dotenv import load_dotenv
from telegram import Update
from telegram.constants import ParseMode
from telegram.ext import ApplicationBuilder, CommandHandler, ContextTypes, MessageHandler, filters

# --- Config ---
load_dotenv()
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")  # change if needed

if not TELEGRAM_BOT_TOKEN:
    raise RuntimeError("Missing TELEGRAM_BOT_TOKEN in environment. Add it to .env")

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)


# --- Data structures ---
@dataclass
class AnalysisResult:
    score_out_of_10: float
    missing_skills: list[str]
    suggestions: list[str]
    improved_resume: str


# --- Helpers ---
def extract_text_from_pdf_bytes(pdf_bytes: bytes) -> str:
    text_parts: list[str] = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text() or ""
            text_parts.append(page_text)
    return "\n".join(text_parts).strip()


def analyze_jd_resume(jd_text: str, resume_text: str) -> AnalysisResult:
    """
    Placeholder AI analysis. Replace with OpenAI call.
    """
    # TODO: call OpenAI with jd_text + resume_text
    # For now return a stub so the bot end-to-end works.
    return AnalysisResult(
        score_out_of_10=6.5,
        missing_skills=["Docker", "Kubernetes", "System Design"],
        suggestions=[
            "Add measurable impact in experience bullets",
            "Align skills section with JD keywords",
            "Highlight relevant projects with tech stack",
        ],
        improved_resume=(
            "SUMMARY\n"
            "Results-driven software engineer with experience in backend development and cloud services.\n\n"
            "SKILLS\n"
            "Python, JavaScript, SQL, AWS, REST APIs\n\n"
            "EXPERIENCE\n"
            "Software Engineer, Acme Corp (2022–Present)\n"
            "- Built REST APIs that reduced latency by 30%\n"
            "- Migrated services to AWS and improved uptime to 99.9%\n"
        ),
    )


# --- Handlers ---
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    context.user_data.clear()
    context.user_data["state"] = "awaiting_jd"
    await update.message.reply_text(
        "Send the Job Description (text)."
    )


async def handle_text(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    state = context.user_data.get("state")

    if state == "awaiting_jd":
        context.user_data["jd_text"] = update.message.text
        context.user_data["state"] = "awaiting_resume"
        await update.message.reply_text(
            "Got the JD. Now send the resume (paste text or upload PDF)."
        )
        return

    if state == "awaiting_resume":
        resume_text = update.message.text
        await process_resume(update, context, resume_text)
        return

    await update.message.reply_text("Type /start to begin.")


async def handle_document(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    state = context.user_data.get("state")
    if state != "awaiting_resume":
        await update.message.reply_text("Please send the JD first. Type /start to begin.")
        return

    doc = update.message.document
    if not doc:
        await update.message.reply_text("Please upload a PDF resume.")
        return

    if doc.mime_type != "application/pdf":
        await update.message.reply_text("Only PDF resumes are supported for uploads. Please send a PDF.")
        return

    file = await doc.get_file()
    pdf_bytes = await file.download_as_bytearray()
    resume_text = extract_text_from_pdf_bytes(bytes(pdf_bytes))
    if not resume_text:
        await update.message.reply_text("Could not extract text from the PDF. Please paste the resume text instead.")
        return

    await process_resume(update, context, resume_text)


async def process_resume(update: Update, context: ContextTypes.DEFAULT_TYPE, resume_text: str) -> None:
    jd_text = context.user_data.get("jd_text")
    if not jd_text:
        await update.message.reply_text("Missing JD. Type /start to begin.")
        return

    await update.message.reply_text("Analyzing JD vs Resume...")

    try:
        result = analyze_jd_resume(jd_text, resume_text)
    except Exception as exc:
        logger.exception("Analysis failed")
        await update.message.reply_text(f"Analysis failed: {exc}")
        return

    summary = (
        f"*Score:* {result.score_out_of_10}/10\n\n"
        f"*Missing Skills:*\n- " + "\n- ".join(result.missing_skills) + "\n\n"
        f"*Suggestions:*\n- " + "\n- ".join(result.suggestions)
    )

    await update.message.reply_text(summary, parse_mode=ParseMode.MARKDOWN)
    await update.message.reply_text(
        "Here is an improved resume draft:\n\n" + result.improved_resume
    )

    # reset for next run
    context.user_data.clear()


def main() -> None:
    app = ApplicationBuilder().token(TELEGRAM_BOT_TOKEN).build()

    app.add_handler(CommandHandler("start", start))
    app.add_handler(MessageHandler(filters.Document.PDF, handle_document))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_text))

    logger.info("Bot started")
    app.run_polling()


if __name__ == "__main__":
    main()