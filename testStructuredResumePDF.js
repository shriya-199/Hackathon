const { buildResumePDF, generateStructuredResumeHTML } = require("./formatResume");

const sampleResume = {
  name: "John Doe",
  contact: {
    linkedin: "linkedin.com/in/johndoe",
    github: "github.com/johndoe",
    email: "john.doe@example.com",
    phone: "+91 98765 43210",
  },
  skills: {
    languages: ["JavaScript", "TypeScript", "Python"],
    webTechnologies: ["HTML", "CSS", "REST APIs"],
    frameworksLibraries: ["React", "Node.js", "Express"],
    databaseMessaging: ["MongoDB", "PostgreSQL", "Redis"],
    toolsCloudDevOpsPlatforms: ["Git", "Docker", "AWS", "GitHub Actions"],
    coreCSFundamentals: ["Data Structures", "Algorithms", "OOP", "DBMS"],
    softSkills: ["Communication", "Problem Solving", "Team Collaboration"],
  },
  projects: [
    {
      title: "High Traffic Commerce Platform",
      liveLink: "https://example.com",
      date: "Jan 2025 - Mar 2025",
      bullets: [
        "Built a React and Node.js commerce workflow that improved checkout completion by 22%.",
        "Optimized API performance to sustain 1200+ requests/sec during peak load testing.",
      ],
    },
  ],
  training: [
    {
      role: "Full Stack Development Training",
      institute: "ABC Institute",
      date: "2024",
      bullets: [
        "Completed hands-on training in MERN stack application development.",
        "Delivered production-style projects with code reviews and deployment workflows.",
      ],
    },
  ],
  certificates: [
    "AWS Cloud Practitioner",
    "JavaScript Algorithms and Data Structures",
  ],
  achievements: [
    "Reached top 5% in coding assessments across internal training cohorts.",
    "Built and shipped multiple full-stack academic and personal projects.",
  ],
  education: [
    {
      degree: "B.Tech in Computer Science",
      college: "XYZ College of Engineering",
      location: "Bengaluru, India",
      dates: "2021 - 2025",
    },
  ],
};

async function run() {
  const html = generateStructuredResumeHTML(sampleResume);
  console.log(html.slice(0, 1200));
  const filePath = await buildResumePDF(sampleResume, "structured", { fileName: "structured_resume_test.pdf" });
  console.log(filePath);
}

if (require.main === module) {
  run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
