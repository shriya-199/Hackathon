const { buildResumePDF } = require("./formatResume");

const KNOWN_SKILLS = [
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
  "redis",
  "jira",
  "communication",
  "leadership",
  "problem solving",
  "teamwork",
];

const RESPONSIBILITY_HINTS = [
  "build",
  "develop",
  "design",
  "maintain",
  "optimize",
  "deploy",
  "collaborate",
  "integrate",
  "implement",
  "improve",
  "deliver",
  "analyze",
  "support",
  "scale",
  "test",
  "debug",
  "automate",
  "monitor",
];

const ACTION_VERBS = [
  "Built",
  "Developed",
  "Designed",
  "Implemented",
  "Improved",
  "Optimized",
  "Delivered",
  "Collaborated",
  "Integrated",
  "Automated",
];

const SKILL_DISPLAY = {
  node: "Node.js",
  "node.js": "Node.js",
  javascript: "JavaScript",
  typescript: "TypeScript",
  react: "React",
  angular: "Angular",
  vue: "Vue",
  mongodb: "MongoDB",
  postgresql: "PostgreSQL",
  mysql: "MySQL",
  sql: "SQL",
  python: "Python",
  java: "Java",
  aws: "AWS",
  azure: "Azure",
  gcp: "GCP",
  docker: "Docker",
  kubernetes: "Kubernetes",
  html: "HTML",
  css: "CSS",
  git: "Git",
  rest: "REST APIs",
  "rest api": "REST APIs",
  graphql: "GraphQL",
  express: "Express",
  "next.js": "Next.js",
  tailwind: "Tailwind CSS",
  linux: "Linux",
  "ci/cd": "CI/CD",
  jenkins: "Jenkins",
  agile: "Agile",
  testing: "Testing",
  "unit testing": "Unit Testing",
  "api development": "API Development",
  microservices: "Microservices",
  "system design": "System Design",
  redis: "Redis",
  jira: "Jira",
  communication: "Communication",
  leadership: "Leadership",
  "problem solving": "Problem Solving",
  teamwork: "Teamwork",
};

function parseResume(resumeText) {
  const lines = String(resumeText || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    throw new Error("Resume text is required.");
  }

  const parsed = {
    name: lines[0] || "",
    contact: extractContact(lines.slice(0, 5)),
    summary: "",
    skills: [],
    experience: [],
    projects: [],
    education: [],
    certificates: [],
    achievements: [],
    training: [],
  };

  const sectionNames = {
    summary: ["summary", "profile", "objective", "about"],
    skills: ["skills", "technical skills", "technologies", "expertise"],
    experience: ["experience", "work experience", "employment", "professional experience"],
    projects: ["projects", "personal projects", "academic projects"],
    education: ["education", "academic background"],
    certificates: ["certificates", "certifications"],
    achievements: ["achievements", "awards"],
    training: ["training", "internships"],
  };

  let currentSection = "summary";

  for (const line of lines.slice(1)) {
    const normalized = normalizeText(line).replace(/[:\s-]+$/, "");
    const detectedSection = detectSection(normalized, sectionNames);

    if (detectedSection) {
      currentSection = detectedSection;
      continue;
    }

    if (isContactLine(line)) {
      continue;
    }

    if (currentSection === "summary") {
      parsed.summary = [parsed.summary, line].filter(Boolean).join(" ");
      continue;
    }

    if (currentSection === "skills") {
      parsed.skills.push(...splitListLine(line));
      continue;
    }

    if (currentSection === "experience") {
      parsed.experience.push(cleanBullet(line));
      continue;
    }

    if (currentSection === "projects") {
      parsed.projects.push(cleanBullet(line));
      continue;
    }

    if (currentSection === "education") {
      parsed.education.push(cleanBullet(line));
      continue;
    }

    if (currentSection === "certificates") {
      parsed.certificates.push(cleanBullet(line));
      continue;
    }

    if (currentSection === "achievements") {
      parsed.achievements.push(cleanBullet(line));
      continue;
    }

    if (currentSection === "training") {
      parsed.training.push(cleanBullet(line));
    }
  }

  parsed.skills = dedupe(parsed.skills);
  parsed.experience = dedupe(parsed.experience);
  parsed.projects = dedupe(parsed.projects);
  parsed.education = dedupe(parsed.education);
  parsed.certificates = dedupe(parsed.certificates);
  parsed.achievements = dedupe(parsed.achievements);
  parsed.training = dedupe(parsed.training);

  if (!parsed.summary) {
    parsed.summary = "Candidate with relevant technical experience.";
  }

  return parsed;
}

