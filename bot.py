import io
import logging
import os
import re
from dataclasses import dataclass
from pathlib import Path

import pdfplumber
from dotenv import load_dotenv
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import ListFlowable, ListItem, Paragraph, SimpleDocTemplate, Spacer
from telegram import InputFile, Update
from telegram.constants import ParseMode
from telegram.ext import ApplicationBuilder, CommandHandler, ContextTypes, MessageHandler, filters

# --- Config ---
load_dotenv()
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TEMP_DIR = Path(__file__).resolve().parent / "temp"
SCORE_THRESHOLD = 8.5

if not TELEGRAM_BOT_TOKEN:
    raise RuntimeError("Missing TELEGRAM_BOT_TOKEN in environment. Add it to .env")

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)


# --- Data structures ---
@dataclass
class ParsedResume:
    name: str
    summary: str
    skills: list[str]
    experience: list[str]
    projects: list[str]


@dataclass
class ATSResult:
    score: float
    explanation: str
    missing_skills: list[str]
    suggestions: list[str]
    updated_resume_text: str


# --- ATS keyword config ---
KNOWN_SKILLS = [
    "javascript",
    "typescript",
    "node.js",
    "node",
    "react",
    "angular",
    "vue",
    "mongodb",
    "postgresql",
    "mysql",
    "sql",
    "python",
    "java",
    "aws",
    "azure",
    "gcp",
    "docker",
    "kubernetes",
    "html",
    "css",
    "git",
    "rest api",
    "rest",
    "graphql",
    "express",
    "next.js",
    "tailwind",
    "linux",
    "ci/cd",
    "jenkins",
    "agile",
    "testing",
    "unit testing",
    "api development",
    "microservices",
    "system design",
]

SKILL_ALIASES = {
    "node": "Node.js",
    "node.js": "Node.js",
    "javascript": "JavaScript",
    "typescript": "TypeScript",
    "react": "React",
    "angular": "Angular",
    "vue": "Vue",
    "mongodb": "MongoDB",
    "postgresql": "PostgreSQL",
    "mysql": "MySQL",
    "sql": "SQL",
    "python": "Python",
    "java": "Java",
    "aws": "AWS",
    "azure": "Azure",
    "gcp": "GCP",
    "docker": "Docker",
    "kubernetes": "Kubernetes",
    "html": "HTML",
    "css": "CSS",
    "git": "Git",
    "rest api": "REST APIs",
    "rest": "REST APIs",
    "graphql": "GraphQL",
    "express": "Express",
    "next.js": "Next.js",
    "tailwind": "Tailwind CSS",
    "linux": "Linux",
    "ci/cd": "CI/CD",
    "jenkins": "Jenkins",
    "agile": "Agile",
    "testing": "Testing",
    "unit testing": "Unit Testing",
    "api development": "API Development",
    "microservices": "Microservices",
    "system design": "System Design",
}


# --- Text helpers ---
def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", str(text or "").lower()).strip()


def clean_line(line: str) -> str:
    return re.sub(r"\s+", " ", str(line or "")).strip()


def clean_bullet(text: str) -> str:
    return re.sub(r"^[-*•]\s*", "", str(text or "")).strip()


def dedupe_keep_order(items: list[str]) -> list[str]:
    seen: set[str] = set()
    output: list[str] = []
    for item in items:
        value = clean_line(item)
        if not value:
            continue
        key = value.lower()
        if key in seen:
            continue
        seen.add(key)
        output.append(value)
    return output


def format_skill(skill: str) -> str:
    normalized = normalize_text(skill)
    if normalized in SKILL_ALIASES:
        return SKILL_ALIASES[normalized]
    return " ".join(part.capitalize() for part in skill.split())


def contains_skill(text: str, skill: str) -> bool:
    pattern = re.compile(rf"(^|[^a-z0-9+#./-]){re.escape(skill)}([^a-z0-9+#./-]|$)", re.IGNORECASE)
    return bool(pattern.search(text))


