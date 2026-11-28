export const chinese = /^zh(?:-|$)/i.test(navigator.language);
export const local = (en, zh) => chinese ? zh : en;

const labels = {
  "Source ↗":"源码 ↗", "Guide":"教程", "World":"世界", "Seed":"种子", "Apply seed":"应用种子",
  "Spatial worlds":"空间世界", "Corridor studies":"走廊研究", "Loading world…":"正在加载世界…",
  "Playable world":"可飞行世界", "Viewport layers":"视图图层", "Motion Inspector":"运动检查器",
  "Render":"渲染", "Collision":"碰撞", "Routes":"航路", "Zones":"运动区", "Fly from entry":"从入口起飞",
  "Directed route":"有向航路", "Speed envelope · m/s":"速度包络 · m/s", "Inspect distance":"检查航路位置",
  "Active release":"主动脱离", "Route":"航程", "Clearance":"净空", "Result":"结果",
  "Export motion analysis":"导出运动分析", "References":"来源", "Generation rules":"生成规则",
  "Inspect rules":"查看规则", "Edit and export flight study":"编辑与导出飞行研究", "Prototype rules":"原型规则",
  "Preview changes":"预览修改", "Restore source rules":"还原原始规则", "Save GLB":"保存 GLB",
  "Save WorldIR":"保存 WorldIR", "Fly in Skimmer ↗":"前往 Skimmer 实飞 ↗",
  "Save this GLB, then choose it in Skimmer’s local world library.":"保存此 GLB，再从 Skimmer 本地世界库选择该文件。",
  "Read downstream flight report":"读取下游飞行报告", "Open WorldIR ↗":"打开 WorldIR ↗",
  "Forward":"前进","Back":"后退","Left":"左移","Right":"右移","Rise":"上升","Lower":"下降",
  "flight":"飞行","dash":"冲刺","survey":"勘察"
};
export const label = text => chinese ? (labels[text] ?? text) : text;

export function localizeControls() {
  if (!chinese) return;
  document.documentElement.lang="zh-CN";
  document.title="V2Wpro · 世界研究";
  const nodes=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  while (nodes.nextNode()) {
    const node=nodes.currentNode, original=node.textContent.trim();
    if (Object.hasOwn(labels,original)) node.textContent=node.textContent.replace(original,labels[original]);
  }
  for (const name of ["aria-label","label"]) {
    for (const element of document.querySelectorAll("["+name+"]")) {
      const original=element.getAttribute(name);
      if (Object.hasOwn(labels,original)) element.setAttribute(name,labels[original]);
    }
  }
}
