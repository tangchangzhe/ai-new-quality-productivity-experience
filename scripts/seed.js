import "../server/config.js";
import { getPool, insertIdea, recordVote, runSchema, saveEvaluation } from "../server/db.js";

const domains = [
  {
    tag: "医疗",
    direction: "AI辅助医疗诊断",
    ideas: [
      "用AI整合病历、影像和检查指标，自动提示早期风险并生成诊疗路径",
      "让基层医院通过AI读取CT影像，提前发现肺结节和脑卒中征兆",
      "建立AI慢病随访系统，根据血糖、用药和生活记录主动调整干预方案",
      "用AI把多科室会诊信息整理成统一决策图，减少重复检查和等待时间",
      "训练模型识别急诊分诊风险，让危重病人更快进入绿色通道",
      "用AI分析药物不良反应和用药冲突，辅助医生做安全处方",
      "建设医院运营AI中台，预测床位、耗材和手术室资源的压力",
      "用语音AI自动生成结构化病历，让医生把时间还给诊疗"
    ]
  },
  {
    tag: "制造",
    direction: "智能制造质检",
    ideas: [
      "用AI视觉检测产线缺陷，把人工抽检改为全流程实时质检",
      "让设备日志和传感器数据进入预测模型，提前安排维护避免停线",
      "建立AI排产系统，根据订单、库存和设备状态自动调整生产计划",
      "用多模态模型分析工艺参数和成品质量，反推最佳生产窗口",
      "在工厂部署AI安全巡检，实时识别违规操作和危险区域停留",
      "用AI连接供应商交付和车间节拍，减少物料等待造成的浪费",
      "让机器人通过视觉和力控模型完成柔性装配，适应小批量定制",
      "用AI生成工艺改进方案，并通过数字孪生先验证再上线"
    ]
  },
  {
    tag: "教育",
    direction: "个性化教育",
    ideas: [
      "用AI根据学生错题和学习轨迹生成个性化练习和讲解",
      "建立课堂AI助教，实时发现学生听不懂的知识点并反馈给老师",
      "让AI把职业能力拆成训练任务，为学生生成项目式学习路径",
      "用AI评估作文、实验报告和口语表达，提供可操作的改进建议",
      "建设课程知识图谱，让学生按薄弱点自动获得补救资源",
      "用AI把企业真实任务转化为教学案例，提高课程与产业的连接度",
      "让AI辅助教师备课，自动匹配案例、数据和课堂互动问题",
      "用AI追踪学习投入和掌握程度，提前识别掉队风险"
    ]
  },
  {
    tag: "农业",
    direction: "智慧农业生产",
    ideas: [
      "用AI识别作物病虫害图片并给出精准用药和灌溉建议",
      "建立农田传感器和气象模型，自动预测产量和灾害风险",
      "让无人机结合AI巡田，按地块生成施肥、除草和采收计划",
      "用AI分析育种数据，缩短新品种筛选周期",
      "建设养殖AI监测系统，提前发现疾病、缺氧和饲料异常",
      "用AI连接农产品需求、价格和物流，指导种植结构调整",
      "让温室通过AI控制光照、温湿度和营养液，提高单位面积产出",
      "用AI评估土壤质量和历史产量，生成分区管理方案"
    ]
  },
  {
    tag: "政务",
    direction: "城市治理智能化",
    ideas: [
      "用AI把群众诉求、热线记录和部门工单自动归类并派发",
      "建设城市事件感知系统，提前发现积水、拥堵和安全隐患",
      "让AI辅助审批材料预审，减少企业和群众反复补件",
      "用AI分析公共服务数据，发现资源配置不均衡的区域",
      "建立基层治理AI助手，把政策条款转化为可执行办理清单",
      "用AI预测大型活动人流风险，动态调整安保和交通方案",
      "让跨部门数据通过AI生成统一问题视图，减少重复治理",
      "用AI辅助应急预案推演，提高灾害响应和资源调度效率"
    ]
  },
  {
    tag: "科研",
    direction: "AI辅助科研发现",
    ideas: [
      "用AI阅读论文和实验记录，自动提出可验证的新假设",
      "让AI生成材料配方并安排实验优先级，缩短研发周期",
      "建立实验室AI助手，自动整理数据、发现异常并推荐下一步实验",
      "用AI预测蛋白质结构和功能，寻找新的药物靶点",
      "让模型分析专利、论文和市场数据，发现技术空白区域",
      "用AI把大型仪器数据自动清洗和标注，提升科研复用效率",
      "建设跨学科知识图谱，让AI发现不同领域概念之间的联系",
      "用AI模拟复杂系统，先筛掉低价值实验再进入真实验证"
    ]
  },
  {
    tag: "物流",
    direction: "供应链智能调度",
    ideas: [
      "用AI预测订单波峰并自动调整仓储、人力和车辆调度",
      "建立供应链风险模型，提前发现交付延误和库存断点",
      "让AI根据交通、天气和时效要求动态规划配送路线",
      "用AI优化仓库拣选路径，降低人工行走距离和错发率",
      "建设跨企业需求预测系统，减少牛鞭效应造成的库存浪费",
      "用AI识别异常订单和退货模式，优化售后与补货策略",
      "让冷链物流通过AI监控温度和路线，降低损耗",
      "用AI把采购、生产和配送计划联动起来，形成端到端调度"
    ]
  },
  {
    tag: "能源",
    direction: "能源系统优化",
    ideas: [
      "用AI预测新能源出力和用电需求，优化电网调峰",
      "建立设备巡检AI模型，提前发现风机、光伏和变压器异常",
      "让AI调度储能和负荷响应，降低峰谷波动带来的成本",
      "用AI分析企业能耗数据，自动生成节能改造方案",
      "建设园区能源数字孪生，模拟不同生产计划下的碳排放",
      "用AI优化充电桩布局和充电价格，提高新能源车补能效率",
      "让电网运维通过AI识别故障链路，缩短抢修时间",
      "用AI评估建筑能耗和舒适度，自动控制空调照明系统"
    ]
  }
];

