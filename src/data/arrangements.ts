import {
  arrangementReminderMessagePrefix,
  arrangementSystemIdentityId,
  getPrivateConversationId,
  type TestGroup,
  type TestIdentity,
  type TestMessage,
} from "@/data/testConversations";
import type { RecordItem, RecordSourceConversation } from "@/types/record";

export type ArrangementStatus = "active" | "completed" | "later";
export type ArrangementSourceType = "manual" | "self" | "private" | "group";

export type ArrangementSource = {
  id: string;
  type: ArrangementSourceType;
  label: string;
  text: string;
  timestamp: number;
  sourceConversation?: RecordSourceConversation;
};

export type ArrangementItem = {
  id: string;
  title: string;
  summary: string;
  timeText: string;
  dateKey: string;
  hour?: number;
  minute?: number;
  hasExactTime: boolean;
  reminderText: string;
  people: string[];
  place?: string;
  status: ArrangementStatus;
  reminder: "on" | "todayOff" | "off";
  urgency: "green" | "orange" | "red";
  generated: boolean;
  confidence: "manual" | "high" | "medium";
  executionLevel: "user" | "aiAssist" | "aiComplete";
  updatedAt: number;
  completedAt?: number;
  sources: ArrangementSource[];
};

export type StoredManualArrangement = {
  id: string;
  title: string;
  timeText?: string;
  dateKey?: string;
  hour?: number;
  minute?: number;
  note: string;
  createdAt: number;
};

export type StoredArrangementPreference = {
  id: string;
  status?: ArrangementStatus;
  reminder?: ArrangementItem["reminder"];
  title?: string;
  dateKey?: string;
  hour?: number;
  minute?: number;
  clearTime?: boolean;
  urgency?: ArrangementItem["urgency"];
  people?: string[];
  updatedAt?: number;
  completedAt?: number;
};

const actionKeywords = [
  "记得",
  "提醒",
  "安排",
  "明天",
  "后天",
  "今天",
  "下周",
  "周末",
  "带",
  "去",
  "来",
  "开会",
  "体检",
  "医院",
  "早餐",
  "午餐",
  "晚餐",
  "取餐",
  "拿餐",
  "取饭",
  "拿饭",
  "带饭",
  "挂号",
  "约",
  "一起",
  "帮",
  "拿",
  "取",
];