function analyzeATS(jdText, resumeData) {
  if (!String(jdText || "").trim()) {
    throw new Error("Job description is required.");
  }

  const jdAnalysis = extractJDData(jdText);
  const resumeSkills = new Set(resumeData.skills.map((skill) => formatSkill(skill)));
  const matchedSkills = jdAnalysis.skills.filter((skill) => resumeSkills.has(skill));
  const missingSkills = jdAnalysis.skills.filter((skill) => !resumeSkills.has(skill));
  const keywordCorpus = normalizeText([
    resumeData.summary,
    ...resumeData.skills,
    ...resumeData.experience,
    ...resumeData.projects,
  ].join(" "));

  const keywordMatches = jdAnalysis.keywords.filter((keyword) => keywordCorpus.includes(keyword)).length;
  const keywordScore = jdAnalysis.keywords.length === 0 ? 0.5 : keywordMatches / jdAnalysis.keywords.length;
  const skillsScore = jdAnalysis.skills.length === 0 ? 0.5 : matchedSkills.length / jdAnalysis.skills.length;
  const experienceScore = calculateExperienceRelevance(jdAnalysis, resumeData);
  const weakSections = identifyWeakSections(jdAnalysis, resumeData, missingSkills, experienceScore, keywordScore);
  const irrelevantContent = identifyIrrelevantContent(jdAnalysis, resumeData);
  const score = roundToOne((keywordScore * 0.3 + skillsScore * 0.25 + experienceScore * 0.45) * 10);

  return {
    score,
    jdAnalysis,
    matchedSkills,
    missingSkills,
    weakSections,
    irrelevantContent,
    explanation: buildExplanation(score, matchedSkills, missingSkills, weakSections, irrelevantContent),
  };
}

function generateSuggestions(analysis, resumeData) {
  const suggestions = [];

  if (analysis.missingSkills.length > 0) {
    suggestions.push(`Add these missing JD skills naturally where truthful: ${analysis.missingSkills.slice(0, 6).join(", ")}.`);
  }

  if (analysis.weakSections.includes("summary")) {
    suggestions.push("Rewrite the summary so the target role, domain keywords, and core technologies appear in the first 2-3 lines.");
  }

  if (analysis.weakSections.includes("skills")) {
    suggestions.push("Reorganize the skills section so JD-relevant technologies appear first and unrelated tools are removed.");
  }

  if (analysis.weakSections.includes("experience")) {
    suggestions.push("Rephrase experience bullets to mirror JD responsibilities and include measurable outcomes, ownership, and delivery impact.");
  }

  if (analysis.weakSections.includes("projects")) {
    suggestions.push("Improve project descriptions with JD keywords, stack details, and metrics such as performance, usage, or delivery gains.");
  }

  if (analysis.irrelevantContent.length > 0) {
    suggestions.push(`Reduce or remove weaker content that does not support this JD: ${analysis.irrelevantContent.slice(0, 4).join("; ")}.`);
  }

  if (resumeData.projects.length === 0) {
    suggestions.push("Add at least one existing project that strongly aligns with the target role's stack and responsibilities.");
  }

  return dedupe(suggestions);
}

function rewriteResume(resumeData, jdText, analysis) {
  const preferredSkills = selectTailoredSkills(resumeData.skills, analysis.jdAnalysis.skills);
  const tailoredSummary = buildTailoredSummary(resumeData, analysis.jdAnalysis, preferredSkills);
  const tailoredProjects = buildTailoredProjects(resumeData.projects, preferredSkills, analysis.jdAnalysis);
  const tailoredExperience = buildTailoredExperience(resumeData.experience, preferredSkills, analysis.jdAnalysis);

  return {
    name: resumeData.name,
    contact: resumeData.contact,
    skills: categorizeSkills(preferredSkills),
    projects: tailoredProjects,
    training: buildTrainingSection(resumeData.training),
    certificates: resumeData.certificates,
    achievements: resumeData.achievements,
    education: buildEducationSection(resumeData.education),
    summary: tailoredSummary,
    rawSections: {
      summary: tailoredSummary,
      experience: tailoredExperience,
      projects: tailoredProjects.map((project) => [project.title, ...project.bullets].join(" ")),
    },
  };
}

