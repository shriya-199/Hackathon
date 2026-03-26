const fs = require("fs");
const path = require("path");

const TEMP_DIR_NAME = "temp";
const DEFAULT_TEMPLATE = "structured";
const PDF_CONFIG = {
  format: "A4",
  printBackground: true,
  preferCSSPageSize: true,
  margin: {
    top: "10mm",
    right: "10mm",
    bottom: "10mm",
    left: "10mm",
  },
};

const BROWSER_CANDIDATES = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);

function normalizeResumeData(data) {
  const input = data || {};
  const contact = input.contact || {};

  return {
    name: String(input.name || "").trim(),
    contact: {
      linkedin: String(contact.linkedin || "").trim(),
      github: String(contact.github || "").trim(),
      email: String(contact.email || "").trim(),
      phone: String(contact.phone || "").trim(),
    },
    skills: normalizeSkills(input.skills),
    projects: normalizeProjects(input.projects),
    training: normalizeTraining(input.training),
    certificates: normalizeStringList(input.certificates),
    achievements: normalizeStringList(input.achievements),
    education: normalizeEducation(input.education),
  };
}

function normalizeSkills(skills) {
  const defaults = {
    languages: [],
    webTechnologies: [],
    frameworksLibraries: [],
    databaseMessaging: [],
    toolsCloudDevOpsPlatforms: [],
    coreCSFundamentals: [],
    softSkills: [],
  };

  if (!skills || typeof skills !== "object") {
    return defaults;
  }

  return {
    languages: normalizeStringList(skills.languages),
    webTechnologies: normalizeStringList(skills.webTechnologies),
    frameworksLibraries: normalizeStringList(skills.frameworksLibraries),
    databaseMessaging: normalizeStringList(skills.databaseMessaging),
    toolsCloudDevOpsPlatforms: normalizeStringList(skills.toolsCloudDevOpsPlatforms),
    coreCSFundamentals: normalizeStringList(skills.coreCSFundamentals),
    softSkills: normalizeStringList(skills.softSkills),
  };
}

function normalizeProjects(projects) {
  if (!Array.isArray(projects)) {
    return [];
  }

  return projects
    .map((project) => ({
      title: String(project?.title || "").trim(),
      liveLink: String(project?.liveLink || "").trim(),
      date: String(project?.date || "").trim(),
      bullets: normalizeStringList(project?.bullets),
    }))
    .filter((project) => project.title);
}

function normalizeTraining(training) {
  if (!Array.isArray(training)) {
    return [];
  }

  return training
    .map((item) => ({
      role: String(item?.role || "").trim(),
      institute: String(item?.institute || "").trim(),
      date: String(item?.date || "").trim(),
      bullets: normalizeStringList(item?.bullets),
    }))
    .filter((item) => item.role || item.institute);
}

function normalizeEducation(education) {
  if (!Array.isArray(education)) {
    return [];
  }

  return education
    .map((item) => ({
      degree: String(item?.degree || "").trim(),
      college: String(item?.college || "").trim(),
      location: String(item?.location || "").trim(),
      dates: String(item?.dates || "").trim(),
    }))
    .filter((item) => item.degree || item.college);
}