const completionKeywords = ["已经", "已", "完成", "办完", "体检了", "去了", "搞定"];

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function detectClockTime(text: string) {
  const match = text.match(/(\d{1,2})\s*(?:点|:|：)\s*(\d{1,2})?/);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function formatClockTime(hour: number, minute: number) {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function detectTimeText(text: string) {
  const clockTime = detectClockTime(text);
  if (clockTime) return formatClockTime(clockTime.hour, clockTime.minute);

  const match = text.match(/(今天|明天|后天|下周[一二三四五六日天]?|周末|上午|下午|晚上)/);
  return match?.[0] ?? "06:00 安排消息提醒";
}

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function resolveDateKey(text: string) {
  const date = new Date();
  if (text.includes("后天")) date.setDate(date.getDate() + 2);
  else if (text.includes("明天")) date.setDate(date.getDate() + 1);
  else if (text.includes("下周")) date.setDate(date.getDate() + 7);
  else if (text.includes("周末")) {
    const daysUntilSaturday = (6 - date.getDay() + 7) % 7 || 7;
    date.setDate(date.getDate() + daysUntilSaturday);
  }
  return formatDateKey(date);
}

function detectPlace(text: string) {
  if (text.includes("医院")) return "医院";
  if (text.includes("公司")) return "公司";
  if (text.includes("学校")) return "学校";
  return undefined;
}

type TaskIntent = {
  title: string;
  key: string;
  target?: string;
};

function detectMealType(text: string) {
  if (/早餐|早饭|早点/.test(text)) return "早餐";
  if (/午餐|午饭|中饭/.test(text)) return "午餐";
  if (/晚餐|晚饭/.test(text)) return "晚餐";
  return "餐";
}

function detectObjectTarget(text: string, fallbackName?: string) {
  if (fallbackName && /(帮|给|替|带|取|拿)/.test(text)) return fallbackName;
  if (text.includes("爸爸")) return "爸爸";
  if (text.includes("姐姐")) return "姐姐";
  if (text.includes("同事")) return "同事";
  if (text.includes("朋友")) return "朋友";
  if (text.includes("家人")) return "家人";
  if (/(我|自己)/.test(text)) return "自己";
  return fallbackName;
}

function detectTaskIntent(text: string, fallbackName?: string): TaskIntent | null {
  if (isDailyNonTask(text)) return null;
  if (text.includes("医院") || text.includes("体检") || text.includes("挂号")) {
    return { title: "去医院", key: "hospital" };
  }
  if (
    text.includes("取餐") ||
    text.includes("拿餐") ||
    text.includes("取饭") ||
    text.includes("拿饭") ||
    text.includes("带饭") ||
    text.includes("早餐") ||
    text.includes("午餐") ||
    text.includes("晚餐")
  ) {
    if (/自己.*(吃饭|早餐|午餐|晚餐)|我.*(吃饭|早餐|午餐|晚餐)/.test(text) && !/(约|一起|帮|带|取|拿)/.test(text)) {
      return null;
    }
    const mealType = detectMealType(text);
    const target = detectObjectTarget(text, fallbackName);
    const targetText = target && target !== "自己" ? target : "";
    return {
      title: targetText ? `帮${targetText}取${mealType}` : `取${mealType}`,
      key: `pickup-${mealType}-${targetText || "self"}`,
      target,
    };
  }
  if (/(约|一起|请).*(吃饭|早餐|午餐|晚餐)|吃饭.*(约|一起)/.test(text)) {
    const mealType = detectMealType(text);
    const target = detectObjectTarget(text, fallbackName);
    return {
      title: target && target !== "自己" ? `约${target}吃${mealType}` : `约饭`,
      key: `dining-${mealType}-${target || "unknown"}`,
      target,
    };
  }
  if (text.includes("开会")) {
    const target = detectObjectTarget(text, fallbackName);
    return { title: target ? `和${target}开会` : "参加会议", key: `meeting-${target || "general"}`, target };
  }
  if (text.includes("提醒")) {
    const title = text.replace(/^.*提醒/, "提醒").slice(0, 18);
    return { title, key: title };
  }
  return null;
}

function isDailyNonTask(text: string) {
  if (/睡觉|起床|刷牙|洗脸/.test(text)) return true;
  if (/(自己|我).*(吃饭|早餐|午餐|晚餐)/.test(text) && !/(约|一起|帮|带|取|拿)/.test(text)) {
    return true;
  }
  return false;
}

function detectUrgency(text: string): ArrangementItem["urgency"] {
  if (/紧急|马上|立刻|必须|务必|今天一定/.test(text)) return "orange";
  if (/尽快|别忘|记得|重要/.test(text)) return "orange";
  return "green";
}

function getReminderByUrgency(urgency: ArrangementItem["urgency"]): ArrangementItem["reminder"] {
  if (urgency === "green") return "on";
  return "on";
}

function detectPeople(text: string, fallbackName?: string) {
  const people = new Set<string>();
  if (fallbackName) people.add(fallbackName);
  if (text.includes("爸爸")) people.add("爸爸");
  if (text.includes("姐姐")) people.add("姐姐");
  if (text.includes("家人")) people.add("家人");
  if (text.includes("同事")) people.add("同事");
  return [...people];
}

function shouldCreateArrangement(text: string) {
  return actionKeywords.some((keyword) => text.includes(keyword));
}

function shouldMarkCompleted(text: string, topic: string) {
  if (!completionKeywords.some((keyword) => text.includes(keyword))) return false;
  if (topic.includes("医院")) return text.includes("医院") || text.includes("体检");
  if (/取.*餐|取.*饭|早餐|午餐|晚餐/.test(topic)) return /取餐|拿餐|取饭|拿饭|带饭|早餐|午餐|晚餐/.test(text);
  if (/约饭|约.*吃/.test(topic)) return /吃了|吃完|见完|聚完/.test(text);
  return true;
}

function makeArrangementId(topic: string) {
  return `auto-${topic.replace(/[^\p{Letter}\p{Number}]+/gu, "-").replace(/^-+|-+$/g, "")}`;
}

function makeReminderText(hour?: number, minute?: number) {
  if (typeof hour === "number" && typeof minute === "number") {
    return `${formatClockTime(hour, minute)} 提醒`;
  }
  return "06:00 安排消息提醒：查看您今日所需事务";
}

function mergeSources(left: ArrangementSource[], right: ArrangementSource[]) {
  const byId = new Map<string, ArrangementSource>();
  [...left, ...right].forEach((source) => byId.set(source.id, source));
  return [...byId.values()].sort((a, b) => a.timestamp - b.timestamp);
}

function applyPreference(
  arrangement: ArrangementItem,
  preferences: StoredArrangementPreference[]
) {
  const preference = preferences.find((item) => item.id === arrangement.id);
  if (!preference) return arrangement;

  return {
    ...arrangement,
    title: preference.title || arrangement.title,
    dateKey: preference.dateKey || arrangement.dateKey,
    hour: preference.clearTime ? undefined : preference.hour ?? arrangement.hour,
    minute: preference.clearTime ? undefined : preference.minute ?? arrangement.minute,
    hasExactTime:
      preference.clearTime
        ? false
        :
      typeof preference.hour === "number" && typeof preference.minute === "number"
        ? true
        : arrangement.hasExactTime,
    timeText:
      preference.clearTime
        ? "06:00 安排消息提醒"
        :
      typeof preference.hour === "number" && typeof preference.minute === "number"
        ? formatClockTime(preference.hour, preference.minute)
        : arrangement.timeText,
    reminderText:
      preference.clearTime
        ? makeReminderText()
        :
      typeof preference.hour === "number" && typeof preference.minute === "number"
        ? makeReminderText(preference.hour, preference.minute)
        : arrangement.reminderText,
    urgency: preference.urgency || arrangement.urgency,
    people: preference.people || arrangement.people,
    status: preference.status || arrangement.status,
    reminder: preference.reminder || arrangement.reminder,
    updatedAt: preference.updatedAt || arrangement.updatedAt,
    completedAt: preference.completedAt || arrangement.completedAt,
  };
}

function createManualArrangement(item: StoredManualArrangement): ArrangementItem {
  const hasExactTime = typeof item.hour === "number" && typeof item.minute === "number";
  const timeText = hasExactTime ? formatClockTime(item.hour!, item.minute!) : item.timeText || "06:00 安排消息提醒";
  return {
    id: item.id,
    title: item.title,
    summary: item.note || "手动创建的安排，适合记录 AI 难以理解的私人暗号或临时事项。",
    timeText,
    dateKey: item.dateKey || resolveDateKey(`${item.title} ${item.timeText ?? ""} ${item.note}`),
    hour: item.hour,
    minute: item.minute,
    hasExactTime,
    reminderText: makeReminderText(item.hour, item.minute),
    people: [],
    status: "active",
    reminder: "on",
    urgency: "green",
    generated: false,
    confidence: "manual",
    executionLevel: "user",
    updatedAt: item.createdAt,
    sources: [
      {
        id: `${item.id}-manual-source`,
        type: "manual",
        label: "手动创建",
        text: item.note || item.title,
        timestamp: item.createdAt,
      },
    ],
  };
}

export function buildArrangements({
  manualItems,
  preferences,
  selfRecords,
  testMessages,
  testIdentities,
  testGroups,
  autoEnabled = true,
}: {
  manualItems: StoredManualArrangement[];
  preferences: StoredArrangementPreference[];
  selfRecords: RecordItem[];
  testMessages: TestMessage[];
  testIdentities: TestIdentity[];
  testGroups: TestGroup[];
  autoEnabled?: boolean;
}) {
  const arrangementMap = new Map<string, ArrangementItem>();

  manualItems.forEach((item) => {
    arrangementMap.set(item.id, createManualArrangement(item));
  });

  if (!autoEnabled) {
    return [...arrangementMap.values()]
      .map((item) => applyPreference(item, preferences))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  selfRecords.forEach((record) => {
    const text = normalizeText(record.text_content);
    if (!shouldCreateArrangement(text)) return;
    const intent = detectTaskIntent(text);
    if (!intent) return;
    const topic = intent.title;
    const id = makeArrangementId(intent.key);
    const current = arrangementMap.get(id);
    const urgency = current?.urgency ?? detectUrgency(text);
    const clockTime = detectClockTime(text);
    const source: ArrangementSource = {
      id: record.uid,
      type: "self",
      label: "发给自己",
      text,
      timestamp: record.send_at,
      sourceConversation: record.sourceConversation,
    };
    const next: ArrangementItem = {
      id,
      title: topic,
      summary: "从发给自己的内容中识别，适合快速把想法转成后续安排。",
      timeText: detectTimeText(text),
      dateKey: resolveDateKey(text),
      hour: clockTime?.hour,
      minute: clockTime?.minute,
      hasExactTime: Boolean(clockTime),
      reminderText: makeReminderText(clockTime?.hour, clockTime?.minute),
      people: detectPeople(text),
      place: detectPlace(text),
      status: current?.status ?? "active",
      reminder: current?.reminder ?? getReminderByUrgency(urgency),
      urgency,
      generated: true,
      confidence: "medium",
      executionLevel: "user",
      updatedAt: Math.max(current?.updatedAt ?? 0, record.update_at),
      sources: mergeSources(current?.sources ?? [], [source]),
    };
    arrangementMap.set(id, { ...next, people: [...new Set([...(current?.people ?? []), ...next.people])] });
  });

  testMessages.forEach((message) => {
    if (message.identityId === arrangementSystemIdentityId || message.id.startsWith(arrangementReminderMessagePrefix)) return;
    const text = normalizeText(message.text);
    if (!shouldCreateArrangement(text)) return;
    const identity = testIdentities.find((item) => item.id === message.identityId);
    const group = testGroups.find((item) => item.id === message.conversationId);
    const conversationLabel =
      message.conversationType === "group"
        ? group?.name ?? "群聊"
        : identity?.name ?? "私聊";
    const intent = detectTaskIntent(text, identity?.name);
    if (!intent) return;
    const topic = intent.title;
    const id = makeArrangementId(intent.key);
    const current = arrangementMap.get(id);
    const urgency = current?.urgency ?? detectUrgency(text);
    const clockTime = detectClockTime(text);
    const source: ArrangementSource = {
      id: message.id,
      type: message.conversationType,
      label: conversationLabel,
      text,
      timestamp: message.sentAt,
      sourceConversation: {
        type: "test",
        label: conversationLabel,
        actionLabel: "进入对应对话",
        iconLabel: message.conversationType === "group" ? group?.avatarLabel ?? "群" : identity?.avatarLabel ?? "聊",
        conversationId:
          message.conversationType === "group"
            ? message.conversationId
            : getPrivateConversationId(message.identityId),
        recordUid: `test-${message.id}`,
      },
    };
    const inferredStatus: ArrangementStatus =
      current?.status === "completed" || shouldMarkCompleted(text, topic)
        ? "completed"
        : current?.status ?? "active";
    const next: ArrangementItem = {
      id,
      title: topic,
      summary:
        message.sender === "demo"
          ? "从自己的回复中识别，代表我已经承诺或更新了这件事。"
          : "从对话中识别，后续可接入大模型判断双方视角和责任人。",
      timeText: detectTimeText(text),
      dateKey: resolveDateKey(text),
      hour: clockTime?.hour,
      minute: clockTime?.minute,
      hasExactTime: Boolean(clockTime),
      reminderText: makeReminderText(clockTime?.hour, clockTime?.minute),
      people: detectPeople(text, identity?.name),
      place: detectPlace(text),
      status: inferredStatus,
      reminder: current?.reminder ?? getReminderByUrgency(urgency),
      urgency,
      generated: true,
      confidence: text.length > 10 ? "high" : "medium",
      executionLevel: /取.*餐|约饭|约.*吃/.test(topic) ? "user" : "aiAssist",
      updatedAt: Math.max(current?.updatedAt ?? 0, message.sentAt),
      completedAt:
        inferredStatus === "completed"
          ? Math.max(current?.completedAt ?? 0, message.sentAt)
          : undefined,
      sources: mergeSources(current?.sources ?? [], [source]),
    };
    arrangementMap.set(id, { ...next, people: [...new Set([...(current?.people ?? []), ...next.people])] });
  });

  return [...arrangementMap.values()]
    .map((item) => applyPreference(item, preferences))
    .sort((a, b) => {
      const statusWeight = { active: 0, later: 1, completed: 2 };
      return statusWeight[a.status] - statusWeight[b.status] || b.updatedAt - a.updatedAt;
    });
}
