const fs = require("fs");
const path = require("path");
const {
  formatResume,
  generateHTMLResume,
  generateModernHTMLResume,
  generatePDF,
  deleteResumeFile,
} = require("./formatResume");

const SAMPLE_RESUME_TEXT = `John Doe
Software Engineer with 2 years experience in web development.

Skills:
JavaScript, Node.js, React, MongoDB

Experience:
Worked at ABC Company as a frontend developer.
Built responsive web applications.

Projects:
E-commerce website using React and Node.js.`;

const OUTPUT_DIR = path.join(process.cwd(), "temp");
const SIMPLE_FILE_NAME = "test_simple.pdf";
const MODERN_FILE_NAME = "test_modern.pdf";

async function runTest() {
  let attempt = 1;
  const maxAttempts = 2;

  while (attempt <= maxAttempts) {
    try {
      console.log(`Starting resume PDF test. Attempt ${attempt} of ${maxAttempts}.`);

      const structuredData = formatResume(SAMPLE_RESUME_TEXT);
      validateStructuredData(structuredData);
      console.log("Structured JSON output:");
      console.log(JSON.stringify(structuredData, null, 2));

      const simpleHtml = generateHTMLResume(structuredData);
      const modernHtml = generateModernHTMLResume(structuredData);
      validateHtml(simpleHtml, "simple");
      validateHtml(modernHtml, "modern");

      console.log("\nSimple HTML preview:");
      console.log(getHtmlPreview(simpleHtml));

      console.log("\nModern HTML preview:");
      console.log(getHtmlPreview(modernHtml));

      await cleanupGeneratedFiles();

      const simplePdfPath = await generatePDF(simpleHtml, { fileName: SIMPLE_FILE_NAME });
      const modernPdfPath = await generatePDF(modernHtml, { fileName: MODERN_FILE_NAME });

      validatePdf(simplePdfPath);
      validatePdf(modernPdfPath);

      console.log("\nGenerated PDF file paths:");
      console.log(simplePdfPath);
      console.log(modernPdfPath);
      console.log("\nResume PDF test completed successfully.");

      return {
        structuredData,
        simpleHtml,
        modernHtml,
        simplePdfPath,
        modernPdfPath,
      };
    } catch (error) {
      console.error(`\nAttempt ${attempt} failed.`);
      console.error(error && error.stack ? error.stack : error);

      if (attempt >= maxAttempts) {
        process.exitCode = 1;
        throw error;
      }

      console.log("Applying automatic recovery: cleaning generated files and retrying.");
      await cleanupGeneratedFiles();
      attempt += 1;
    }
  }
}

function validateStructuredData(data) {
  if (!data || typeof data !== "object") {
    throw new Error("formatResume() did not return an object.");
  }

  if (data.name !== "John Doe") {
    throw new Error(`Unexpected resume name: ${data.name}`);
  }

  if (!Array.isArray(data.skills) || data.skills.length === 0) {
    throw new Error("Structured skills are missing.");
  }

  if (!Array.isArray(data.experience) || data.experience.length === 0) {
    throw new Error("Structured experience is missing.");
  }

  if (!Array.isArray(data.projects) || data.projects.length === 0) {
    throw new Error("Structured projects are missing.");
  }
}

function validateHtml(html, templateType) {
  if (!html || typeof html !== "string") {
    throw new Error(`generate${templateType}HTML did not return HTML.`);
  }

  const requiredTokens = ["<!DOCTYPE html>", "<html", "<body", "John Doe"];

  for (const token of requiredTokens) {
    if (!html.includes(token)) {
      throw new Error(`${templateType} HTML is missing token: ${token}`);
    }
  }
}

function validatePdf(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`PDF file was not generated: ${filePath}`);
  }

  const stats = fs.statSync(filePath);

  if (!stats.isFile()) {
    throw new Error(`Generated path is not a file: ${filePath}`);
  }

  if (stats.size <= 0) {
    throw new Error(`Generated PDF is empty: ${filePath}`);
  }
}

function getHtmlPreview(html) {
  const previewLength = 800;
  return html.length <= previewLength
    ? html
    : `${html.slice(0, previewLength)}\n... [truncated preview]`;
}

async function cleanupGeneratedFiles() {
  await deleteResumeFile(path.join(OUTPUT_DIR, SIMPLE_FILE_NAME));
  await deleteResumeFile(path.join(OUTPUT_DIR, MODERN_FILE_NAME));
}

if (require.main === module) {
  runTest().catch(() => {
    process.exitCode = 1;
  });
}

module.exports = {
  SAMPLE_RESUME_TEXT,
  runTest,
};
