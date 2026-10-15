require("dotenv").config();
const { generateChatResponse } = require("./services/longcat");

async function main() {
  const response = await generateChatResponse([
    {
      role: "user",
      content: "Reply with: LongCat is working.",
    },
  ]);

  console.log("LongCat response:", response);
}

main().catch((error) => {
  console.error("LongCat test failed:", {
    status: error.status,
    message: error.message,
    code: error.code,
  });
  process.exitCode = 1;
});