# --- File extraction ---
def extract_text_from_pdf_bytes(pdf_bytes: bytes) -> str:
    text_parts: list[str] = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            text_parts.append(page.extract_text() or "")
    return "\n".join(part.strip() for part in text_parts if part.strip()).strip()


def extract_text_from_txt_bytes(file_bytes: bytes) -> str:
    for encoding in ("utf-8", "utf-8-sig", "latin-1"):
        try:
            return file_bytes.decode(encoding).strip()
        except UnicodeDecodeError:
            continue
    raise ValueError("Could not decode text file.")


async def extract_message_text(update: Update, mode: str) -> str:
    message = update.message
    if not message:
        raise ValueError("Message not found.")

    if message.text and message.text.strip():
        return message.text.strip()

    document = message.document
    if not document:
        raise ValueError(f"Please send the {mode} as text, .txt, or PDF.")

    file_name = (document.file_name or "").lower()
    mime_type = (document.mime_type or "").lower()
    telegram_file = await document.get_file()
    file_bytes = bytes(await telegram_file.download_as_bytearray())

    if file_name.endswith(".txt") or mime_type == "text/plain":
        content = extract_text_from_txt_bytes(file_bytes)
    elif file_name.endswith(".pdf") or mime_type == "application/pdf":
        content = extract_text_from_pdf_bytes(file_bytes)
    else:
        raise ValueError("Unsupported file type. Please send plain text, a .txt file, or a PDF.")

    if not content.strip():
        raise ValueError(f"The {mode} file is empty or unreadable.")

    return content.strip()


# --- Resume parsing ---
def parse_resume(resume_text: str) -> ParsedResume:
    lines = [clean_line(line) for line in str(resume_text or "").splitlines() if clean_line(line)]

    if not lines:
        raise ValueError("Resume text is empty.")

    section_map = {
        "summary": {"summary", "profile", "objective", "about"},
        "skills": {"skills", "technical skills", "technologies", "expertise"},
        "experience": {"experience", "work experience", "employment", "professional experience"},
        "projects": {"projects", "personal projects", "academic projects"},
    }

    parsed = ParsedResume(name=lines[0], summary="", skills=[], experience=[], projects=[])
    current_section = "summary"

    for line in lines[1:]:
        normalized = normalize_text(line).rstrip(":")
        detected = None
        for section, keywords in section_map.items():
            if normalized in keywords:
                detected = section
                break

        if detected:
            current_section = detected
            continue

        if current_section == "summary":
            parsed.summary = f"{parsed.summary} {line}".strip()
        elif current_section == "skills":
            parsed.skills.extend(clean_bullet(item) for item in re.split(r"[|,]", line) if clean_bullet(item))
        elif current_section == "experience":
            parsed.experience.append(clean_bullet(line))
        elif current_section == "projects":
            parsed.projects.append(clean_bullet(line))

    parsed.skills = dedupe_keep_order(parsed.skills)
    parsed.experience = dedupe_keep_order(parsed.experience)
    parsed.projects = dedupe_keep_order(parsed.projects)

    if not parsed.summary:
        parsed.summary = "Professional candidate with relevant experience."

    return parsed


# --- ATS analysis ---
def extract_required_skills(jd_text: str) -> list[str]:
    normalized_jd = normalize_text(jd_text)
    matched = [format_skill(skill) for skill in KNOWN_SKILLS if contains_skill(normalized_jd, skill)]
    return dedupe_keep_order(matched)


def extract_keywords(text: str, limit: int = 20) -> list[str]:
    words = re.split(r"[^a-z0-9+#./-]+", normalize_text(text))
    candidates = [word for word in words if len(word) >= 4]
    return dedupe_keep_order(candidates)[:limit]


def calculate_experience_relevance(jd_text: str, parsed_resume: ParsedResume) -> float:
    jd_keywords = extract_keywords(jd_text)
    if not jd_keywords:
        return 0.5

    resume_corpus = normalize_text(" ".join([parsed_resume.summary] + parsed_resume.experience + parsed_resume.projects))
    matches = sum(1 for keyword in jd_keywords if keyword in resume_corpus)
    return min(1.0, matches / len(jd_keywords))


