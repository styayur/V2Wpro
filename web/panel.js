const el = (id) => document.getElementById(id);
export function setupPanel(w, id, url) {
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
  if (film) {
    el("reference").hidden = false;
    el("reference").querySelector("video").src = "./" + film.source;
    el("filmTitle").textContent = "Reference film";
    el("filmNotes").textContent = film.claim;
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
