import { readFileSync } from "node:fs";
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
for (const [name, p] of Object.entries(lock.packages)) {
  if (
    ![
      "MIT",
      "Apache-2.0",
      "BSD-3-Clause",
      "BSD-2-Clause",
      "(MIT OR GPL-3.0-or-later)",
    ].includes(p.license)
  )
    throw Error("Review license for " + name + ": " + p.license);
  console.log(name || "V2Wpro", p.license);
}
