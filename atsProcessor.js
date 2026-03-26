const {
  buildResumePDF,
  formatResume,
  preprocessResumeText,
  sanitizeStructuredResume,
} = require("./formatResume");

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
  "c++",
  "c#",
  "aws",
  "azure",
  "gcp",
  "docker",
  "kubernetes",
  "html",
  "css",
  "rest api",
  "rest",
  "graphql",
  "git",
  "jira",
  "redis",
  "microservices",
  "system design",
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
];

const SKILL_ALIASES = {
  node: "Node.js",
  "node.js": "Node.js",
  javascript: "JavaScript",
  typescript: "TypeScript",
  react: "React",
  mongodb: "MongoDB",
  postgresql: "PostgreSQL",
  mysql: "MySQL",
  sql: "SQL",
  aws: "AWS",
  azure: "Azure",
  gcp: "GCP",
  docker: "Docker",
  kubernetes: "Kubernetes",
  html: "HTML",
  css: "CSS",
  rest: "REST APIs",
  "rest api": "REST APIs",
  graphql: "GraphQL",
  git: "Git",
  jira: "Jira",
  redis: "Redis",
  microservices: "Microservices",
  "system design": "System Design",
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
  python: "Python",
  java: "Java",
  "c++": "C++",
  "c#": "C#",
  angular: "Angular",
  vue: "Vue",
};

const ADJACENT_SKILLS = {
  "Node.js": ["Express", "REST APIs", "API Development"],
  JavaScript: ["TypeScript", "React", "Node.js"],
  React: ["JavaScript", "TypeScript", "HTML", "CSS"],
  MongoDB: ["Node.js", "REST APIs"],
  SQL: ["PostgreSQL", "MySQL"],
  AWS: ["Docker", "CI/CD"],
  Docker: ["Kubernetes", "CI/CD"],
};

const CANONICAL_SKILL_MAP = {
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
  "c++": "C++",
  "c#": "C#",
  aws: "AWS",
  azure: "Azure",
  gcp: "GCP",
  docker: "Docker",
  kubernetes: "Kubernetes",
  html: "HTML",
  css: "CSS",
  "rest api": "REST APIs",
  rest: "REST APIs",
  graphql: "GraphQL",
  git: "Git",
  jira: "Jira",
  redis: "Redis",
  microservices: "Microservices",
  "system design": "System Design",
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
};

function parseResume(resumeText) {
  const cleanedResumeText = preprocessResumeText(resumeText || "");
  return sanitizeStructuredResume(formatResume(cleanedResumeText));
}

function analyzeATS(jdText, resumeData) {
  validateInputs(jdText, resumeData);

  const normalizedJd = normalizeText(jdText);
  const requiredSkills = extractRequiredSkills(jdText);
  const resumeSkills = normalizeSkillList(resumeData.skills);
  const matchedSkills = requiredSkills.filter((skill) => resumeSkills.includes(skill));
  const missingSkills = requiredSkills.filter((skill) => !resumeSkills.includes(skill));

  const skillMatchRatio = requiredSkills.length === 0 ? 0.5 : matchedSkills.length / requiredSkills.length;
  const experienceRelevance = calculateExperienceRelevance(normalizedJd, resumeData);
  const keywordPresence = calculateKeywordPresence(normalizedJd, resumeData);
  const score = roundScore((skillMatchRatio * 0.5 + experienceRelevance * 0.3 + keywordPresence * 0.2) * 10);

  return {
    score,
    explanation: buildExplanation(score, matchedSkills, missingSkills, experienceRelevance, keywordPresence),
    requiredSkills: requiredSkills.map(formatSkillName),
    matchedSkills: matchedSkills.map(formatSkillName),
    missingSkills: missingSkills.map(formatSkillName),
    skillMatchRatio,
    experienceRelevance,
    keywordPresence,
    weakSections: identifyWeakSections(resumeData, missingSkills, experienceRelevance, keywordPresence),
  };
}

function generateSuggestions(analysis, resumeData) {
  const suggestions = [];

  if (analysis.missingSkills.length > 0) {
    suggestions.push(`Add job-relevant skills where truthful: ${analysis.missingSkills.slice(0, 5).join(", ")}.`);
  }

  if (resumeData.summary.length < 40) {
    suggestions.push("Strengthen the summary with role alignment, core technologies, and business impact.");
  }

  if (resumeData.experience.length < 2) {
    suggestions.push("Expand experience with clearer action-result bullet points and measurable outcomes.");
  } else {
    suggestions.push("Rewrite experience bullets to emphasize ownership, stack, and measurable outcomes.");
  }

  if (resumeData.projects.length === 0) {
    suggestions.push("Add at least one relevant project that mirrors the target role's technical stack.");
  } else {
    suggestions.push("Highlight projects using JD keywords and concrete implementation details.");
  }

  analysis.weakSections.forEach((section) => {
    if (section === "skills") {
      suggestions.push("Make the skills section more targeted by prioritizing the technologies named in the JD.");
    }

    if (section === "experience") {
      suggestions.push("Align experience bullets with the JD's required responsibilities and technologies.");
    }

    if (section === "summary") {
      suggestions.push("Update the summary to clearly reflect target-role fit and ATS keywords.");
    }
  });

  return dedupeStrings(suggestions);
}

