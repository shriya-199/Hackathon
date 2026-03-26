const { processResume, parseResume, analyzeATS, generateSuggestions, rewriteResume } = require("./atsProcessor");

const jdText = `We are hiring a Software Engineer to build and maintain web applications.
Required skills include JavaScript, Node.js, React, MongoDB, REST APIs, Git, Docker, and AWS.
The ideal candidate can deliver scalable features, collaborate across teams, improve performance, and support production systems.`;

const resumeText = `John Doe
john.doe@example.com | +91 9876543210 | linkedin.com/in/johndoe | github.com/johndoe

Summary
Software Engineer with 2 years experience in web development.

Skills
JavaScript, Node.js, React, MongoDB

Experience
- Worked at ABC Company as a frontend developer.
- Built responsive web applications.

Projects
- E-commerce website using React and Node.js.

Education
- B.Tech in Computer Science - XYZ College
`;

async function run() {
  const parsedResume = parseResume(resumeText);
  const analysis = analyzeATS(jdText, parsedResume);
  const suggestions = generateSuggestions(analysis, parsedResume);
  const tailoredResume = rewriteResume(parsedResume, jdText, analysis);
  const result = await processResume(jdText, resumeText, "structured", {
    fileName: "tailored_resume_test.pdf",
  });

  console.log("Parsed Resume:");
  console.log(JSON.stringify(parsedResume, null, 2));
  console.log("\nATS Analysis:");
  console.log(JSON.stringify(analysis, null, 2));
  console.log("\nSuggestions:");
  console.log(JSON.stringify(suggestions, null, 2));
  console.log("\nTailored Resume:");
  console.log(JSON.stringify(tailoredResume, null, 2));
  console.log("\nFinal Result:");
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