async function processResume(jdText, resumeText, templateType = "structured", options = {}) {
  const resumeData = parseResume(resumeText);
  const analysis = analyzeATS(jdText, resumeData);
  const suggestions = generateSuggestions(analysis, resumeData);
  const tailoredResume = analysis.score < 8.5
    ? rewriteResume(resumeData, jdText, analysis)
    : rewriteResume(resumeData, jdText, { ...analysis, missingSkills: [] });
  const pdfPath = await buildResumePDF(tailoredResume, templateType, options);

  return {
    score: analysis.score,
    suggestions,
    tailoredResume,
    pdfPath,
  };
}

function extractJDData(jdText) {
  const normalized = normalizeText(jdText);
  const keywords = extractKeywords(jdText, 24);
  const skills = dedupe(
    KNOWN_SKILLS
      .filter((skill) => containsSkill(normalized, skill))
      .map((skill) => formatSkill(skill))
  );
  const responsibilities = dedupe(
    splitSentences(jdText).filter((sentence) =>
      RESPONSIBILITY_HINTS.some((hint) => normalizeText(sentence).includes(hint))
    )
  );

  return {
    keywords,
    skills,
    responsibilities,
    title: extractTargetTitle(jdText),
  };
}

function calculateExperienceRelevance(jdAnalysis, resumeData) {
  const experienceText = normalizeText([...resumeData.experience, ...resumeData.projects].join(" "));
  const responsibilityHits = jdAnalysis.responsibilities.filter((sentence) =>
    extractKeywords(sentence, 6).some((keyword) => experienceText.includes(keyword))
  ).length;
  const skillHits = jdAnalysis.skills.filter((skill) => experienceText.includes(normalizeText(skill))).length;

  const responsibilityScore = jdAnalysis.responsibilities.length === 0
    ? 0.5
    : responsibilityHits / jdAnalysis.responsibilities.length;
  const skillScore = jdAnalysis.skills.length === 0
    ? 0.5
    : skillHits / jdAnalysis.skills.length;

  return clamp((responsibilityScore * 0.6) + (skillScore * 0.4));
}

function identifyWeakSections(jdAnalysis, resumeData, missingSkills, experienceScore, keywordScore) {
  const weakSections = [];

  if (resumeData.summary.length < 50 || keywordScore < 0.5) {
    weakSections.push("summary");
  }

  if (missingSkills.length > 0 || resumeData.skills.length < 5) {
    weakSections.push("skills");
  }

  if (resumeData.experience.length < 2 || experienceScore < 0.55) {
    weakSections.push("experience");
  }

  if (resumeData.projects.length === 0 || jdAnalysis.skills.some((skill) => !projectCoverage(resumeData.projects, skill))) {
    weakSections.push("projects");
  }

  return weakSections;
}

function identifyIrrelevantContent(jdAnalysis, resumeData) {
  const jdKeywords = new Set(jdAnalysis.keywords);
  const possibleIrrelevant = [
    ...resumeData.skills,
    ...resumeData.projects,
    ...resumeData.experience,
  ];

  return dedupe(
    possibleIrrelevant.filter((item) => {
      const normalized = normalizeText(item);
      return normalized && ![...jdKeywords].some((keyword) => normalized.includes(keyword));
    }).slice(0, 6)
  );
}

function buildExplanation(score, matchedSkills, missingSkills, weakSections, irrelevantContent) {
  return [
    `ATS score is ${score}/10.`,
    matchedSkills.length
      ? `Matched skills: ${matchedSkills.join(", ")}.`
      : "Very few direct JD skills were matched.",
    missingSkills.length
      ? `Missing skills: ${missingSkills.join(", ")}.`
      : "No major JD skills are missing.",
    weakSections.length
      ? `Weak sections: ${weakSections.join(", ")}.`
      : "Core sections are reasonably aligned.",
    irrelevantContent.length
      ? `Potentially irrelevant content: ${irrelevantContent.join("; ")}.`
      : "Most visible content supports the target role.",
  ].join(" ");
}

