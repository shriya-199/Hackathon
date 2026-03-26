const fs = require("fs");
const path = require("path");

const SECTION_KEYWORDS = {
  summary: ["summary", "profile", "objective", "about"],
  skills: ["skills", "technical skills", "technologies", "expertise"],
  experience: ["experience", "work experience", "employment", "professional experience"],
  projects: ["projects", "personal projects", "academic projects"],
};

const SECTION_ORDER = ["summary", "skills", "experience", "projects"];
const DEFAULT_TEMPLATE = "simple";
const TEMPLATE_TYPES = new Set(["simple", "modern"]);
const TEMP_DIR_NAME = "temp";
const PDF_CONFIG = {
  format: "A4",
  printBackground: true,
  margin: {
    top: "20mm",
    right: "15mm",
    bottom: "20mm",
    left: "15mm",
  },
};
const BROWSER_CANDIDATES = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);

const HEADING_PREFIX_PATTERN =
  /^(summary|profile|objective|about|skills|technical skills|technologies|expertise|experience|work experience|employment|professional experience|projects|personal projects|academic projects)\s*[:\-]\s*/i;

const SIMPLE_THEME = {
  pageBackground: "#ffffff",
  pageText: "#16202a",
  subText: "#334e68",
  heading: "#102a43",
  divider: "#d9e2ec",
  headerDivider: "#243b53",
  shellPadding: "44px 48px 40px",
  contentWidth: "860px",
};

const MODERN_THEME = {
  pageBackground: "#f4f7fb",
  pageText: "#1f2933",
  subText: "#486581",
  heading: "#102a43",
  divider: "#cbd2d9",
  cardBorder: "#d9e2ec",
  sidebarBackground: "#f8fbff",
  shellPadding: "22px",
  contentWidth: "980px",
};

function formatResume(resumeText) {
  const lines = toLines(resumeText);
  const resume = createEmptyResume();
  let currentSection = null;

  lines.forEach((line, index) => {
    if (index === 0) {
      resume.name = line;
      return;
    }

    const detectedSection = detectSection(normalizeHeading(line));

    if (detectedSection) {
      currentSection = detectedSection;
      return;
    }

    if (!currentSection) {
      resume.summary = appendSentence(resume.summary, line);
      return;
    }

    if (currentSection === "summary") {
      resume.summary = appendSentence(resume.summary, line);
      return;
    }

    if (currentSection === "skills") {
      resume.skills.push(...splitItems(line));
      return;
    }

    resume[currentSection].push(cleanBullet(line));
  });

  return resume;
}

function generateHTMLResume(data) {
  const resume = normalizeResumeData(data);
  const sectionMarkup = [
    renderParagraphSection("Summary", resume.summary, SIMPLE_THEME),
    renderListSection("Skills", resume.skills, SIMPLE_THEME),
    renderListSection("Experience", resume.experience, SIMPLE_THEME),
    renderListSection("Projects", resume.projects, SIMPLE_THEME),
  ]
    .filter(Boolean)
    .join("");

  return wrapHtmlDocument({
    title: resume.name || "Resume",
    bodyStyle: `margin: 0; padding: 0; background-color: ${SIMPLE_THEME.pageBackground}; color: ${SIMPLE_THEME.pageText}; font-family: 'Helvetica Neue', Arial, sans-serif; line-height: 1.6;`,
    content: `<div style="max-width: ${SIMPLE_THEME.contentWidth}; margin: 0 auto; padding: ${SIMPLE_THEME.shellPadding};">
    <header style="margin-bottom: 30px; padding-bottom: 18px; border-bottom: 2px solid ${SIMPLE_THEME.headerDivider};">
      <h1 style="margin: 0; font-size: 34px; font-weight: 700; letter-spacing: 0.01em; color: ${SIMPLE_THEME.heading};">${escapeHtml(resume.name)}</h1>
    </header>
    ${sectionMarkup}
  </div>`,
  });
}