function rewriteResume(resumeData, jdText, analysis) {
  const targetTitle = extractTargetTitle(jdText);
  const addedSkills = selectRealisticMissingSkills(analysis.missingSkills, resumeData.skills);
  const finalSkills = dedupeStrings([...resumeData.skills, ...addedSkills]);
  const finalSummary = buildTailoredSummary(resumeData, targetTitle, finalSkills);
  const finalExperience = enhanceExperience(resumeData.experience, finalSkills, targetTitle);
  const finalProjects = enhanceProjects(resumeData.projects, finalSkills, targetTitle);

  return [
    resumeData.name || "Candidate",
    "Summary",
    finalSummary,
    "",
    "Skills",
    finalSkills.join(", "),
    "",
    "Experience",
    ...finalExperience.map((item) => `- ${item}`),
    "",
    "Projects",
    ...finalProjects.map((item) => `- ${item}`),
  ]
    .filter(Boolean)
    .join("\n");
}

async function processResume(jdText, resumeText, templateType = "simple") {
  if (!String(jdText || "").trim()) {
    throw new Error("Job description is required.");
  }

  if (!String(resumeText || "").trim()) {
    throw new Error("Resume text is required.");
  }

  const parsedResume = parseResume(resumeText);
  const analysis = analyzeATS(jdText, parsedResume);
  const suggestions = generateSuggestions(analysis, parsedResume);
  const strongResume = analysis.score >= 8.5;
  const finalResumeText = strongResume
    ? stringifyResume(parsedResume)
    : rewriteResume(parsedResume, jdText, analysis);
  const pdfPath = await buildResumePDF(finalResumeText, templateType);

  return {
    score: analysis.score,
    explanation: strongResume ? "Your resume is strong" : analysis.explanation,
    missingSkills: analysis.missingSkills,
    suggestions,
    finalResumeText,
    pdfPath,
  };
}

function validateInputs(jdText, resumeData) {
  if (!String(jdText || "").trim()) {
    throw new Error("Job description is required.");
  }

  if (
    !resumeData ||
    (!resumeData.name && !resumeData.summary && resumeData.skills.length === 0)
  ) {
    throw new Error("Resume content is empty or poorly formatted.");
  }
}