function selectTailoredSkills(existingSkills, jdSkills) {
  const normalizedExisting = dedupe(existingSkills.map(formatSkill));
  const prioritized = dedupe([...jdSkills, ...normalizedExisting]);
  const filtered = prioritized.filter((skill) =>
    normalizedExisting.includes(skill) || isRealisticAdjacentSkill(skill, normalizedExisting)
  );
  return filtered.slice(0, 18);
}

function buildTailoredSummary(resumeData, jdAnalysis, skills) {
  const role = jdAnalysis.title;
  const focusSkills = skills.slice(0, 6).join(", ");
  const responsibilityHint = jdAnalysis.responsibilities[0]
    ? cleanSentence(jdAnalysis.responsibilities[0])
    : "deliver web applications aligned with business needs";
  const existingSummary = resumeData.summary || "Software engineer with hands-on development experience.";

  return `${existingSummary} Targeted for ${role}, with emphasis on ${focusSkills}. Focused on teams that ${responsibilityHint.toLowerCase()}, using ATS-friendly keywords and clear technical alignment.`;
}

function buildTailoredExperience(experience, skills, jdAnalysis) {
  if (experience.length === 0) {
    return [
      `Delivered engineering work aligned to ${jdAnalysis.title.toLowerCase()} expectations using ${skills.slice(0, 3).join(", ")} with measurable delivery support.`,
    ];
  }

  return experience.map((item, index) => {
    const verb = ACTION_VERBS[index % ACTION_VERBS.length];
    const skill = skills[index % Math.max(skills.length, 1)] || "relevant technologies";
    const responsibility = jdAnalysis.responsibilities[index % Math.max(jdAnalysis.responsibilities.length, 1)] || "delivered scalable features";
    const metric = 12 + (index * 8);
    const cleaned = stripLeadingVerb(item);

    return `${verb} ${cleaned} using ${skill}, aligning with the JD requirement to ${cleanSentence(responsibility).toLowerCase()}, and improved delivery or efficiency by ${metric}%.`;
  });
}

function buildTailoredProjects(projects, skills, jdAnalysis) {
  const sourceProjects = projects.length ? projects : ["Relevant project work aligned to the target role."];

  return sourceProjects.map((project, index) => {
    const title = deriveProjectTitle(project, index);
    const skillA = skills[index % Math.max(skills.length, 1)] || "JavaScript";
    const skillB = skills[(index + 1) % Math.max(skills.length, 1)] || "REST APIs";
    const metric = 20 + (index * 15);

    return {
      title,
      liveLink: "",
      date: "Relevant Project",
      bullets: [
        `${cleanSentence(project)} using ${skillA} and ${skillB}, aligned to the JD's technical expectations.`,
        `Improved performance, delivery quality, or user experience by approximately ${metric}% through focused implementation and optimization.`,
      ],
    };
  });
}

function categorizeSkills(skills) {
  const formatted = dedupe(skills.map(formatSkill));

  return {
    languages: formatted.filter((skill) => ["JavaScript", "TypeScript", "Python", "Java", "SQL"].includes(skill)),
    webTechnologies: formatted.filter((skill) => ["HTML", "CSS", "REST APIs", "GraphQL"].includes(skill)),
    frameworksLibraries: formatted.filter((skill) => ["React", "Angular", "Vue", "Node.js", "Express", "Next.js", "Tailwind CSS"].includes(skill)),
    databaseMessaging: formatted.filter((skill) => ["MongoDB", "PostgreSQL", "MySQL", "Redis"].includes(skill)),
    toolsCloudDevOpsPlatforms: formatted.filter((skill) => ["Git", "Docker", "AWS", "Azure", "GCP", "CI/CD", "Jenkins", "Linux", "Jira", "Kubernetes"].includes(skill)),
    coreCSFundamentals: formatted.filter((skill) => ["System Design", "Microservices", "API Development", "Testing", "Unit Testing"].includes(skill)),
    softSkills: formatted.filter((skill) => ["Communication", "Leadership", "Problem Solving", "Teamwork", "Agile"].includes(skill)),
  };
}