def calculate_keyword_presence(jd_text: str, parsed_resume: ParsedResume) -> float:
    jd_keywords = extract_keywords(jd_text)
    if not jd_keywords:
        return 0.5

    resume_corpus = normalize_text(
        " ".join([parsed_resume.summary] + parsed_resume.skills + parsed_resume.experience + parsed_resume.projects)
    )
    matches = sum(1 for keyword in jd_keywords if keyword in resume_corpus)
    return min(1.0, matches / len(jd_keywords))


def analyze_ats(jd_text: str, parsed_resume: ParsedResume) -> ATSResult:
    if not clean_line(jd_text):
        raise ValueError("Job description is empty.")

    required_skills = extract_required_skills(jd_text)
    resume_skills = {format_skill(skill) for skill in parsed_resume.skills}
    matched_skills = [skill for skill in required_skills if skill in resume_skills]
    missing_skills = [skill for skill in required_skills if skill not in resume_skills]

    skill_match_ratio = 0.5 if not required_skills else len(matched_skills) / len(required_skills)
    experience_relevance = calculate_experience_relevance(jd_text, parsed_resume)
    keyword_presence = calculate_keyword_presence(jd_text, parsed_resume)

    score = round((skill_match_ratio * 0.5 + experience_relevance * 0.3 + keyword_presence * 0.2) * 10, 1)
    explanation = (
        f"ATS score is {score}/10. "
        f"Matched skills: {', '.join(matched_skills) if matched_skills else 'limited direct matches'}. "
        f"Missing skills: {', '.join(missing_skills) if missing_skills else 'none identified'}. "
        f"Experience relevance is {round(experience_relevance * 100)}%. "
        f"Keyword coverage is {round(keyword_presence * 100)}%."
    )

    suggestions = generate_suggestions(parsed_resume, missing_skills, experience_relevance, keyword_presence)
    updated_resume_text = rewrite_resume(parsed_resume, jd_text, missing_skills)

    return ATSResult(
        score=score,
        explanation=explanation,
        missing_skills=missing_skills,
        suggestions=suggestions,
        updated_resume_text=updated_resume_text,
    )


def generate_suggestions(
    parsed_resume: ParsedResume,
    missing_skills: list[str],
    experience_relevance: float,
    keyword_presence: float,
) -> list[str]:
    suggestions: list[str] = []

    if missing_skills:
        suggestions.append(f"Add JD-relevant skills where truthful: {', '.join(missing_skills[:5])}.")

    if len(parsed_resume.skills) < 5:
        suggestions.append("Expand the skills section with role-relevant tools, platforms, and frameworks.")

    if len(parsed_resume.summary) < 60 or keyword_presence < 0.45:
        suggestions.append("Strengthen the summary with target role keywords and a clearer value proposition.")

    if len(parsed_resume.experience) < 2 or experience_relevance < 0.5:
        suggestions.append("Improve experience bullets by adding outcomes, ownership, and technologies used.")

    if not parsed_resume.projects:
        suggestions.append("Add a project section aligned with the job description.")
    else:
        suggestions.append("Rewrite projects to include the tech stack, scope, and measurable impact.")

    return [f"- {item}" for item in dedupe_keep_order(suggestions)]