function generateModernHTMLResume(data) {
  const resume = normalizeResumeData(data);
  const contactItems = normalizeContact(resume.contact);
  const sidebarMarkup = [
    renderListSection("Contact", contactItems, MODERN_THEME, { indent: "18px", itemSpacing: "9px", headingSize: "15px" }),
    renderListSection("Skills", resume.skills, MODERN_THEME, { headingSize: "15px" }),
  ]
    .filter(Boolean)
    .join("");
  const mainMarkup = [
    renderListSection("Experience", resume.experience, MODERN_THEME, { headingSize: "15px" }),
    renderListSection("Projects", resume.projects, MODERN_THEME, { headingSize: "15px" }),
  ]
    .filter(Boolean)
    .join("");

  return wrapHtmlDocument({
    title: resume.name || "Resume",
    bodyStyle: `margin: 0; padding: ${MODERN_THEME.shellPadding}; background-color: ${MODERN_THEME.pageBackground}; color: ${MODERN_THEME.pageText}; font-family: 'Helvetica Neue', Arial, sans-serif; line-height: 1.6;`,
    content: `<div style="max-width: ${MODERN_THEME.contentWidth}; margin: 0 auto; background-color: #ffffff; border: 1px solid ${MODERN_THEME.cardBorder};">
    <header style="padding: 34px 38px 24px; border-bottom: 1px solid ${MODERN_THEME.divider}; background-color: #ffffff;">
      <h1 style="margin: 0 0 10px; font-size: 34px; font-weight: 700; color: ${MODERN_THEME.heading}; letter-spacing: 0.01em;">${escapeHtml(resume.name)}</h1>
      ${resume.summary ? `<p style="margin: 0; max-width: 700px; font-size: 15px; color: ${MODERN_THEME.subText};">${escapeHtml(resume.summary)}</p>` : ""}
    </header>
    <div style="display: table; width: 100%; table-layout: fixed;">
      <aside style="display: table-cell; width: 31%; vertical-align: top; background-color: ${MODERN_THEME.sidebarBackground}; padding: 30px 24px 32px; border-right: 1px solid ${MODERN_THEME.cardBorder};">
        ${sidebarMarkup}
      </aside>
      <main style="display: table-cell; width: 69%; vertical-align: top; padding: 30px 34px 32px;">
        ${mainMarkup}
      </main>
    </div>
  </div>`,
  });
}

async function generatePDF(htmlContent, options = {}) {
  const puppeteer = loadPuppeteer();
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: resolveBrowserExecutablePath(),
  });
  const filePath = getOutputFilePath(options.fileName);

  ensureDirectory(path.dirname(filePath));

  try {
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(60000);
    await page.setContent(String(htmlContent || ""), { waitUntil: "load", timeout: 60000 });
    await page.pdf({
      path: filePath,
      ...PDF_CONFIG,
    });

    return filePath;
  } finally {
    await browser.close();
  }
}

function loadPuppeteer() {
  try {
    return require("puppeteer");
  } catch (error) {
    if (error.code !== "MODULE_NOT_FOUND") {
      throw error;
    }

    return require("puppeteer-core");
  }
}

