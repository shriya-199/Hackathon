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


# --- Session store ---
userSessions: dict[int, dict[str, str]] = {}


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
    tailored_resume_text: str


# --- ATS config ---
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


def extract_keywords(text: str, limit: int = 20) -> list[str]:
    words = re.split(r"[^a-z0-9+#./-]+", normalize_text(text))
    candidates = [word for word in words if len(word) >= 4]
    return dedupe_keep_order(candidates)[:limit]


# --- File extraction ---
def extract_text_from_pdf_bytes(pdf_bytes: bytes) -> str:
    text_parts: list[str] = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text() or ""
            if page_text.strip():
                text_parts.append(page_text.strip())
    return "\n".join(text_parts).strip()


def extract_text_from_txt_bytes(file_bytes: bytes) -> str:
    for encoding in ("utf-8", "utf-8-sig", "latin-1"):
        try:
            return file_bytes.decode(encoding).strip()
        except UnicodeDecodeError:
            continue
    raise ValueError("Could not decode text file.")


async def extract_text_from_message(update: Update, mode: str, allow_txt: bool) -> str:
    message = update.message
    if not message:
        raise ValueError("Message not found.")

    if message.text and message.text.strip():
        return message.text.strip()

    document = message.document
    if not document:
        raise ValueError(f"Please send the {mode} as text or supported file.")

    file_name = (document.file_name or "").lower()
    mime_type = (document.mime_type or "").lower()
    telegram_file = await document.get_file()
    file_bytes = bytes(await telegram_file.download_as_bytearray())

    if file_name.endswith(".pdf") or mime_type == "application/pdf":
        content = extract_text_from_pdf_bytes(file_bytes)
    elif allow_txt and (file_name.endswith(".txt") or mime_type == "text/plain"):
        content = extract_text_from_txt_bytes(file_bytes)
    else:
        raise ValueError("Unsupported file")

    if not content.strip():
        raise ValueError(f"The {mode} content is empty.")

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


# --- ATS logic ---
def extract_required_skills(jd_text: str) -> list[str]:
    normalized_jd = normalize_text(jd_text)
    matched = [format_skill(skill) for skill in KNOWN_SKILLS if contains_skill(normalized_jd, skill)]
    return dedupe_keep_order(matched)


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


def identify_weak_sections(
    parsed_resume: ParsedResume,
    missing_skills: list[str],
    experience_relevance: float,
    keyword_presence: float,
) -> list[str]:
    weak_sections: list[str] = []

    if len(parsed_resume.summary) < 60 or keyword_presence < 0.45:
        weak_sections.append("summary")
    if len(parsed_resume.skills) < 5 or missing_skills:
        weak_sections.append("skills")
    if len(parsed_resume.experience) < 2 or experience_relevance < 0.5:
        weak_sections.append("experience")
    if len(parsed_resume.projects) < 1:
        weak_sections.append("projects")

    return weak_sections


def identify_irrelevant_content(jd_text: str, parsed_resume: ParsedResume) -> list[str]:
    jd_keywords = set(extract_keywords(jd_text, limit=24))
    candidates = parsed_resume.experience + parsed_resume.projects
    irrelevant: list[str] = []

    for item in candidates:
        normalized = normalize_text(item)
        if normalized and not any(keyword in normalized for keyword in jd_keywords):
            irrelevant.append(item)

    return dedupe_keep_order(irrelevant)[:5]


def generate_suggestions(
    parsed_resume: ParsedResume,
    missing_skills: list[str],
    weak_sections: list[str],
    irrelevant_content: list[str],
) -> list[str]:
    suggestions: list[str] = []

    if missing_skills:
        suggestions.append(f"Add missing JD skills naturally where truthful: {', '.join(missing_skills[:5])}.")
    if "summary" in weak_sections:
        suggestions.append("Rewrite the summary to reflect the target role, technologies, and business value.")
    if "skills" in weak_sections:
        suggestions.append("Prioritize JD-matched technologies in the skills section and remove weaker unrelated items.")
    if "experience" in weak_sections:
        suggestions.append("Align experience bullets with JD responsibilities and include measurable outcomes.")
    if "projects" in weak_sections:
        suggestions.append("Improve project descriptions with JD keywords, tech stack details, and metrics.")
    if irrelevant_content:
        suggestions.append(f"Reduce or remove weak content not supporting the JD: {'; '.join(irrelevant_content[:3])}.")

    return [f"- {item}" for item in dedupe_keep_order(suggestions)]