def rewrite_resume(parsed_resume: ParsedResume, jd_text: str, missing_skills: list[str]) -> str:
    target_keywords = extract_required_skills(jd_text)
    realistic_additions = [skill for skill in missing_skills if skill in {"Docker", "REST APIs", "Git", "AWS", "SQL"}][:3]
    final_skills = dedupe_keep_order(parsed_resume.skills + realistic_additions)
    headline_skills = ", ".join(final_skills[:6]) if final_skills else "web development"

    improved_summary = (
        f"{parsed_resume.summary} Tailored for ATS screening with emphasis on {headline_skills}, "
        "collaboration, and delivery of maintainable user-focused solutions."
    ).strip()

    improved_experience = [
        rewrite_experience_line(line, final_skills[index % len(final_skills)] if final_skills else "relevant technologies")
        for index, line in enumerate(parsed_resume.experience or ["Delivered engineering work aligned to business and product goals."])
    ]

    improved_projects = [
        rewrite_project_line(line, final_skills[(index + 1) % len(final_skills)] if final_skills else "modern web technologies")
        for index, line in enumerate(parsed_resume.projects or ["Built a project aligned to the target job requirements."])
    ]

    sections = [
        parsed_resume.name or "Candidate",
        "Summary",
        improved_summary,
        "",
        "Skills",
        ", ".join(final_skills),
        "",
        "Experience",
        *[f"- {line}" for line in improved_experience],
        "",
        "Projects",
        *[f"- {line}" for line in improved_projects],
    ]

    return "\n".join(item for item in sections if item is not None)


def rewrite_experience_line(line: str, skill_hint: str) -> str:
    cleaned = clean_bullet(line).rstrip(".")
    return f"{cleaned}, using {skill_hint} with clear ownership, delivery focus, and measurable impact."


def rewrite_project_line(line: str, skill_hint: str) -> str:
    cleaned = clean_bullet(line).rstrip(".")
    return f"{cleaned}, highlighting {skill_hint}, implementation detail, and ATS-friendly keyword alignment."


# --- PDF generation with reportlab ---
def create_resume_pdf(resume_text: str, file_name: str | None = None) -> str:
    parsed_resume = parse_resume(resume_text)
    TEMP_DIR.mkdir(parents=True, exist_ok=True)
    output_path = TEMP_DIR / (file_name or f"resume_{int(Path.cwd().stat().st_mtime_ns)}.pdf")

    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="ResumeHeading",
            parent=styles["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=12,
            textColor=colors.HexColor("#1f3a5f"),
            spaceAfter=8,
            spaceBefore=8,
        )
    )
    styles.add(
        ParagraphStyle(
            name="ResumeName",
            parent=styles["Title"],
            fontName="Helvetica-Bold",
            fontSize=20,
            textColor=colors.HexColor("#102a43"),
            spaceAfter=12,
        )
    )
    styles.add(
        ParagraphStyle(
            name="ResumeBody",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=10,
            leading=14,
            textColor=colors.HexColor("#243b53"),
        )
    )

    story = [
        Paragraph(parsed_resume.name, styles["ResumeName"]),
        Paragraph("Summary", styles["ResumeHeading"]),
        Paragraph(parsed_resume.summary, styles["ResumeBody"]),
        Spacer(1, 4),
        Paragraph("Skills", styles["ResumeHeading"]),
        Paragraph(", ".join(parsed_resume.skills), styles["ResumeBody"]),
        Spacer(1, 4),
        Paragraph("Experience", styles["ResumeHeading"]),
        build_bullet_list(parsed_resume.experience, styles["ResumeBody"]),
        Spacer(1, 4),
        Paragraph("Projects", styles["ResumeHeading"]),
        build_bullet_list(parsed_resume.projects, styles["ResumeBody"]),
    ]

    doc = SimpleDocTemplate(
        str(output_path),
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
    )
    doc.build(story)
    return str(output_path)


def build_bullet_list(items: list[str], style: ParagraphStyle) -> ListFlowable:
    safe_items = items or ["No details provided."]
    bullets = [ListItem(Paragraph(item, style), leftIndent=8) for item in safe_items]
    return ListFlowable(bullets, bulletType="bullet", start="circle", leftIndent=12)


# --- Telegram handlers ---
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    try:
        context.user_data.clear()
        context.user_data["state"] = "awaiting_jd"
        await update.message.reply_text(
            "Send the Job Description as text, a .txt file, or a PDF."
        )
    except Exception as exc:
        logger.exception("Start handler failed")
        await safe_reply(update, f"Failed to start conversation: {exc}")