function extractRequiredSkills(jdText) {
  const normalizedJd = normalizeText(jdText);
  const matches = KNOWN_SKILLS
    .filter((skill) => containsSkill(normalizedJd, skill))
    .map(toCanonicalSkill);

  if (matches.length > 0) {
    return dedupeStrings(matches);
  }

  const keywords = normalizedJd
    .split(/[^a-z0-9+#./-]+/)
    .filter((word) => word.length >= 4)
    .slice(0, 8);

  return dedupeStrings(keywords);
}

function calculateExperienceRelevance(normalizedJd, resumeData) {
  const corpus = normalizeText([
    resumeData.summary,
    ...resumeData.experience,
    ...resumeData.projects,
  ].join(" "));
  const jdKeywords = extractKeywordTokens(normalizedJd);

  if (jdKeywords.length === 0) {
    return 0.5;
  }

  const matches = jdKeywords.filter((keyword) => corpus.includes(keyword)).length;
  return clamp(matches / jdKeywords.length);
}

function calculateKeywordPresence(normalizedJd, resumeData) {
  const corpus = normalizeText([
    resumeData.summary,
    ...resumeData.skills,
    ...resumeData.experience,
    ...resumeData.projects,
  ].join(" "));
  const jdKeywords = extractKeywordTokens(normalizedJd);

  if (jdKeywords.length === 0) {
    return 0.5;
  }

  const matches = jdKeywords.filter((keyword) => corpus.includes(keyword)).length;
  return clamp(matches / jdKeywords.length);
}

function identifyWeakSections(resumeData, missingSkills, experienceRelevance, keywordPresence) {
  const weakSections = [];

  if (resumeData.summary.length < 40 || keywordPresence < 0.45) {
    weakSections.push("summary");
  }

  if (missingSkills.length > 0 || resumeData.skills.length < 4) {
    weakSections.push("skills");
  }

  if (resumeData.experience.length < 2 || experienceRelevance < 0.5) {
    weakSections.push("experience");
  }

  if (resumeData.projects.length === 0) {
    weakSections.push("projects");
  }

  return weakSections;
}

function buildExplanation(score, matchedSkills, missingSkills, experienceRelevance, keywordPresence) {
  const parts = [
    `ATS score is ${score}/10.`,
    matchedSkills.length > 0
      ? `Matched skills: ${matchedSkills.map(formatSkillName).join(", ")}.`
      : "Very few direct skill matches were found.",
    missingSkills.length > 0
      ? `Missing or weak skills: ${missingSkills.map(formatSkillName).join(", ")}.`
      : "Most core JD skills are represented in the resume.",
    `Experience relevance is ${Math.round(experienceRelevance * 100)}%.`,
    `Keyword coverage is ${Math.round(keywordPresence * 100)}%.`,
  ];

  return parts.join(" ");
}

function buildTailoredSummary(resumeData, targetTitle, skills) {
  const strongestSkills = skills.slice(0, 6).join(", ");
  const existingSummary = resumeData.summary || "Software engineer with hands-on web development experience.";
  return `${existingSummary} Tailored for ${targetTitle}, with emphasis on ${strongestSkills} and ATS-friendly delivery focused on implementation impact.`;
}

function enhanceExperience(experience, skills, targetTitle) {
  if (experience.length === 0) {
    return [
      `Collaborated on ${targetTitle.toLowerCase()} work aligned to ${skills.slice(0, 3).join(", ")} requirements.`,
      "Delivered features with focus on usability, maintainability, and clear business impact.",
    ];
  }

  return experience.map((item, index) => {
    const emphasis = skills[index % Math.max(skills.length, 1)] || "relevant technologies";
    const cleanItem = item.replace(/\.$/, "");
    return `${cleanItem}, using ${emphasis} with clear ownership and outcome-focused delivery.`;
  });
}

function enhanceProjects(projects, skills, targetTitle) {
  if (projects.length === 0) {
    return [
      `Targeted project aligned to ${targetTitle.toLowerCase()} expectations using ${skills.slice(0, 3).join(", ")}.`,
    ];
  }

  return projects.map((item, index) => {
    const emphasis = skills[(index + 1) % Math.max(skills.length, 1)] || "relevant technologies";
    const cleanItem = item.replace(/\.$/, "");
    return `${cleanItem}, highlighting ${emphasis} and production-oriented problem solving.`;
  });
}

function stringifyResume(resumeData) {
  const lines = [
    resumeData.name || "Candidate",
    "Summary",
    resumeData.summary,
    "",
    "Skills",
    resumeData.skills.join(", "),
    "",
    "Experience",
    ...resumeData.experience.map((item) => `- ${item}`),
    "",
    "Projects",
    ...resumeData.projects.map((item) => `- ${item}`),
  ];

  return lines.filter(Boolean).join("\n");
}

function extractTargetTitle(jdText) {
  const normalized = String(jdText || "").match(/(?:for|seeking|hiring)\s+(?:a|an)?\s*([A-Za-z ]{4,40})/i);
  return normalized ? normalized[1].trim() : "the target role";
}

function selectRealisticMissingSkills(missingSkills, existingSkills) {
  const existing = dedupeStrings(existingSkills);
  const additions = [];

  missingSkills.forEach((skill) => {
    const formatted = formatSkillName(skill);
    const isAdjacent = existing.some((current) => {
      const adjacent = ADJACENT_SKILLS[current] || [];
      return adjacent.includes(formatted);
    });

    if (isAdjacent && additions.length < 3) {
      additions.push(formatted);
    }
  });

  return dedupeStrings(additions);
}

function normalizeSkillList(skills) {
  return dedupeStrings(
    skills.map((skill) => toCanonicalSkill(normalizeText(skill)))
  );
}

function extractKeywordTokens(text) {
  return dedupeStrings(
    String(text || "")
      .split(/[^a-z0-9+#./-]+/)
      .filter((word) => word.length >= 4)
      .slice(0, 20)
  );
}

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function formatSkillName(skill) {
  if (Object.values(SKILL_ALIASES).includes(skill)) {
    return skill;
  }

  return SKILL_ALIASES[skill] || skill.replace(/\b\w/g, (char) => char.toUpperCase());
}

function toCanonicalSkill(skill) {
  return CANONICAL_SKILL_MAP[skill] || formatSkillName(skill);
}

function containsSkill(text, skill) {
  const escaped = escapeRegExp(skill);
  const pattern = new RegExp(`(^|[^a-z0-9+#./-])${escaped}([^a-z0-9+#./-]|$)`, "i");
  return pattern.test(text);
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function dedupeStrings(items) {
  const seen = new Set();
  const output = [];

  items.forEach((item) => {
    const value = String(item || "").trim();

    if (!value) {
      return;
    }

    const key = value.toLowerCase();

    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    output.push(value);
  });

  return output;
}

function clamp(value) {
  return Math.max(0, Math.min(1, value));
}

function roundScore(value) {
  return Math.round(clamp(value / 10) * 100) / 10;
}

module.exports = {
  analyzeATS,
  generateSuggestions,
  parseResume,
  processResume,
  rewriteResume,
};
