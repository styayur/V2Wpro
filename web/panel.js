import { inspectRoutes, realize } from "../src/morph.js";
import { exportExchange } from "../src/exchange.js";
import { inspectMovement } from "../src/movement.js";
import profile from "../examples/profiles/skimmer-cruise.json" with { type: "json" };

const el = (id) => document.getElementById(id);
export function setupPanel(w, id, url, scene) {
  el("version").textContent = "WORLDIR " + w.version;
  el("title").textContent = w.name;
  el("document").href = url;
  if (id === "custom") el("world").add(new Option(w.name, id));
  el("world").value = id;
  el("seed").value = w.seed;
  el("world").onchange = () =>
    (location.search = new URLSearchParams({ world: el("world").value }));
  el("selection").onsubmit = (event) => {
    event.preventDefault();
    location.search = new URLSearchParams({
      world: id,
      seed: el("seed").value,
    });
  };
  const spatial = w.version === "2.0";
  if (spatial) {
    el("exchange-panel").hidden = false;
    const editor = el("edit-prototypes");
    editor.value = JSON.stringify(w.prototypes,null,2);
    const selected = w.extensions.movementProfile ?? profile;
    const report = inspectMovement(w,scene,selected);
    const blocked = report.edges.filter(edge => !edge.clear);
    el("movement-envelope").textContent = selected.id + " at " + selected.speed + " m/s · turn radius " +
      report.turnRadius.toFixed(1) + " m · braking " + report.brakingDistance.toFixed(1) +
      " m · clearance conflicts: " + (blocked.map(edge => edge.from + " → " + edge.to).join(", ") || "none");
    const key = "rules:" + url.href;
    el("apply-rules").onclick = () => {
      try {
        const candidate = {...w,prototypes:JSON.parse(editor.value)};
        const routes = inspectRoutes(candidate,realize(candidate));
        if (!routes.connected || routes.blockedEdges.length) throw Error("Rules obstruct the WorldIR route");
        exportExchange(candidate);
        sessionStorage.setItem(key,JSON.stringify(candidate.prototypes));
        location.reload();
      } catch (err) { el("exchange-status").textContent = err.message; }
    };
    el("reset-rules").onclick = () => { sessionStorage.removeItem(key); location.reload(); };
    function download(extension, encode) {
      try {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(new Blob([encode()]));
        link.download = id + "-" + w.seed + "." + extension;
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href),1000);
      } catch (err) { el("exchange-status").textContent = err.message; }
    }
    el("save-glb").onclick = () => download("glb",() => exportExchange(w));
    el("save-ir").onclick = () => download("json",() => JSON.stringify(w,null,2));
  }
  el("rules").textContent = JSON.stringify(
    spatial ? w.prototypes : w.rules,
    null,
    2,
  );
  el("summary").textContent = spatial
    ? w.topology.nodes.length +
      " nodes · " +
      w.topology.edges.length +
      " edges · " +
      Object.keys(w.prototypes).length +
      " prototypes"
    : w.prototype + " · " + w.streaming.count + " chunks";
  for (const record of w.evidence) {
    const details = document.createElement("details"),
      title = document.createElement("summary"),
      source = document.createElement("p");
    title.textContent = (record.id || record.kind) + " · " + record.claim;
    source.textContent = [
      record.kind,
      record.source,
      "confidence " + record.confidence,
    ].join(" · ");
    if (
      /^examples\/[a-zA-Z0-9_/-]+\.(mp4|md|png|json)(#t=[\d.,]+)?$/.test(
        record.source,
      )
    ) {
      const link = document.createElement("a");
      link.href = "./" + record.source;
      link.textContent = record.source;
      source.replaceChildren(
        record.kind + " · ",
        link,
        " · confidence " + record.confidence,
      );
    }
    details.append(title, source);
    el("sources").append(details);
  }
  const film = w.evidence.find((record) =>
    /^examples\/[a-zA-Z0-9_-]+\.mp4(?:#t=[0-9]+(?:\.[0-9]+)?(?:,[0-9]+(?:\.[0-9]+)?)?)?$/.test(
      record.source,
    ),
  );
  const reference = w.extensions?.reference;
  const localFilm =
    typeof reference === "string" && /^[A-Za-z0-9_-]+\.mp4$/.test(reference)
      ? "./examples/" + reference
      : film && "./" + film.source;
  if (localFilm) {
    el("reference").hidden = false;
    el("reference").querySelector("video").src = localFilm;
    el("filmTitle").textContent = "Reference film";
    el("filmNotes").textContent = film?.claim ?? "";
  } else if (id === "arcade" || id === "gate") {
    el("reference").hidden = false;
    el("reference").querySelector("video").src =
      "./examples/" + (id === "arcade" ? "reference.mp4" : "dash.mp4");
    el("filmTitle").textContent =
      id === "arcade" ? "Arcade motion study" : "Ring acceleration study";
    el("filmNotes").textContent =
      id === "arcade"
        ? "The reference animation informed the arches, palette and forward flight."
        : "The reference animation informed the dash through repeated rings.";
  }
  el("instructions").textContent =
    "W/S travel · A/D strafe · ↑/↓ altitude · Space " +
    w.motion.action +
    (spatial ? " · Drag to look or use ←/→ to turn and I/K to pitch" : "");
  const buttons = [
    ["KeyW", "Forward"],
    ["KeyS", "Back"],
    ["KeyA", "Left"],
    ["KeyD", "Right"],
    ["ArrowUp", "Rise"],
    ["ArrowDown", "Lower"],
    ["Space", w.motion.action],
  ];
  for (const [key, label] of buttons) {
    const button = document.createElement("button");
    button.dataset.key = key;
    button.textContent = label;
    el("buttons").append(button);
  }
  const reset = document.createElement("button");
  reset.id = "reset";
  reset.textContent = "Restart";
  el("buttons").append(reset);
}