def rewrite_resume(parsed_resume: ParsedResume, jd_text: str, missing_skills: list[str]) -> str:
    final_skills = dedupe_keep_order(parsed_resume.skills + [skill for skill in missing_skills if skill in {"Docker", "Git", "REST APIs", "AWS", "SQL"}][:3])
    summary_skills = ", ".join(final_skills[:6]) if final_skills else "relevant technologies"
    role_hint = extract_role_hint(jd_text)

    tailored_summary = (
        f"{parsed_resume.summary} Tailored for {role_hint}, with emphasis on {summary_skills}, "
        "cross-functional delivery, and ATS-friendly alignment to the job description."
    ).strip()

    tailored_experience = [
        rewrite_experience_line(
            line,
            final_skills[index % len(final_skills)] if final_skills else "relevant technologies",
            12 + index * 8,
        )
        for index, line in enumerate(parsed_resume.experience or ["Delivered engineering work aligned to role expectations."])
    ]

    tailored_projects = [
        rewrite_project_line(
            line,
            final_skills[(index + 1) % len(final_skills)] if final_skills else "modern web technologies",
            18 + index * 10,
        )
        for index, line in enumerate(parsed_resume.projects or ["Built a project aligned to the target role."])
    ]

    lines = [
        parsed_resume.name or "Candidate",
        "Summary",
        tailored_summary,
        "",
        "Skills",
        ", ".join(final_skills),
        "",
        "Experience",
        *[f"- {line}" for line in tailored_experience],
        "",
        "Projects",
        *[f"- {line}" for line in tailored_projects],
    ]

    return "\n".join(item for item in lines if item is not None)


def rewrite_experience_line(line: str, skill_hint: str, metric: int) -> str:
    cleaned = clean_bullet(line).rstrip(".")
    return f"Improved {cleaned.lower()} using {skill_hint}, increasing delivery quality or efficiency by {metric}%."


def rewrite_project_line(line: str, skill_hint: str, metric: int) -> str:
    cleaned = clean_bullet(line).rstrip(".")
    return f"Built {cleaned.lower()} using {skill_hint}, improving performance, scalability, or usability by {metric}%."


def extract_role_hint(jd_text: str) -> str:
    match = re.search(r"(software engineer|frontend developer|backend developer|full stack developer|developer|engineer)", jd_text, re.IGNORECASE)
    if match:
        return match.group(1)
    return "the target role"


def processResume(jd_text: str, resume_text: str) -> ATSResult:
    if not clean_line(jd_text):
        raise ValueError("Job description is empty.")
    if not clean_line(resume_text):
        raise ValueError("Resume text is empty.")

    parsed_resume = parse_resume(resume_text)
    required_skills = extract_required_skills(jd_text)
    resume_skills = {format_skill(skill) for skill in parsed_resume.skills}
    missing_skills = [skill for skill in required_skills if skill not in resume_skills]
    matched_skills = [skill for skill in required_skills if skill in resume_skills]
    experience_relevance = calculate_experience_relevance(jd_text, parsed_resume)
    keyword_presence = calculate_keyword_presence(jd_text, parsed_resume)
    weak_sections = identify_weak_sections(parsed_resume, missing_skills, experience_relevance, keyword_presence)
    irrelevant_content = identify_irrelevant_content(jd_text, parsed_resume)

    skill_match_ratio = 0.5 if not required_skills else len(matched_skills) / len(required_skills)
    score = round((skill_match_ratio * 0.5 + experience_relevance * 0.3 + keyword_presence * 0.2) * 10, 1)

    suggestions = generate_suggestions(parsed_resume, missing_skills, weak_sections, irrelevant_content)
    tailored_resume_text = rewrite_resume(parsed_resume, jd_text, missing_skills) if score < SCORE_THRESHOLD else resume_text

    explanation = (
        f"ATS score is {score}/10. "
        f"Matched skills: {', '.join(matched_skills) if matched_skills else 'limited direct matches'}. "
        f"Missing skills: {', '.join(missing_skills) if missing_skills else 'none identified'}. "
        f"Weak sections: {', '.join(weak_sections) if weak_sections else 'none'}. "
        f"Keyword coverage is {round(keyword_presence * 100)}%."
    )

    return ATSResult(
        score=score,
        explanation=explanation,
        missing_skills=missing_skills,
        suggestions=suggestions,
        tailored_resume_text=tailored_resume_text,
    )


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


