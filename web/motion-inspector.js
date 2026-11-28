import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createKineticIndex, inspectKineticWorld } from "../src/motion-analysis.js";

const el=id=>document.getElementById(id);
const point=p=>new T.Vector3(...p);
const reasonLabels={
  "hull-clearance":"The swept hull reaches a collider.",
  "curvature-below-minimum-speed":"This bend requires a speed below the profile minimum.",
  "entry-needs-prior-braking":"Brake before entering this edge.",
  "no-clear-sampled-departure":"All three sampled departures intersect geometry or end too close to a surface.",
};

export function setupMotionInspector(compiled,scene,canvas,materials,flightCamera) {
  const index=createKineticIndex(compiled);
  const report=inspectKineticWorld(compiled,index);
  const layers=Object.fromEntries(["skin","proxy","route","zone"].map(name=>[name,new T.Group()]));
  scene.add(...Object.values(layers));
  const bounds=new T.Box3();
  const proxyMaterial=new T.LineBasicMaterial({color:0xb74426});
  for (const surface of compiled.surfaces) {
    layers.skin.add(new T.Mesh(surface.render,materials[surface.material]));
    layers.proxy.add(new T.LineSegments(new T.WireframeGeometry(surface.collision),proxyMaterial));
    bounds.union(surface.render.boundingBox);
  }
  const dotGeometry=new T.SphereGeometry(1.8,8,6);
  const zones={capture:0x457e71,glide:0x376498,release:0xb96a28,escape:0x794a91};
  const routes=[];
  for (const edge of report.edges) {
    const line=new T.Line(new T.BufferGeometry().setFromPoints(edge.samples.map(s=>point(s.position))),
      new T.LineBasicMaterial({color:edge.reasons.length ? 0x9d462f:0x296854}));
    layers.route.add(line);routes.push(line);
    for (const zone of edge.zones) {
      const material=new T.MeshBasicMaterial({color:zones[zone.kind]});
      for (const f of [zone.from,zone.to]) {
        const marker=new T.Mesh(dotGeometry,material);
        marker.position.copy(sampleAt(edge,f).position);
        layers.zone.add(marker);
      }
    }
  }
  const cursor=new T.Mesh(new T.SphereGeometry(2.35,12,8),new T.MeshBasicMaterial({color:0xe99a28}));
  layers.route.add(cursor);
  for (const [name,layer] of Object.entries(layers)) {
    const control=el("layer-"+name);
    const update=()=>{layer.visible=control.checked;};
    update();control.addEventListener("change",update);
  }
  const overviewCamera=new T.PerspectiveCamera(45,1,0.1,6000);
  const center=bounds.getCenter(new T.Vector3()), span=bounds.getSize(new T.Vector3()).length();
  const back=new T.Vector3(0.55,0.69,-0.76).normalize();
  const right=new T.Vector3().crossVectors(overviewCamera.up,back).normalize(), up=back.clone().cross(right);
  const vertices=[];
  for (const s of compiled.surfaces) {
    const positions=s.render.getAttribute("position");
    for (let i=0;i<positions.count;i++) vertices.push(new T.Vector3().fromBufferAttribute(positions,i).sub(center));
  }
  function fitOverview() {
    const aspect=canvas.clientWidth/Math.max(1,canvas.clientHeight);
    const tan=Math.tan(overviewCamera.fov*Math.PI/360);
    let distance=0;
    for (const v of vertices) distance=Math.max(distance,v.dot(back)+
      1.14*Math.max(Math.abs(v.dot(right))/(tan*aspect),Math.abs(v.dot(up))/tan));
    overviewCamera.position.copy(center).addScaledVector(back,distance);
    overviewCamera.lookAt(center);
  }
  fitOverview();
  const orbit=new OrbitControls(overviewCamera,canvas);
  orbit.target.copy(center);orbit.maxDistance=span*5;orbit.minDistance=10;orbit.update();
  window.addEventListener("resize",()=>{if (overview) {fitOverview();orbit.target.copy(center);orbit.update();}});
  let overview=true;
  const originalInstructions=el("instructions").textContent;
  const flightFog=scene.fog;
  function setOverview(value) {
    overview=value;orbit.enabled=value;
    scene.fog=value ? null : flightFog;
    el("overview").textContent=value ? "Fly from entry":"Overview";
    el("instructions").textContent=value ? "Drag to orbit · Scroll to zoom" : originalInstructions;
  }
  el("overview").onclick=()=>{setOverview(!overview);if (!overview) el("reset").click();};
  setOverview(true);
  const selector=el("motion-edge");
  for (const [i,e] of report.edges.entries()) selector.add(new Option(e.module+" · "+e.from+" → "+e.to,String(i)));
  const plot=document.createElement("canvas");
  plot.id="speed-plot";plot.width=680;plot.height=106;plot.setAttribute("role","img");
  plot.setAttribute("aria-label","Speed envelope by route distance");
  el("plot-host").append(plot);
  function sampleAt(edge,f) {
    const distance=f*edge.length, s=edge.samples;
    let i=s.findIndex(row=>row.s>=distance);if(i===-1)i=s.length-1;
    const row=s[i],prev=s[Math.max(0,i-1)], blend=row.s>prev.s ? (distance-prev.s)/(row.s-prev.s) : 0;
    return {row,position:point(prev.position).lerp(point(row.position),blend)};
  }
  function renderPlot(edge,f) {
    const ctx=plot.getContext("2d"),w=plot.width,h=plot.height;
    ctx.clearRect(0,0,w,h);
    ctx.strokeStyle="#b8c2b7";ctx.lineWidth=1;
    for (const y of [0.25,0.5,0.75]) {ctx.beginPath();ctx.moveTo(0,h*y);ctx.lineTo(w,h*y);ctx.stroke();}
    ctx.beginPath();
    for (const [i,s] of edge.samples.entries()) {
      const x=s.s/edge.length*w,y=h-6-(h-12)*s.speed/report.profile.speed;
      if (!i) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.strokeStyle="#285b4e";ctx.lineWidth=3;ctx.stroke();
    ctx.beginPath();ctx.moveTo(f*w,0);ctx.lineTo(f*w,h);ctx.strokeStyle="#aa572e";ctx.lineWidth=2;ctx.stroke();
  }
  function update() {
    const i=Number(selector.value),edge=report.edges[i],f=Number(el("motion-station").value)/1000;
    const {row,position}=sampleAt(edge,f);
    cursor.position.copy(position);
    routes.forEach((line,k)=>{line.material.opacity=k===i ? 1:0.4;line.material.transparent=k!==i;});
    el("route-length").textContent=edge.length.toFixed(1)+" m";
    el("edge-state").dataset.blocked=String(edge.reasons.length>0);
    el("edge-state").textContent=[edge.level,...edge.reasons.map(r=>reasonLabels[r]??r)].join(" · ");
    el("station-values").textContent=(edge.length*f).toFixed(1)+" m · "+row.speed.toFixed(1)+" m/s · "+
      (row.curvature??0).toFixed(4)+" m⁻¹ curvature · "+row.clearance.toFixed(2)+" m clearance";
    const body=el("launches").tBodies[0];body.replaceChildren();
    for (const launch of edge.launches) {
      const tr=body.insertRow();
      for (const label of [Math.round(launch.fraction*100)+"%",launch.minimumClearance.toFixed(2)+" m",
        launch.feasible ? "Clear":"Rejected"]) tr.insertCell().textContent=label;
      tr.dataset.pass=String(launch.feasible);
    }
    renderPlot(edge,f);
  }
  selector.onchange=update;el("motion-station").oninput=update;update();
  el("mesh-cost").textContent=report.renderTriangles.toLocaleString()+" render triangles · "+
    report.collisionTriangles.toLocaleString()+" collision triangles";
  el("summary").textContent=compiled.sockets.length+" sockets · "+report.edges.length+" directed edges";
  el("movement-envelope").textContent=report.profile.id+" · "+report.profile.speed+" m/s entry · "+
    report.edges.filter(e=>e.reasons.length).length+" edges with a recorded constraint";
  el("save-analysis").onclick=()=>{
    const a=document.createElement("a");
    a.href=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:"application/json"}));
    a.download="motion-"+compiled.seed+".json";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  };
  el("motion-inspector").hidden=false;
  return {index,bounds,report,get overview(){return overview;},useFlight:()=>setOverview(false),
    get camera(){return overview ? overviewCamera : flightCamera;}};
}