const modelKeys = ["deepseek", "gpt", "claude"];
const modelNames = {
  deepseek: "DeepSeek V4 Pro",
  gpt: "GPT-5.5",
  claude: "Claude Opus 4.6"
};

function buildSeedItems() {
  const items = [];
  let index = 0;
  while (items.length < 100) {
    const domain = domains[index % domains.length];
    const idea = domain.ideas[Math.floor(index / domains.length) % domain.ideas.length];
    const level = index % 5 === 0 ? 3 : index % 3 === 0 ? 2 : 1;
    const base = level === 1 ? 28 : level === 2 ? 62 : 84;
    const score = Math.min(98, base + (index % 11));
    items.push({
      sessionId: `seed-session-${String(index + 1).padStart(3, "0")}`,
      content: `${idea}，并把数据反馈沉淀为可持续优化的生产力闭环。`,
      tag: domain.tag,
      level,
      score,
      comment:
        level === 1
          ? "方向明确，但仍偏单点效率提升"
          : level === 2
            ? "具备流程重构潜力，落地路径较清晰"
            : "想象空间突出，触及能力边界突破",
      votedModel: modelKeys[index % modelKeys.length]
    });
    index += 1;
  }
  return items;
}

try {
  await runSchema();
  const pool = getPool();
  const [[{ count }]] = await pool.execute("SELECT COUNT(*) AS count FROM ideas WHERE seeded = 1");
  const existing = Number(count);
  const target = 100;

  if (existing >= target) {
    console.log(`Seed data already has ${existing} records. No new rows inserted.`);
  } else {
    const items = buildSeedItems().slice(existing, target);
    for (const item of items) {
      const ideaId = await insertIdea({
        sessionId: item.sessionId,
        content: item.content,
        tag: item.tag,
        seeded: 1
      });
      await saveEvaluation({
        ideaId,
        sessionId: item.sessionId,
        level: item.level,
        score: item.score,
        comment: item.comment,
        percentile: null,
        seeded: 1
      });
      await recordVote({
        ideaId,
        sessionId: item.sessionId,
        votedModel: item.votedModel,
        votedModelName: modelNames[item.votedModel]
      });
    }
    console.log(`Inserted ${items.length} seed records. Seed total is now ${target}.`);
  }
} catch (error) {
  console.error("Failed to seed database.");
  console.error(error);
  process.exitCode = 1;
} finally {
  await getPool().end();
}
