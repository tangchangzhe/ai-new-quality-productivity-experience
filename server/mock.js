const domainKeywords = [
  ["医疗", "诊断", "影像", "病历", "药"],
  ["制造", "工厂", "质检", "产线", "设备"],
  ["教育", "学习", "课堂", "学生", "课程"],
  ["农业", "种植", "养殖", "农田", "育种"],
  ["政务", "城市", "治理", "审批", "公共"],
  ["科研", "实验", "材料", "蛋白", "论文"],
  ["物流", "供应链", "仓储", "调度", "运输"],
  ["能源", "电网", "碳", "储能", "巡检"]
];

const modelAngles = {
  deepseek:
    "可以把分散业务数据整理成可执行的决策链路，让 AI 先识别瓶颈、生成方案，再把关键节点交给人确认。这样价值不只是写材料更快，而是把经验判断沉淀成可复用流程，持续压缩试错成本。",
  gpt:
    "可以从一个高频场景切入，先让 AI 接管信息收集、方案比较和结果复盘三件事，再逐步连接业务系统。长期看，它会形成一个自学习的生产中枢，让组织每次执行都变得更聪明。",
  claude:
    "关键不是让单个人效率提升，而是让 AI 成为跨部门协作的中间层。它把目标、约束、资源和反馈翻译成统一任务图，减少沟通损耗，也让复杂项目更容易被拆解和持续优化。"
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function inferDirection(content) {
  const matched = domainKeywords.find((group) =>
    group.some((keyword) => content.includes(keyword))
  );
  if (!matched) return "AI驱动流程优化";
  const first = matched[0];
  const names = {
    医疗: "AI辅助医疗诊断",
    制造: "智能制造质检",
    教育: "个性化教育",
    农业: "智慧农业生产",
    政务: "城市治理智能化",
    科研: "AI辅助科研发现",
    物流: "供应链智能调度",
    能源: "能源系统优化"
  };
  return names[first] || `${first}智能化`;
}

export async function* mockTextStream(content, modelKey) {
  const direction = inferDirection(content);
  const text = `${direction}的落地可以先从一个真实业务闭环切入。${modelAngles[modelKey] || modelAngles.deepseek}`;
  const parts = text.match(/.{1,12}/gu) || [text];
  for (const part of parts) {
    await sleep(80 + Math.random() * 120);
    yield part;
  }
}

export function mockEvaluation(content) {
  const specificSignals = ["系统", "流程", "数据", "闭环", "平台", "模型", "预测", "自动"];
  const emergenceSignals = ["发现", "预测", "蛋白", "新材料", "无人", "自主", "从零", "创新"];
  const processSignals = ["重构", "协同", "供应链", "产线", "诊疗", "调度", "审批", "全流程"];

  const emergenceScore = emergenceSignals.filter((word) => content.includes(word)).length;
  const processScore = processSignals.filter((word) => content.includes(word)).length;
  const specificity = specificSignals.filter((word) => content.includes(word)).length;

  let level = 1;
  if (processScore >= 1 || specificity >= 3) level = 2;
  if (emergenceScore >= 2 && specificity >= 2) level = 3;

  const base = level === 1 ? 24 : level === 2 ? 56 : 82;
  const score = Math.max(1, Math.min(100, base + specificity * 4 + processScore * 5 + emergenceScore * 3));
  const comments = {
    1: "方向清楚，但仍偏工具效率提升",
    2: "切入点较准，具备流程重构潜力",
    3: "想象空间突出，触及能力边界突破"
  };

  return { level, score, comment: comments[level] };
}

export function mockResonance(content, historyIdeas) {
  const direction = inferDirection(content);
  const primary = direction.slice(0, 2);
  const similar = historyIdeas
    .filter((idea) => idea.content.includes(primary) || idea.tag === primary)
    .slice(0, 3);
  const fallback = historyIdeas.slice(0, 3);
  const selected = similar.length >= 2 ? similar : fallback;

  return {
    direction,
    total_same_direction: Math.max(selected.length + 4, Math.min(historyIdeas.length, 18)),
    similar_ids: selected.map((idea) => idea.localIndex)
  };
}