function normalizeStringList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set();
  return value
    .map((item) => String(item || "").trim())
    .filter((item) => {
      if (!item) {
        return false;
      }

      const key = item.toLowerCase();
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
}

function generateStructuredResumeHTML(data) {
  const resume = normalizeResumeData(data);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(resume.name || "Resume")}</title>
  <style>
    @page {
      size: A4;
      margin: 10mm;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      color: #111827;
      background: #ffffff;
      font-family: Helvetica, Arial, sans-serif;
      font-size: 10.5pt;
      line-height: 1.34;
    }

    .page {
      width: 100%;
      padding: 0;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 12px;
    }

    .header-left,
    .header-right {
      width: 48%;
    }

    .header-right {
      text-align: right;
    }

    .name {
      margin: 0 0 6px;
      font-size: 22pt;
      font-weight: 700;
      letter-spacing: 0.01em;
    }

    .contact-line {
      margin: 2px 0;
      font-size: 9.8pt;
    }

    .section {
      margin-top: 10px;
      padding-top: 8px;
      border-top: 1.5px solid #1f2937;
    }

    .section-title {
      margin: 0 0 8px;
      font-size: 11pt;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .skill-list,
    .bullet-list {
      margin: 0;
      padding-left: 16px;
    }

    .skill-list li,
    .bullet-list li {
      margin: 0 0 4px;
    }

    .entry {
      margin-bottom: 10px;
    }

    .entry:last-child {
      margin-bottom: 0;
    }

    .entry-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 3px;
    }

    .entry-title {
      font-weight: 700;
    }

    .entry-date,
    .entry-location {
      white-space: nowrap;
      text-align: right;
      font-size: 9.8pt;
    }

    .project-title-line {
      display: flex;
      align-items: baseline;
      flex-wrap: wrap;
      gap: 6px;
    }

    .live-link {
      font-size: 9.5pt;
      color: #1d4ed8;
      text-decoration: none;
    }

    .edu-meta {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 1px;
    }

    .plain-list {
      margin: 0;
      padding-left: 16px;
    }

    .plain-list li {
      margin-bottom: 4px;
    }
  </style>
</head>
<body>
  <div class="page">
    ${renderHeader(resume)}
    ${renderSkillsSection(resume.skills)}
    ${renderProjectsSection(resume.projects)}
    ${renderTrainingSection(resume.training)}
    ${renderSimpleBulletSection("CERTIFICATES", resume.certificates)}
    ${renderSimpleBulletSection("ACHIEVEMENTS", resume.achievements)}
    ${renderEducationSection(resume.education)}
  </div>
</body>
</html>`;
}

function renderHeader(resume) {
  return `<header class="header">
    <div class="header-left">
      <h1 class="name">${escapeHtml(resume.name)}</h1>
      ${resume.contact.linkedin ? `<div class="contact-line">${escapeHtml(resume.contact.linkedin)}</div>` : ""}
      ${resume.contact.github ? `<div class="contact-line">${escapeHtml(resume.contact.github)}</div>` : ""}
    </div>
    <div class="header-right">
      ${resume.contact.email ? `<div class="contact-line">${escapeHtml(resume.contact.email)}</div>` : ""}
      ${resume.contact.phone ? `<div class="contact-line">${escapeHtml(resume.contact.phone)}</div>` : ""}
    </div>
  </header>`;
}

function renderSkillsSection(skills) {
  const items = [
    renderSkillCategory("Languages", skills.languages),
    renderSkillCategory("Web Technologies", skills.webTechnologies),
    renderSkillCategory("Frameworks & Libraries", skills.frameworksLibraries),
    renderSkillCategory("Database & Messaging", skills.databaseMessaging),
    renderSkillCategory("Tools, Cloud, DevOps & Platforms", skills.toolsCloudDevOpsPlatforms),
    renderSkillCategory("Core CS Fundamentals", skills.coreCSFundamentals),
    renderSkillCategory("Soft Skills", skills.softSkills),
  ].filter(Boolean);

  if (items.length === 0) {
    return "";
  }

  return `<section class="section">
    <h2 class="section-title">SKILLS</h2>
    <ul class="skill-list">${items.join("")}</ul>
  </section>`;
}

function renderSkillCategory(label, values) {
  if (!values || values.length === 0) {
    return "";
  }

  return `<li><strong>${escapeHtml(label)}:</strong> ${escapeHtml(values.join(", "))}</li>`;
}

function renderProjectsSection(projects) {
  if (!projects.length) {
    return "";
  }

  return `<section class="section">
    <h2 class="section-title">PROJECT</h2>
    ${projects.map(renderProjectEntry).join("")}
  </section>`;
}

function renderProjectEntry(project) {
  const bullets = project.bullets.length
    ? `<ul class="bullet-list">${project.bullets.map(renderBullet).join("")}</ul>`
    : "";

  return `<div class="entry">
    <div class="entry-head">
      <div class="project-title-line">
        <span class="entry-title">${escapeHtml(project.title)}</span>
        ${project.liveLink ? `<a class="live-link" href="${escapeAttribute(project.liveLink)}">Live</a>` : ""}
      </div>
      ${project.date ? `<div class="entry-date">${escapeHtml(project.date)}</div>` : ""}
    </div>
    ${bullets}
  </div>`;
}

function renderTrainingSection(training) {
  if (!training.length) {
    return "";
  }

  return `<section class="section">
    <h2 class="section-title">TRAINING</h2>
    ${training.map(renderTrainingEntry).join("")}
  </section>`;
}

function renderTrainingEntry(item) {
  const label = [item.role, item.institute].filter(Boolean).join(" — ");
  const bullets = item.bullets.length
    ? `<ul class="bullet-list">${item.bullets.map(renderBullet).join("")}</ul>`
    : "";

  return `<div class="entry">
    <div class="entry-head">
      <div class="entry-title">${escapeHtml(label)}</div>
      ${item.date ? `<div class="entry-date">${escapeHtml(item.date)}</div>` : ""}
    </div>
    ${bullets}
  </div>`;
}

function renderSimpleBulletSection(title, items) {
  if (!items.length) {
    return "";
  }

  return `<section class="section">
    <h2 class="section-title">${escapeHtml(title)}</h2>
    <ul class="plain-list">${items.map(renderBullet).join("")}</ul>
  </section>`;
}

function renderEducationSection(education) {
  if (!education.length) {
    return "";
  }

  return `<section class="section">
    <h2 class="section-title">EDUCATION</h2>
    ${education.map(renderEducationEntry).join("")}
  </section>`;
}

function renderEducationEntry(item) {
  const label = [item.degree, item.college].filter(Boolean).join(" — ");

  return `<div class="entry">
    <div class="entry-head">
      <div class="entry-title">${escapeHtml(label)}</div>
      <div class="edu-meta">
        ${item.location ? `<div class="entry-location">${escapeHtml(item.location)}</div>` : ""}
        ${item.dates ? `<div class="entry-date">${escapeHtml(item.dates)}</div>` : ""}
      </div>
    </div>
  </div>`;
}

function renderBullet(text) {
  return `<li>${escapeHtml(text)}</li>`;
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
    await page.setContent(String(htmlContent || ""), {
      waitUntil: "load",
      timeout: 60000,
    });
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

async function buildResumePDF(resumeData, templateType = DEFAULT_TEMPLATE, options = {}) {
  if (!resumeData || typeof resumeData !== "object") {
    throw new Error("Structured resume JSON is required.");
  }

  const htmlContent = generateStructuredResumeHTML(resumeData, templateType);
  return generatePDF(htmlContent, options);
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

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

module.exports = {
  buildResumePDF,
  deleteResumeFile,
  generatePDF,
  generateStructuredResumeHTML,
  normalizeResumeData,
};