function buildTrainingSection(training) {
  return training.map((item) => ({
    role: item,
    institute: "",
    date: "",
    bullets: [],
  }));
}

function buildEducationSection(education) {
  return education.map((item) => {
    const [degreePart, rest] = item.split("—").map((value) => value.trim());
    return {
      degree: degreePart || item,
      college: rest || "",
      location: "",
      dates: "",
    };
  });
}

function projectCoverage(projects, skill) {
  const normalizedSkill = normalizeText(skill);
  return projects.some((project) => normalizeText(project).includes(normalizedSkill));
}

function isRealisticAdjacentSkill(skill, existingSkills) {
  const adjacency = {
    "REST APIs": ["Node.js", "Express", "JavaScript", "React"],
    Docker: ["AWS", "Node.js", "CI/CD"],
    Git: ["JavaScript", "Node.js", "React", "Python"],
    AWS: ["Docker", "CI/CD", "Node.js"],
    SQL: ["PostgreSQL", "MySQL"],
    "TypeScript": ["JavaScript", "React", "Node.js"],
  };

  return existingSkills.some((existing) => (adjacency[skill] || []).includes(existing));
}

function extractTargetTitle(jdText) {
  const match = String(jdText || "").match(/(?:hiring|seeking|looking for)\s+(?:a|an)?\s*([A-Za-z /-]{4,50})/i);
  return match ? cleanSentence(match[1]) : "the target role";
}

function extractContact(lines) {
  const joined = lines.join(" | ");
  const email = joined.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "";
  const phone = joined.match(/(\+?\d[\d\s-]{7,}\d)/)?.[0] || "";
  const linkedin = joined.match(/linkedin\.com\/[^\s|]+/i)?.[0] || "";
  const github = joined.match(/github\.com\/[^\s|]+/i)?.[0] || "";

  return {
    email,
    phone,
    linkedin,
    github,
  };
}

function isContactLine(line) {
  const text = String(line || "");
  return /@|linkedin\.com|github\.com|\+?\d[\d\s-]{7,}\d/i.test(text);
}

function detectSection(normalizedLine, sectionNames) {
  for (const [section, names] of Object.entries(sectionNames)) {
    if (names.includes(normalizedLine)) {
      return section;
    }
  }

  return null;
}

function splitListLine(line) {
  return line
    .split(/[|,]/)
    .map((item) => cleanBullet(item))
    .filter(Boolean);
}

function stripLeadingVerb(text) {
  return cleanBullet(String(text || "").trim()).replace(/^(built|developed|designed|implemented|improved|optimized|delivered|collaborated|integrated|automated)\s+/i, "");
}

function deriveProjectTitle(project, index) {
  const cleaned = cleanSentence(project);
  if (cleaned.length <= 40) {
    return cleaned;
  }

  return `Project ${index + 1}`;
}

function cleanSentence(text) {
  return String(text || "").replace(/\.$/, "").trim();
}

function extractKeywords(text, limit = 20) {
  return dedupe(
    normalizeText(text)
      .split(/[^a-z0-9+#./-]+/)
      .filter((word) => word.length >= 4)
      .slice(0, limit)
  );
}

function splitSentences(text) {
  return String(text || "")
    .split(/\r?\n|(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function formatSkill(skill) {
  const normalized = normalizeText(skill);
  return SKILL_DISPLAY[normalized] || skill;
}

function containsSkill(text, skill) {
  const pattern = new RegExp(`(^|[^a-z0-9+#./-])${escapeRegExp(skill)}([^a-z0-9+#./-]|$)`, "i");
  return pattern.test(text);
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanBullet(text) {
  return String(text || "").replace(/^[-*•]\s*/, "").trim();
}

function dedupe(items) {
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

function clamp(value) {
  return Math.max(0, Math.min(1, value));
}

function roundToOne(value) {
  return Math.round(clamp(value / 10) * 100) / 10;
}

module.exports = {
  analyzeATS,
  generateSuggestions,
  parseResume,
  processResume,
  rewriteResume,
};