# --- Handlers ---
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    try:
        user_id = update.effective_user.id
        userSessions[user_id] = {
            "step": "waiting_jd",
            "jd": "",
            "resume": "",
        }
        logger.info("User %s started flow. Step=waiting_jd", user_id)
        await update.message.reply_text("Please send Job Description (text / PDF / TXT)")
    except Exception as exc:
        logger.exception("Start handler failed")
        await safe_reply(update, f"Failed to start conversation: {exc}")


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user_id = update.effective_user.id if update.effective_user else None

    try:
        if user_id is None or user_id not in userSessions:
            await update.message.reply_text("Type /start to begin")
            return

        session = userSessions[user_id]
        step = session.get("step")
        logger.info("Received message from user %s at step=%s", user_id, step)

        if step == "waiting_jd":
            jd_text = await extract_text_from_message(update, "job description", allow_txt=True)
            if not clean_line(jd_text):
                await update.message.reply_text("JD is empty. Please send valid JD text / PDF / TXT.")
                return

            session["jd"] = jd_text
            session["step"] = "waiting_resume"
            logger.info("Stored JD for user %s. Step=waiting_resume", user_id)
            await update.message.reply_text("Now send your Resume (text / PDF)")
            return

        if step == "waiting_resume":
            resume_text = await extract_text_from_message(update, "resume", allow_txt=False)
            if not clean_line(resume_text):
                await update.message.reply_text("Resume is empty. Please send valid resume text / PDF.")
                return

            session["resume"] = resume_text
            logger.info("Stored resume for user %s. Processing started", user_id)
            await update.message.reply_text("Processing your resume...")

            result = processResume(session["jd"], session["resume"])

            await update.message.reply_text(
                f"*Score:* {result.score}/10\n\n*Explanation:* {result.explanation}",
                parse_mode=ParseMode.MARKDOWN,
            )

            if result.suggestions:
                await update.message.reply_text(
                    "*Suggestions:*\n" + "\n".join(result.suggestions),
                    parse_mode=ParseMode.MARKDOWN,
                )

            pdf_path = create_resume_pdf(result.tailored_resume_text)
            logger.info("Generated tailored PDF for user %s at %s", user_id, pdf_path)

            with open(pdf_path, "rb") as pdf_file:
                await context.bot.send_document(
                    chat_id=update.effective_chat.id,
                    document=InputFile(pdf_file, filename=Path(pdf_path).name),
                    caption="Here is your updated resume PDF.",
                )

            del userSessions[user_id]
            logger.info("Session cleared for user %s", user_id)
            return

        await update.message.reply_text("Type /start to begin")
    except ValueError as exc:
        logger.exception("Validation error for user %s", user_id)
        message = str(exc)
        if message == "Unsupported file":
            await safe_reply(update, "Unsupported file")
        else:
            await safe_reply(update, message)
    except Exception as exc:
        logger.exception("Unexpected error for user %s", user_id)
        await safe_reply(update, f"Something went wrong: {exc}")


async def safe_reply(update: Update, text: str) -> None:
    try:
        if update.message:
            await update.message.reply_text(text)
    except Exception:
        logger.exception("Failed to send reply")


def main() -> None:
    app = ApplicationBuilder().token(TELEGRAM_BOT_TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(MessageHandler(filters.TEXT | filters.Document.ALL, handle_message))

    logger.info("Bot started")
    app.run_polling()


if __name__ == "__main__":
    main()