async def handle_text(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    try:
        state = context.user_data.get("state")

        if state == "awaiting_jd":
            jd_text = await extract_message_text(update, "job description")
            context.user_data["jd_text"] = jd_text
            context.user_data["state"] = "awaiting_resume"
            await update.message.reply_text("Job Description received. Now send the resume as text or PDF.")
            return

        if state == "awaiting_resume":
            resume_text = await extract_message_text(update, "resume")
            await process_resume(update, context, resume_text)
            return

        await update.message.reply_text("Type /start to begin.")
    except Exception as exc:
        logger.exception("Text handler failed")
        await safe_reply(update, f"Could not process the message: {exc}")


async def handle_document(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    try:
        state = context.user_data.get("state")

        if state == "awaiting_jd":
            jd_text = await extract_message_text(update, "job description")
            context.user_data["jd_text"] = jd_text
            context.user_data["state"] = "awaiting_resume"
            await update.message.reply_text("Job Description received. Now send the resume as text or PDF.")
            return

        if state == "awaiting_resume":
            resume_text = await extract_message_text(update, "resume")
            await process_resume(update, context, resume_text)
            return

        await update.message.reply_text("Type /start to begin.")
    except Exception as exc:
        logger.exception("Document handler failed")
        await safe_reply(update, f"Could not process the file: {exc}")


async def process_resume(update: Update, context: ContextTypes.DEFAULT_TYPE, resume_text: str) -> None:
    try:
        jd_text = context.user_data.get("jd_text", "").strip()
        if not jd_text:
            await update.message.reply_text("Missing JD. Type /start to begin.")
            return

        if not clean_line(resume_text):
            await update.message.reply_text("Resume is empty. Please send resume text or a PDF.")
            return

        await update.message.reply_text("Analyzing JD and resume...")

        parsed_resume = parse_resume(resume_text)
        ats_result = analyze_ats(jd_text, parsed_resume)
        final_resume_text = resume_text if ats_result.score >= SCORE_THRESHOLD else ats_result.updated_resume_text
        pdf_path = create_resume_pdf(final_resume_text)

        score_message = (
            f"*ATS Score:* {ats_result.score}/10\n\n"
            f"*Explanation:* {ats_result.explanation}\n\n"
            f"*Missing Skills:* {', '.join(ats_result.missing_skills) if ats_result.missing_skills else 'None'}"
        )
        await update.message.reply_text(score_message, parse_mode=ParseMode.MARKDOWN)

        if ats_result.score < SCORE_THRESHOLD:
            suggestion_text = "*Suggestions:*\n" + "\n".join(ats_result.suggestions)
            await update.message.reply_text(suggestion_text, parse_mode=ParseMode.MARKDOWN)
            await update.message.reply_text(
                "*Updated Resume Preview:*\n```text\n" + final_resume_text[:3500] + "\n```",
                parse_mode=ParseMode.MARKDOWN,
            )
        else:
            await update.message.reply_text("Your resume is strong. Sending the generated PDF.")

        with open(pdf_path, "rb") as pdf_file:
            await context.bot.send_document(
                chat_id=update.effective_chat.id,
                document=InputFile(pdf_file, filename=Path(pdf_path).name),
                caption="Here is your processed resume PDF.",
            )

        context.user_data.clear()
    except Exception as exc:
        logger.exception("Resume processing failed")
        await safe_reply(update, f"Processing failed: {exc}")


async def safe_reply(update: Update, text: str) -> None:
    try:
        if update.message:
            await update.message.reply_text(text)
    except Exception:
        logger.exception("Failed to send error reply")


def main() -> None:
    app = ApplicationBuilder().token(TELEGRAM_BOT_TOKEN).build()

    app.add_handler(CommandHandler("start", start))
    app.add_handler(MessageHandler(filters.Document.ALL, handle_document))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_text))

    logger.info("Bot started")
    app.run_polling()


if __name__ == "__main__":
    main()