async function deleteResumeFile(filePath) {
  if (!filePath) {
    return false;
  }

  try {
    await fs.promises.unlink(filePath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

async function buildResumePDF(resumeText, templateType = DEFAULT_TEMPLATE) {
  const cleanedResumeText = preprocessResumeText(resumeText);
  const structuredResume = sanitizeStructuredResume(formatResume(cleanedResumeText));
  const selectedTemplate = normalizeTemplateType(templateType);
  const htmlContent = renderResumeTemplate(structuredResume, selectedTemplate);

  return generatePDF(htmlContent);
}

function renderResumeTemplate(resumeData, templateType) {
  if (templateType === "modern") {
    return generateModernHTMLResume(resumeData);
  }

  return generateHTMLResume(resumeData);
}

function normalizeTemplateType(templateType) {
  const normalized = String(templateType || DEFAULT_TEMPLATE).toLowerCase();
  return TEMPLATE_TYPES.has(normalized) ? normalized : DEFAULT_TEMPLATE;
}

function preprocessResumeText(resumeText) {
  const cleanedLines = [];

  toLines(resumeText).forEach((line) => {
    const plainLine = line.replace(/^#+\s*/, "");
    const normalizedLine = normalizeHeading(plainLine);
    const previousLine = cleanedLines[cleanedLines.length - 1];

    if (normalizedLine && detectSection(normalizedLine)) {
      if (previousLine !== plainLine) {
        cleanedLines.push(plainLine);
      }
      return;
    }

    if (previousLine !== plainLine) {
      cleanedLines.push(plainLine);
    }
  });

  return cleanedLines.join("\n");
}

function sanitizeStructuredResume(data) {
  const resume = normalizeResumeData(data);

  return {
    ...resume,
    name: cleanSectionText(resume.name),
    summary: cleanSectionText(resume.summary, "summary"),
    skills: dedupeList(resume.skills.map((item) => cleanSectionText(item, "skills"))),
    experience: dedupeList(resume.experience.map((item) => cleanSectionText(item, "experience"))),
    projects: dedupeList(resume.projects.map((item) => cleanSectionText(item, "projects"))),
  };
}

function normalizeResumeData(data) {
  const resume = data || {};

  return {
    name: String(resume.name || "").trim(),
    summary: String(resume.summary || "").trim(),
    skills: ensureArray(resume.skills),
    experience: ensureArray(resume.experience),
    projects: ensureArray(resume.projects),
    contact: resume.contact || null,
  };
}

function createEmptyResume() {
  return {
    name: "",
    summary: "",
    skills: [],
    experience: [],
    projects: [],
  };
}

function renderParagraphSection(title, content, theme) {
  if (!content) {
    return "";
  }

  return `<section style="margin-bottom: 26px; padding-top: 2px;">
      ${renderSectionHeading(title, theme)}
      <p style="margin: 0; font-size: 14px; color: ${theme.subText};">${escapeHtml(content)}</p>
    </section>`;
}

function renderListSection(title, items, theme, options = {}) {
  const validItems = items.filter(Boolean);

  if (validItems.length === 0) {
    return "";
  }

  const indent = options.indent || "20px";
  const itemSpacing = options.itemSpacing || "10px";
  const headingSize = options.headingSize || "16px";
  const listItems = validItems
    .map((item) => `<li style="margin-bottom: ${itemSpacing};">${escapeHtml(item)}</li>`)
    .join("");

  return `<section style="margin-bottom: 30px;">
      ${renderSectionHeading(title, theme, headingSize)}
      <ul style="margin: 0; padding-left: ${indent}; font-size: 14px; color: ${theme.subText};">${listItems}</ul>
    </section>`;
}

function renderSectionHeading(title, theme, size = "16px") {
  return `<h2 style="margin: 0 0 12px; padding-bottom: 8px; border-bottom: 1px solid ${theme.divider}; font-size: ${size}; font-weight: 700; color: ${theme.heading}; text-transform: uppercase; letter-spacing: 0.06em;">${title}</h2>`;
}

function wrapHtmlDocument({ title, bodyStyle, content }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
</head>
<body style="${bodyStyle}">
  ${content}
</body>
</html>`;
}

function normalizeContact(contact) {
  if (!contact) {
    return [];
  }

  if (Array.isArray(contact)) {
    return contact.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof contact === "object") {
    return Object.entries(contact)
      .filter(([, value]) => value)
      .map(([key, value]) => `${capitalize(key)}: ${String(value).trim()}`);
  }

  return [String(contact).trim()].filter(Boolean);
}

function cleanSectionText(value, currentSection) {
  let text = cleanBullet(String(value || "").trim());

  if (!text) {
    return "";
  }

  const normalized = normalizeHeading(text);
  const sectionName = detectSection(normalized);

  if (sectionName) {
    return currentSection && sectionName === currentSection ? "" : text;
  }

  return text.replace(HEADING_PREFIX_PATTERN, "").trim();
}

function splitItems(line) {
  return String(line || "")
    .split(/[|,]/)
    .map((item) => cleanBullet(item))
    .filter(Boolean);
}

function dedupeList(items) {
  const seen = new Set();

  return items.filter((item) => {
    const value = String(item || "").trim();

    if (!value) {
      return false;
    }

    const key = value.toLowerCase();

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function detectSection(line) {
  for (const section of SECTION_ORDER) {
    if (SECTION_KEYWORDS[section].includes(line)) {
      return section;
    }
  }

  return null;
}

function normalizeHeading(line) {
  return String(line || "")
    .toLowerCase()
    .replace(/[:\s-]+$/, "")
    .trim();
}

function cleanBullet(text) {
  return String(text || "").replace(/^[-*•]\s*/, "").trim();
}

function ensureArray(value) {
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : [];
}

function toLines(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function appendSentence(currentValue, nextValue) {
  const left = String(currentValue || "").trim();
  const right = String(nextValue || "").trim();

  if (!left) {
    return right;
  }

  if (!right) {
    return left;
  }

  return `${left} ${right}`;
}

function getOutputFilePath(fileName) {
  const safeName = fileName || `resume_${Date.now()}.pdf`;
  return path.join(process.cwd(), TEMP_DIR_NAME, safeName);
}

function ensureDirectory(directoryPath) {
  fs.mkdirSync(directoryPath, { recursive: true });
}

function resolveBrowserExecutablePath() {
  for (const candidate of BROWSER_CANDIDATES) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    "No Chromium-based browser executable found. Set PUPPETEER_EXECUTABLE_PATH or install Chrome/Edge."
  );
}

function capitalize(value) {
  const text = String(value || "");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

module.exports = {
  buildResumePDF,
  deleteResumeFile,
  formatResume,
  generateHTMLResume,
  generateModernHTMLResume,
  generatePDF,
  preprocessResumeText,
  sanitizeStructuredResume,
};
