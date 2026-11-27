import { compileFlight } from "./compile-flight.js";
import { read } from "../src/media.js";
compileFlight(
  "examples/reference.mp4",
  read("examples/flight-analysis.json"),
  read("examples/flight-design.json"),
  process.argv[2] || ".v2w/replayed.json",
);
