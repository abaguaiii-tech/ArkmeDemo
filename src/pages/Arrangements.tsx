import React from "react";
import { buildArrangements, type ArrangementItem, type StoredArrangementPreference, type StoredManualArrangement } from "@/data/arrangements";
import {
  acceptedLowConfidenceStorageKey,
  acknowledgedGeneratedStorageKey,
  arrangementDemoStateChangedEvent,
  autoEnabledStorageKey,
  deletedGeneratedStorageKey,
  ensureCurrentArrangementDemoState,
  manualStorageKey,
  preferenceStorageKey,
} from "@/data/arrangementDemoTools";
import type { TestGroup, TestIdentity, TestMessage } from "@/data/testConversations";
import { formatBubbleTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { RecordItem, RecordSourceConversation } from "@/types/record";

const weekLabels = ["一", "二", "三", "四", "五", "六", "日"];
const urgencyOptions: Array<{ value: ArrangementItem["urgency"]; label: string }> = [
  { value: "green", label: "绿色" },
  { value: "orange", label: "橙色" },
  { value: "red", label: "红色" },
];
const reminderOptions: Array<{ value: ArrangementItem["reminder"]; label: string }> = [
  { value: "on", label: "提醒中" },
  { value: "todayOff", label: "今天不提醒" },
  { value: "off", label: "不再提醒" },
];

type ArrangementsProps = {
  selfRecords: RecordItem[];
  testMessages: TestMessage[];
  testIdentities: TestIdentity[];
  testGroups: TestGroup[];
  onOpenSourceConversation: (source: RecordSourceConversation) => void;
};

function readJsonArray<T>(key: string): T[] {
  if (typeof window === "undefined") return [];

  try {
    const value = window.localStorage.getItem(key);
    if (!value) return [];
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeJsonArray(key: string, value: unknown[]) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Keep the in-memory UI responsive if storage is unavailable.
  }
}

function readBoolean(key: string, fallback: boolean) {
  if (typeof window === "undefined") return fallback;
  const value = window.localStorage.getItem(key);
  if (value === null) return fallback;
  return value === "true";
}

function readInitialArrangementState() {
  ensureCurrentArrangementDemoState();

  return {
    manualItems: readJsonArray<StoredManualArrangement>(manualStorageKey),
    preferences: readJsonArray<StoredArrangementPreference>(preferenceStorageKey),
    autoEnabled: readBoolean(autoEnabledStorageKey, true),
    acknowledgedGeneratedIds: readJsonArray<string>(acknowledgedGeneratedStorageKey),
    deletedGeneratedIds: readJsonArray<string>(deletedGeneratedStorageKey),
    acceptedLowConfidenceIds: readJsonArray<string>(acceptedLowConfidenceStorageKey),
  };
}

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function buildCalendarDays(viewDateKey: string) {
  const viewDate = parseDateKey(viewDateKey);
  const firstDay = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const startDate = new Date(firstDay);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  startDate.setDate(firstDay.getDate() - mondayOffset);

  return Array.from({ length: 35 }, (_, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);
    return {
      dateKey: formatDateKey(date),
      dayNumber: date.getDate(),
      inCurrentMonth: date.getMonth() === viewDate.getMonth(),
    };
  });
}

function addMonths(dateKey: string, offset: number) {
  const date = parseDateKey(dateKey);
  return formatDateKey(new Date(date.getFullYear(), date.getMonth() + offset, 1));
}

function formatMonthLabel(dateKey: string) {
  const date = parseDateKey(dateKey);
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

function formatSelectedDateLabel(dateKey: string) {
  const date = parseDateKey(dateKey);
  const todayKey = formatDateKey(new Date());
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = formatDateKey(tomorrow);
  if (dateKey === todayKey) return "今天";
  if (dateKey === tomorrowKey) return "明天";
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function getReminderDueState(item: ArrangementItem, now: Date) {
  if (item.status === "completed" || item.reminder !== "on") return "";
  if (item.dateKey !== formatDateKey(now)) return "";

  const reminderHour = typeof item.hour === "number" ? item.hour : 6;
  const reminderMinute = typeof item.minute === "number" ? item.minute : 0;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const reminderMinutes = reminderHour * 60 + reminderMinute;

  if (currentMinutes >= reminderMinutes) return "提醒触发中";
  return `将在 ${String(reminderHour).padStart(2, "0")}:${String(reminderMinute).padStart(2, "0")} 提醒`;
}

export default function Arrangements({
  selfRecords,
  testMessages,
  testIdentities,
  testGroups,
  onOpenSourceConversation,
}: ArrangementsProps) {
  const initialStateRef = React.useRef<ReturnType<typeof readInitialArrangementState> | null>(null);
  if (!initialStateRef.current) {
    initialStateRef.current = readInitialArrangementState();
  }

  const [manualItems, setManualItems] = React.useState<StoredManualArrangement[]>(() =>
    initialStateRef.current!.manualItems
  );
  const [preferences, setPreferences] = React.useState<StoredArrangementPreference[]>(() =>
    initialStateRef.current!.preferences
  );
  const [title, setTitle] = React.useState("");
  const [manualDateKey, setManualDateKey] = React.useState(() => formatDateKey(new Date()));
  const [hourInput, setHourInput] = React.useState("");
  const [minuteInput, setMinuteInput] = React.useState("");
  const [showDatePicker, setShowDatePicker] = React.useState(false);
  const [pickerViewDateKey, setPickerViewDateKey] = React.useState(() => formatDateKey(new Date()));
  const [note, setNote] = React.useState("");
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editingTitle, setEditingTitle] = React.useState("");
  const [detailEditingItem, setDetailEditingItem] = React.useState<ArrangementItem | null>(null);
  const [selectedDateKey, setSelectedDateKey] = React.useState(() => formatDateKey(new Date()));
  const [calendarViewDateKey, setCalendarViewDateKey] = React.useState(() => formatDateKey(new Date()));
  const [autoEnabled, setAutoEnabled] = React.useState(() => initialStateRef.current!.autoEnabled);
  const [showGeneratedMenu, setShowGeneratedMenu] = React.useState(false);
  const [acknowledgedGeneratedIds, setAcknowledgedGeneratedIds] = React.useState<string[]>(() =>
    initialStateRef.current!.acknowledgedGeneratedIds
  );
  const [deletedGeneratedIds, setDeletedGeneratedIds] = React.useState<string[]>(() =>
    initialStateRef.current!.deletedGeneratedIds
  );
  const [acceptedLowConfidenceIds, setAcceptedLowConfidenceIds] = React.useState<string[]>(() =>
    initialStateRef.current!.acceptedLowConfidenceIds
  );
  const [now, setNow] = React.useState(() => new Date());
  const listRef = React.useRef<HTMLDivElement | null>(null);

  const reloadArrangementDemoState = React.useCallback(() => {
    const nextState = readInitialArrangementState();
    const nextNow = new Date();
    const nextDateKey = formatDateKey(nextNow);
    setManualItems(nextState.manualItems);
    setPreferences(nextState.preferences);
    setAutoEnabled(nextState.autoEnabled);
    setAcknowledgedGeneratedIds(nextState.acknowledgedGeneratedIds);
    setDeletedGeneratedIds(nextState.deletedGeneratedIds);
    setAcceptedLowConfidenceIds(nextState.acceptedLowConfidenceIds);
    setNow(nextNow);
    setSelectedDateKey(nextDateKey);
    setCalendarViewDateKey(nextDateKey);
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const handleStateChange = () => reloadArrangementDemoState();
    const intervalId = window.setInterval(() => setNow(new Date()), 30 * 1000);
    window.addEventListener("storage", handleStateChange);
    window.addEventListener(arrangementDemoStateChangedEvent, handleStateChange);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("storage", handleStateChange);
      window.removeEventListener(arrangementDemoStateChangedEvent, handleStateChange);
    };
  }, [reloadArrangementDemoState]);

  React.useEffect(() => {
    writeJsonArray(manualStorageKey, manualItems);
  }, [manualItems]);

  React.useEffect(() => {
    writeJsonArray(preferenceStorageKey, preferences);
  }, [preferences]);

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(autoEnabledStorageKey, String(autoEnabled));
    }
  }, [autoEnabled]);

  React.useEffect(() => {
    writeJsonArray(acknowledgedGeneratedStorageKey, acknowledgedGeneratedIds);
  }, [acknowledgedGeneratedIds]);

  React.useEffect(() => {
    writeJsonArray(deletedGeneratedStorageKey, deletedGeneratedIds);
  }, [deletedGeneratedIds]);

  React.useEffect(() => {
    writeJsonArray(acceptedLowConfidenceStorageKey, acceptedLowConfidenceIds);
  }, [acceptedLowConfidenceIds]);

  const arrangements = React.useMemo(
    () =>
      buildArrangements({
        manualItems,
        preferences,
        selfRecords,
        testMessages,
        testIdentities,
        testGroups,
        autoEnabled,
      }).filter((item) => {
        if (deletedGeneratedIds.includes(item.id)) return false;
        if (item.generated && item.confidence !== "high") {
          return acceptedLowConfidenceIds.includes(item.id);
        }
        return true;
      }),
    [
      acceptedLowConfidenceIds,
      autoEnabled,
      deletedGeneratedIds,
      manualItems,
      preferences,
      selfRecords,
      testGroups,
      testIdentities,
      testMessages,
    ]
  );

  const selectedArrangements = arrangements.filter((item) => item.dateKey === selectedDateKey);
  const activeArrangements = selectedArrangements.filter((item) => item.status === "active");
  const quietArrangements = selectedArrangements.filter((item) => item.status === "later");
  const completedArrangements = selectedArrangements.filter((item) => item.status === "completed");
  const calendarDays = React.useMemo(() => buildCalendarDays(calendarViewDateKey), [calendarViewDateKey]);
  const pickerDays = React.useMemo(() => buildCalendarDays(pickerViewDateKey), [pickerViewDateKey]);
  const arrangementCountByDate = React.useMemo(() => {
    const countMap = new Map<string, number>();
    arrangements.forEach((item) => {
      countMap.set(item.dateKey, (countMap.get(item.dateKey) ?? 0) + 1);
    });
    return countMap;
  }, [arrangements]);
  const rawGeneratedArrangements = React.useMemo(
    () =>
      buildArrangements({
        manualItems,
        preferences,
        selfRecords,
        testMessages,
        testIdentities,
        testGroups,
        autoEnabled,
      }).filter((item) => item.generated && !deletedGeneratedIds.includes(item.id)),
    [
      autoEnabled,
      deletedGeneratedIds,
      manualItems,
      preferences,
      selfRecords,
      testGroups,
      testIdentities,
      testMessages,
    ]
  );
  const pendingHighConfidenceArrangements = rawGeneratedArrangements.filter(
    (item) => item.confidence === "high" && !acknowledgedGeneratedIds.includes(item.id)
  );
  const pendingLowConfidenceArrangements = rawGeneratedArrangements.filter(
    (item) => item.confidence !== "high" && !acceptedLowConfidenceIds.includes(item.id)
  );
  const pendingGeneratedArrangements = [
    ...pendingHighConfidenceArrangements,
    ...pendingLowConfidenceArrangements,
  ];
  const generatedButtonLabel =
    pendingGeneratedArrangements.length > 0
      ? `${pendingGeneratedArrangements.length} 项新事务`
      : `${arrangements.length} 项事务`;

  const selectDate = (dateKey: string) => {
    setSelectedDateKey(dateKey);
    setCalendarViewDateKey(dateKey);
    window.requestAnimationFrame(() => {
      listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const selectManualDate = (dateKey: string) => {
    setManualDateKey(dateKey);
    setPickerViewDateKey(dateKey);
    setShowDatePicker(false);
  };

  const upsertPreference = (id: string, patch: StoredArrangementPreference) => {
    setPreferences((current) => {
      const existing = current.find((item) => item.id === id);
      const next = { ...existing, ...patch, id, updatedAt: Date.now() };
      return existing
        ? current.map((item) => (item.id === id ? next : item))
        : [...current, next];
    });
  };

  const acknowledgeGenerated = () => {
    setAcknowledgedGeneratedIds((current) => [
      ...new Set([...current, ...pendingHighConfidenceArrangements.map((item) => item.id)]),
    ]);
    setShowGeneratedMenu(false);
  };

  const deleteGenerated = () => {
    setDeletedGeneratedIds((current) => [
      ...new Set([...current, ...pendingGeneratedArrangements.map((item) => item.id)]),
    ]);
    setAcknowledgedGeneratedIds((current) => [
      ...new Set([...current, ...pendingGeneratedArrangements.map((item) => item.id)]),
    ]);
    setShowGeneratedMenu(false);
  };

  const acceptGeneratedItem = (item: ArrangementItem) => {
    setAcceptedLowConfidenceIds((current) => [...new Set([...current, item.id])]);
  };

  const deleteGeneratedItem = (item: ArrangementItem) => {
    setDeletedGeneratedIds((current) => [...new Set([...current, item.id])]);
    setAcknowledgedGeneratedIds((current) => [...new Set([...current, item.id])]);
  };

  const createManualArrangement = () => {
    const nextTitle = title.trim();
    if (!nextTitle) return;
    const hasHour = hourInput.trim() !== "";
    const hasMinute = minuteInput.trim() !== "";
    const hour = hasHour ? Number(hourInput) : undefined;
    const minute = hasMinute ? Number(minuteInput) : undefined;
    const hasInvalidTime =
      hasHour !== hasMinute ||
      (typeof hour === "number" && (!Number.isInteger(hour) || hour < 0 || hour > 23)) ||
      (typeof minute === "number" && (!Number.isInteger(minute) || minute < 0 || minute > 59));
    if (hasInvalidTime) return;

    const timestamp = Date.now();
    setManualItems((current) => [
      ...current,
      {
        id: `manual-${timestamp}-${Math.random().toString(36).slice(2, 7)}`,
        title: nextTitle,
        dateKey: manualDateKey,
        hour,
        minute,
        timeText:
          typeof hour === "number" && typeof minute === "number"
            ? `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
            : "06:00 安排消息提醒",
        note: note.trim(),
        createdAt: timestamp,
      },
    ]);
    setTitle("");
    setHourInput("");
    setMinuteInput("");
    setNote("");
  };

  const handleNumericInput =
    (setter: (value: string) => void, maxLength: number) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setter(event.target.value.replace(/\D/g, "").slice(0, maxLength));
    };

  const timeInvalid =
    (hourInput.trim() === "") !== (minuteInput.trim() === "") ||
    (hourInput.trim() !== "" && Number(hourInput) > 23) ||
    (minuteInput.trim() !== "" && Number(minuteInput) > 59);

  const saveEditing = () => {
    if (!editingId) return;
    const nextTitle = editingTitle.trim();
    if (nextTitle) {
      upsertPreference(editingId, { id: editingId, title: nextTitle });
    }
    setEditingId(null);
    setEditingTitle("");
  };

  return (
    <div className="flex h-full flex-col bg-bg">
      <header className="shrink-0 bg-bg px-4 pb-3 pt-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold leading-7 text-text">安排</h1>
            <p className="mt-1 text-xs leading-5 text-text-muted">
              从对话和手动记录里收拢后续要落地的事
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setShowGeneratedMenu(true)}
              className="relative rounded-full bg-primary-soft px-3 py-2 text-xs font-medium leading-4 text-primary transition active:scale-[0.98]"
            >
              {pendingGeneratedArrangements.length > 0 && (
                <DraggableNewBadge
                  count={pendingGeneratedArrangements.length}
                  onDismiss={acknowledgeGenerated}
                />
              )}
              {generatedButtonLabel}
            </button>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        <section className="mt-3 rounded-[12px] border border-border bg-surface px-3 pb-3 pt-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-semibold leading-5 text-text">日历</h2>
              <p className="mt-0.5 text-xs leading-4 text-text-tertiary">
                {formatSelectedDateLabel(selectedDateKey)} 的安排
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] leading-4 text-text-tertiary">自动事务生成开关</span>
              <AutoGenerateSwitch checked={autoEnabled} onChange={setAutoEnabled} />
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setCalendarViewDateKey((value) => addMonths(value, -1))}
              className="h-8 w-8 rounded-full bg-bg text-sm text-text-muted transition active:scale-[0.96]"
              aria-label="上个月"
            >
              ‹
            </button>
            <span className="text-sm font-semibold text-text">{formatMonthLabel(calendarViewDateKey)}</span>
            <button
              type="button"
              onClick={() => setCalendarViewDateKey((value) => addMonths(value, 1))}
              className="h-8 w-8 rounded-full bg-bg text-sm text-text-muted transition active:scale-[0.96]"
              aria-label="下个月"
            >
              ›
            </button>
          </div>

          <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] leading-4 text-text-tertiary">
            {weekLabels.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1.5">
            {calendarDays.map((day) => {
              const count = arrangementCountByDate.get(day.dateKey) ?? 0;
              const selected = day.dateKey === selectedDateKey;
              return (
                <button
                  key={day.dateKey}
                  type="button"
                  onClick={() => selectDate(day.dateKey)}
                  className={cn(
                    "relative flex h-[42px] flex-col items-center justify-center rounded-[10px] border text-sm transition active:scale-[0.97]",
                    selected
                      ? "border-primary bg-primary-soft text-primary"
                      : day.inCurrentMonth
                        ? "border-transparent bg-bg text-text"
                        : "border-transparent bg-bg/60 text-text-disabled"
                  )}
                >
                  <span className="leading-5">{day.dayNumber}</span>
                  {count > 0 && (
                    <span className="absolute -right-1 -top-1 flex min-w-[18px] translate-x-1/2 -translate-y-1/2 justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-[18px] text-on-primary shadow-[0_2px_6px_rgba(9,184,62,0.25)]">
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-[12px] border border-border bg-surface px-3 pb-3 pt-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold leading-5 text-text">手动创建</h2>
            <span className="text-[11px] leading-4 text-text-tertiary">给 AI 难识别的暗号留入口</span>
          </div>
          <div className="mt-3 space-y-2">
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="h-10 w-full rounded-[10px] border border-border bg-bg px-3 text-sm text-text outline-none transition focus:border-primary"
              placeholder="例如：后天去医院复查"
            />
            <div className="grid grid-cols-[1fr_54px_54px_auto] gap-2">
              <button
                type="button"
                onClick={() => {
                  setPickerViewDateKey(manualDateKey);
                  setShowDatePicker((value) => !value);
                }}
                className="flex h-10 min-w-0 items-center justify-center rounded-[10px] border border-primary bg-primary-soft px-3 text-sm font-semibold text-primary outline-none transition active:scale-[0.98]"
                aria-label={`已选择日期 ${manualDateKey}`}
                title={manualDateKey}
              >
                日
              </button>
              <input
                value={hourInput}
                onChange={handleNumericInput(setHourInput, 2)}
                inputMode="numeric"
                className={cn(
                  "h-10 min-w-0 rounded-[10px] border bg-bg px-2 text-center text-sm text-text outline-none transition focus:border-primary",
                  timeInvalid ? "border-[#D9362B]" : "border-border"
                )}
                placeholder="时"
              />
              <input
                value={minuteInput}
                onChange={handleNumericInput(setMinuteInput, 2)}
                inputMode="numeric"
                className={cn(
                  "h-10 min-w-0 rounded-[10px] border bg-bg px-2 text-center text-sm text-text outline-none transition focus:border-primary",
                  timeInvalid ? "border-[#D9362B]" : "border-border"
                )}
                placeholder="分"
              />
              <button
                type="button"
                onClick={createManualArrangement}
                disabled={timeInvalid}
                className="h-10 rounded-[10px] bg-primary px-4 text-sm font-semibold text-on-primary transition active:scale-[0.98]"
              >
                创建
              </button>
            </div>
            {showDatePicker && (
              <MiniCalendarPicker
                selectedDateKey={manualDateKey}
                viewDateKey={pickerViewDateKey}
                days={pickerDays}
                onPrevMonth={() => setPickerViewDateKey((value) => addMonths(value, -1))}
                onNextMonth={() => setPickerViewDateKey((value) => addMonths(value, 1))}
                onSelectDate={selectManualDate}
              />
            )}
            {timeInvalid && (
              <p className="text-[11px] leading-4 text-[#D9362B]">请输入 00:00-23:59 内的有效时间，或两个时间框都留空。</p>
            )}
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="min-h-[64px] w-full resize-none rounded-[10px] border border-border bg-bg px-3 py-2 text-sm leading-5 text-text outline-none transition focus:border-primary"
              placeholder="补充背景，例如这件事为什么重要、和谁有关"
            />
          </div>
        </section>

        <div ref={listRef} className="pt-1" />

        {selectedArrangements.length === 0 && (
          <section className="mt-3 rounded-[12px] border border-border bg-surface px-4 py-8 text-center">
            <p className="text-sm font-semibold text-text">这一天暂时没有安排</p>
            <p className="mt-1 text-xs leading-5 text-text-tertiary">
              你可以手动创建，也可以从对话里继续产生新的安排。
            </p>
          </section>
        )}

        <ArrangementSection
          title="需要关注"
          description="真正值得放在眼前的少数安排"
          items={activeArrangements}
          editingId={editingId}
          editingTitle={editingTitle}
          onChangeEditingTitle={setEditingTitle}
          onStartEditing={setDetailEditingItem}
          onSaveEditing={saveEditing}
          onOpenSourceConversation={onOpenSourceConversation}
          onComplete={(item) =>
            upsertPreference(item.id, {
              id: item.id,
              status: "completed",
              completedAt: Date.now(),
            })
          }
          onLater={(item) => upsertPreference(item.id, { id: item.id, status: "later" })}
          onTodayOff={(item) =>
            upsertPreference(item.id, { id: item.id, reminder: "todayOff" })
          }
          onReminderOff={(item) =>
            upsertPreference(item.id, { id: item.id, reminder: "off" })
          }
          now={now}
        />

        <ArrangementSection
          title="以后再说"
          description="不删除、不催促，只是从今天的压力里移开"
          items={quietArrangements}
          editingId={editingId}
          editingTitle={editingTitle}
          onChangeEditingTitle={setEditingTitle}
          onStartEditing={setDetailEditingItem}
          onSaveEditing={saveEditing}
          onOpenSourceConversation={onOpenSourceConversation}
          onComplete={(item) =>
            upsertPreference(item.id, {
              id: item.id,
              status: "completed",
              completedAt: Date.now(),
            })
          }
          onLater={(item) => upsertPreference(item.id, { id: item.id, status: "active" })}
          onTodayOff={(item) =>
            upsertPreference(item.id, { id: item.id, reminder: "todayOff" })
          }
          onReminderOff={(item) =>
            upsertPreference(item.id, { id: item.id, reminder: "off" })
          }
          now={now}
        />

        <ArrangementSection
          title="已完成"
          description="包含手动完成和从对话中推断完成"
          items={completedArrangements}
          editingId={editingId}
          editingTitle={editingTitle}
          onChangeEditingTitle={setEditingTitle}
          onStartEditing={setDetailEditingItem}
          onSaveEditing={saveEditing}
          onOpenSourceConversation={onOpenSourceConversation}
          onComplete={(item) => upsertPreference(item.id, { id: item.id, status: "active" })}
          onLater={(item) => upsertPreference(item.id, { id: item.id, status: "later" })}
          onTodayOff={(item) =>
            upsertPreference(item.id, { id: item.id, reminder: "todayOff" })
          }
          onReminderOff={(item) =>
            upsertPreference(item.id, { id: item.id, reminder: "off" })
          }
          now={now}
        />
      </div>

      {showGeneratedMenu && (
        <GeneratedArrangementMenu
          items={pendingGeneratedArrangements}
          onClose={() => setShowGeneratedMenu(false)}
          onAcknowledge={acknowledgeGenerated}
          onDelete={deleteGenerated}
          onAcceptItem={acceptGeneratedItem}
          onDeleteItem={deleteGeneratedItem}
        />
      )}
      {detailEditingItem && (
        <ArrangementDetailEditor
          item={detailEditingItem}
          onClose={() => setDetailEditingItem(null)}
          onSave={(patch) => {
            upsertPreference(detailEditingItem.id, patch);
            if (patch.dateKey) {
              setSelectedDateKey(patch.dateKey);
              setCalendarViewDateKey(patch.dateKey);
            }
            setDetailEditingItem(null);
          }}
        />
      )}
    </div>
  );
}

function ArrangementSection({
  title,
  description,
  items,
  editingId,
  editingTitle,
  onChangeEditingTitle,
  onStartEditing,
  onSaveEditing,
  onOpenSourceConversation,
  onComplete,
  onLater,
  onTodayOff,
  onReminderOff,
  now,
}: {
  title: string;
  description: string;
  items: ArrangementItem[];
  editingId: string | null;
  editingTitle: string;
  onChangeEditingTitle: (value: string) => void;
  onStartEditing: (item: ArrangementItem) => void;
  onSaveEditing: () => void;
  onOpenSourceConversation: (source: RecordSourceConversation) => void;
  onComplete: (item: ArrangementItem) => void;
  onLater: (item: ArrangementItem) => void;
  onTodayOff: (item: ArrangementItem) => void;
  onReminderOff: (item: ArrangementItem) => void;
  now: Date;
}) {
  if (items.length === 0) return null;

  return (
    <section className="mt-3">
      <div className="mb-2 px-1">
        <h2 className="text-[15px] font-semibold leading-5 text-text">{title}</h2>
        <p className="mt-0.5 text-xs leading-4 text-text-tertiary">{description}</p>
      </div>
      <div className="space-y-2.5">
        {items.map((item) => (
          <ArrangementCard
            key={item.id}
            item={item}
            editing={editingId === item.id}
            editingTitle={editingTitle}
            onChangeEditingTitle={onChangeEditingTitle}
            onStartEditing={() => onStartEditing(item)}
            onSaveEditing={onSaveEditing}
            onOpenSourceConversation={onOpenSourceConversation}
            onComplete={() => onComplete(item)}
            onLater={() => onLater(item)}
            onTodayOff={() => onTodayOff(item)}
            onReminderOff={() => onReminderOff(item)}
            now={now}
          />
        ))}
      </div>
    </section>
  );
}

function ArrangementCard({
  item,
  editing,
  editingTitle,
  onChangeEditingTitle,
  onStartEditing,
  onSaveEditing,
  onOpenSourceConversation,
  onComplete,
  onLater,
  onTodayOff,
  onReminderOff,
  now,
}: {
  item: ArrangementItem;
  editing: boolean;
  editingTitle: string;
  onChangeEditingTitle: (value: string) => void;
  onStartEditing: () => void;
  onSaveEditing: () => void;
  onOpenSourceConversation: (source: RecordSourceConversation) => void;
  onComplete: () => void;
  onLater: () => void;
  onTodayOff: () => void;
  onReminderOff: () => void;
  now: Date;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const latestSource = item.sources[item.sources.length - 1];
  const urgencyConfig = getUrgencyConfig(item.urgency);
  const reminderDueState = getReminderDueState(item, now);

  return (
    <article className="rounded-[12px] border border-border bg-surface px-3 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-start gap-2.5">
        <div
          className={cn(
            "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-sm font-semibold",
            item.status === "completed"
              ? "bg-primary-soft text-primary"
              : item.status === "later"
                ? "bg-bg text-text-tertiary"
                : urgencyConfig.badgeClass
          )}
        >
          {item.status === "completed" ? "✓" : item.status === "later" ? "稍" : "安"}
        </div>
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="flex gap-2">
              <input
                value={editingTitle}
                onChange={(event) => onChangeEditingTitle(event.target.value)}
                className="h-9 min-w-0 flex-1 rounded-[9px] border border-border bg-bg px-2.5 text-sm text-text outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={onSaveEditing}
                className="h-9 rounded-[9px] bg-primary px-3 text-xs font-semibold text-on-primary"
              >
                保存
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="block w-full text-left"
            >
              <h3 className="text-[15px] font-semibold leading-5 text-text">{item.title}</h3>
              <p className="mt-1 text-xs leading-5 text-text-muted">{item.summary}</p>
            </button>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <ArrangementTag label={item.timeText} strong />
            {item.place && <ArrangementTag label={item.place} />}
            {item.people.slice(0, 2).map((person) => (
              <ArrangementTag key={person} label={person} />
            ))}
            <ArrangementTag label={getReminderLabel(item.reminder)} />
            {!item.hasExactTime && <ArrangementTag label={item.reminderText} />}
            <ArrangementTag label={urgencyConfig.label} tone={item.urgency} />
            <ArrangementTag label={getExecutionLabel(item.executionLevel)} />
            {reminderDueState && <ArrangementTag label={reminderDueState} tone="orange" />}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 rounded-[10px] bg-bg px-3 py-2.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold leading-4 text-text">相关上下文</p>
            <span className="text-[11px] leading-4 text-text-tertiary">
              {item.sources.length} 条归集
            </span>
          </div>
          <div className="mt-2 space-y-2">
            {item.sources.map((source) => (
              <div key={source.id} className="rounded-[9px] bg-surface px-2.5 py-2">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="truncate text-[11px] font-medium leading-4 text-primary">
                    {source.label}
                  </span>
                  <span className="shrink-0 text-[10px] leading-4 text-text-disabled">
                    {formatBubbleTime(source.timestamp)}
                  </span>
                </div>
                <p className="text-xs leading-5 text-text-muted">{source.text}</p>
                {source.sourceConversation && (
                  <button
                    type="button"
                    onClick={() => onOpenSourceConversation(source.sourceConversation!)}
                    className="mt-1 text-[11px] font-medium leading-4 text-primary"
                  >
                    进入来源
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <ActionButton onClick={onComplete}>
          {item.status === "completed" ? "重新关注" : "完成"}
        </ActionButton>
        <ActionButton onClick={onLater}>
          {item.status === "later" ? "放回今天" : "以后再说"}
        </ActionButton>
        <ActionButton onClick={onTodayOff}>今天不提醒</ActionButton>
        <ActionButton onClick={onReminderOff}>取消提醒</ActionButton>
        <ActionButton onClick={onStartEditing}>修改内容</ActionButton>
      </div>

      {latestSource && item.status === "completed" && (
        <p className="mt-2 text-[11px] leading-4 text-text-tertiary">
          最近一次状态来自：{latestSource.label}
        </p>
      )}
    </article>
  );
}

function AutoGenerateSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        "flex h-7 w-14 items-center rounded-full p-1 transition",
        checked ? "bg-primary" : "bg-bg"
      )}
      aria-pressed={checked}
      aria-label="自动生成安排"
    >
      <span
        className={cn(
          "h-5 w-5 rounded-full bg-white shadow-[0_1px_4px_rgba(15,23,42,0.18)] transition-transform",
          checked ? "translate-x-7" : "translate-x-0"
        )}
      />
    </button>
  );
}

function DraggableNewBadge({
  count,
  onDismiss,
}: {
  count: number;
  onDismiss: () => void;
}) {
  const [dragX, setDragX] = React.useState(0);
  const [dragY, setDragY] = React.useState(0);
  const startRef = React.useRef<{ x: number; y: number } | null>(null);

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => {
        event.stopPropagation();
        startRef.current = { x: event.clientX, y: event.clientY };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!startRef.current) return;
        event.stopPropagation();
        setDragX(event.clientX - startRef.current.x);
        setDragY(event.clientY - startRef.current.y);
      }}
      onPointerUp={(event) => {
        event.stopPropagation();
        const dismissed = Math.abs(dragX) > 22 || Math.abs(dragY) > 22;
        startRef.current = null;
        setDragX(0);
        setDragY(0);
        if (dismissed) onDismiss();
      }}
      className="absolute -left-2 -top-2 z-10 flex h-5 min-w-5 touch-none select-none items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-5 text-on-primary shadow-[0_2px_8px_rgba(9,184,62,0.3)] transition-transform"
      style={{ transform: `translate(${dragX}px, ${dragY}px)` }}
      aria-label="拖动标记为收到"
      title="拖动标记为收到"
    >
      {count}
    </span>
  );
}

function MiniCalendarPicker({
  selectedDateKey,
  viewDateKey,
  days,
  onPrevMonth,
  onNextMonth,
  onSelectDate,
}: {
  selectedDateKey: string;
  viewDateKey: string;
  days: ReturnType<typeof buildCalendarDays>;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onSelectDate: (dateKey: string) => void;
}) {
  return (
    <div className="rounded-[12px] border border-border bg-bg px-3 pb-3 pt-2">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onPrevMonth}
          className="h-8 w-8 rounded-full bg-surface text-sm text-text-muted transition active:scale-[0.96]"
          aria-label="上个月"
        >
          ‹
        </button>
        <span className="text-sm font-semibold text-text">{formatMonthLabel(viewDateKey)}</span>
        <button
          type="button"
          onClick={onNextMonth}
          className="h-8 w-8 rounded-full bg-surface text-sm text-text-muted transition active:scale-[0.96]"
          aria-label="下个月"
        >
          ›
        </button>
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1 text-center text-[10px] leading-4 text-text-tertiary">
        {weekLabels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {days.map((day) => (
          <button
            key={day.dateKey}
            type="button"
            onClick={() => onSelectDate(day.dateKey)}
            className={cn(
              "h-8 rounded-[8px] text-xs transition active:scale-[0.96]",
              selectedDateKey === day.dateKey
                ? "bg-primary text-on-primary"
                : day.inCurrentMonth
                  ? "bg-surface text-text"
                  : "bg-surface/60 text-text-disabled"
            )}
          >
            {day.dayNumber}
          </button>
        ))}
      </div>
    </div>
  );
}

function GeneratedArrangementMenu({
  items,
  onClose,
  onAcknowledge,
  onDelete,
  onAcceptItem,
  onDeleteItem,
}: {
  items: ArrangementItem[];
  onClose: () => void;
  onAcknowledge: () => void;
  onDelete: () => void;
  onAcceptItem: (item: ArrangementItem) => void;
  onDeleteItem: (item: ArrangementItem) => void;
}) {
  const [deleteTarget, setDeleteTarget] = React.useState<ArrangementItem | null>(null);
  const highConfidenceItems = items.filter((item) => item.confidence === "high");

  return (
    <div className="absolute inset-0 z-50 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-overlay-light"
        onClick={onClose}
        aria-label="关闭新增安排"
      />
      <aside className="relative h-full w-[78%] max-w-[300px] bg-surface px-3 pb-4 pt-5 shadow-[-10px_0_30px_rgba(15,23,42,0.12)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold leading-6 text-text">新增安排</h2>
            <p className="mt-0.5 text-xs leading-4 text-text-tertiary">
              自动识别后等待你确认
            </p>
          </div>
        </div>

        <div className="mt-4 max-h-[70%] space-y-2 overflow-y-auto">
          {items.length > 0 ? (
            items.map((item) => {
              const urgencyConfig = getUrgencyConfig(item.urgency);
              const lowConfidence = item.confidence !== "high";
              return (
                <div key={item.id} className="rounded-[10px] border border-border bg-bg px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className={cn("h-2.5 w-2.5 rounded-full", urgencyConfig.dotClass)} />
                    <p className="min-w-0 flex-1 truncate text-sm font-semibold text-text">
                      {item.title}
                    </p>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(item)}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-text-tertiary transition active:scale-[0.96]"
                      aria-label="删除该新增事务"
                    >
                      ×
                    </button>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-text-muted">{item.summary}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <ArrangementTag label={item.timeText} strong />
                    <ArrangementTag label={urgencyConfig.label} tone={item.urgency} />
                    <ArrangementTag label={lowConfidence ? "低置信待接受" : "高置信"} />
                  </div>
                  {lowConfidence && (
                    <button
                      type="button"
                      onClick={() => onAcceptItem(item)}
                      className="mt-2 h-9 w-full rounded-[9px] bg-primary text-xs font-semibold text-on-primary transition active:scale-[0.98]"
                    >
                      接受
                    </button>
                  )}
                </div>
              );
            })
          ) : (
            <div className="rounded-[10px] bg-bg px-3 py-8 text-center">
              <p className="text-sm font-semibold text-text">没有新的自动安排</p>
              <p className="mt-1 text-xs leading-5 text-text-tertiary">
                开启自动生成后，对话里的事务会在这里等待确认。
              </p>
            </div>
          )}
        </div>

        <div className="absolute bottom-4 left-3 right-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onAcknowledge}
            disabled={highConfidenceItems.length === 0}
            className="h-11 rounded-[10px] bg-primary text-sm font-semibold text-on-primary transition active:scale-[0.98]"
          >
            收到
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="h-11 rounded-[10px] border border-border bg-bg text-sm font-semibold text-text-muted transition active:scale-[0.98]"
          >
            删除
          </button>
        </div>
      </aside>
      {deleteTarget && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center px-6">
          <button
            type="button"
            className="absolute inset-0 bg-overlay-light"
            onClick={() => setDeleteTarget(null)}
            aria-label="取消删除"
          />
          <div className="relative w-full max-w-[280px] rounded-[14px] bg-surface px-4 py-4 shadow-[0_12px_36px_rgba(15,23,42,0.18)]">
            <h3 className="text-base font-semibold leading-6 text-text">删除该事务？</h3>
            <p className="mt-1 text-xs leading-5 text-text-tertiary">
              删除后，这条自动生成事务不会进入安排列表。
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="h-10 rounded-[10px] border border-border bg-bg text-sm font-semibold text-text-muted transition active:scale-[0.98]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteItem(deleteTarget);
                  setDeleteTarget(null);
                }}
                className="h-10 rounded-[10px] bg-[#D9362B] text-sm font-semibold text-white transition active:scale-[0.98]"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ArrangementDetailEditor({
  item,
  onClose,
  onSave,
}: {
  item: ArrangementItem;
  onClose: () => void;
  onSave: (patch: StoredArrangementPreference) => void;
}) {
  const [title, setTitle] = React.useState(item.title);
  const [dateKey, setDateKey] = React.useState(item.dateKey);
  const [pickerViewDateKey, setPickerViewDateKey] = React.useState(item.dateKey);
  const [showDatePicker, setShowDatePicker] = React.useState(false);
  const [hourInput, setHourInput] = React.useState(
    typeof item.hour === "number" ? String(item.hour).padStart(2, "0") : ""
  );
  const [minuteInput, setMinuteInput] = React.useState(
    typeof item.minute === "number" ? String(item.minute).padStart(2, "0") : ""
  );
  const [urgency, setUrgency] = React.useState<ArrangementItem["urgency"]>(item.urgency);
  const [reminder, setReminder] = React.useState<ArrangementItem["reminder"]>(item.reminder);
  const [peopleText, setPeopleText] = React.useState(item.people.join("、"));
  const pickerDays = React.useMemo(() => buildCalendarDays(pickerViewDateKey), [pickerViewDateKey]);
  const hasHour = hourInput.trim() !== "";
  const hasMinute = minuteInput.trim() !== "";
  const hour = hasHour ? Number(hourInput) : undefined;
  const minute = hasMinute ? Number(minuteInput) : undefined;
  const timeInvalid =
    hasHour !== hasMinute ||
    (typeof hour === "number" && (!Number.isInteger(hour) || hour < 0 || hour > 23)) ||
    (typeof minute === "number" && (!Number.isInteger(minute) || minute < 0 || minute > 59));

  const handleNumericInput =
    (setter: (value: string) => void, maxLength: number) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setter(event.target.value.replace(/\D/g, "").slice(0, maxLength));
    };

  const save = () => {
    const nextTitle = title.trim();
    if (!nextTitle || timeInvalid) return;
    const people = peopleText
      .split(/[、,\s]+/)
      .map((value) => value.trim())
      .filter(Boolean);

    onSave({
      id: item.id,
      title: nextTitle,
      dateKey,
      urgency,
      reminder,
      people,
      clearTime: !hasHour && !hasMinute,
      hour: hasHour && typeof hour === "number" ? hour : undefined,
      minute: hasMinute && typeof minute === "number" ? minute : undefined,
    });
  };

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-bg">
      <header className="flex h-14 shrink-0 items-center border-b border-border-light bg-bg px-2">
        <button
          type="button"
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-full text-text-muted transition active:scale-[0.96]"
          aria-label="返回"
        >
          ‹
        </button>
        <h1 className="ml-1 flex-1 truncate text-[17px] font-semibold leading-5 text-text">
          编辑安排
        </h1>
        <button
          type="button"
          onClick={save}
          disabled={!title.trim() || timeInvalid}
          className="h-9 rounded-full bg-primary px-3 text-sm font-semibold text-on-primary transition disabled:opacity-50 active:scale-[0.98]"
        >
          保存
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-5 pt-3">
        <section className="rounded-[12px] bg-surface px-3 py-3">
          <label className="text-xs font-semibold leading-4 text-text-tertiary">标题</label>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="mt-2 h-10 w-full rounded-[10px] border border-border bg-bg px-3 text-sm text-text outline-none transition focus:border-primary"
          />
        </section>

        <section className="mt-3 rounded-[12px] bg-surface px-3 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[15px] font-semibold leading-5 text-text">日期与时间</h2>
              <p className="mt-0.5 text-xs leading-4 text-text-tertiary">
                时间留空时按 06:00 安排好友消息提醒
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setPickerViewDateKey(dateKey);
                setShowDatePicker((value) => !value);
              }}
              className="h-9 rounded-[9px] bg-primary-soft px-3 text-xs font-semibold text-primary transition active:scale-[0.98]"
            >
              {dateKey}
            </button>
          </div>
          {showDatePicker && (
            <div className="mt-3">
              <MiniCalendarPicker
                selectedDateKey={dateKey}
                viewDateKey={pickerViewDateKey}
                days={pickerDays}
                onPrevMonth={() => setPickerViewDateKey((value) => addMonths(value, -1))}
                onNextMonth={() => setPickerViewDateKey((value) => addMonths(value, 1))}
                onSelectDate={(nextDateKey) => {
                  setDateKey(nextDateKey);
                  setPickerViewDateKey(nextDateKey);
                  setShowDatePicker(false);
                }}
              />
            </div>
          )}
          <div className="mt-3 grid grid-cols-[1fr_1fr_auto] gap-2">
            <input
              value={hourInput}
              onChange={handleNumericInput(setHourInput, 2)}
              inputMode="numeric"
              className={cn(
                "h-10 rounded-[10px] border bg-bg px-3 text-center text-sm text-text outline-none transition focus:border-primary",
                timeInvalid ? "border-[#D9362B]" : "border-border"
              )}
              placeholder="时"
            />
            <input
              value={minuteInput}
              onChange={handleNumericInput(setMinuteInput, 2)}
              inputMode="numeric"
              className={cn(
                "h-10 rounded-[10px] border bg-bg px-3 text-center text-sm text-text outline-none transition focus:border-primary",
                timeInvalid ? "border-[#D9362B]" : "border-border"
              )}
              placeholder="分"
            />
            <button
              type="button"
              onClick={() => {
                setHourInput("");
                setMinuteInput("");
              }}
              className="h-10 rounded-[10px] border border-border bg-bg px-3 text-xs font-medium text-text-muted transition active:scale-[0.98]"
            >
              清空
            </button>
          </div>
          {timeInvalid && (
            <p className="mt-2 text-[11px] leading-4 text-[#D9362B]">
              请输入 00:00-23:59 内的有效时间，或两个时间框都留空。
            </p>
          )}
        </section>

        <section className="mt-3 rounded-[12px] bg-surface px-3 py-3">
          <h2 className="text-[15px] font-semibold leading-5 text-text">紧急程度</h2>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {urgencyOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setUrgency(option.value)}
                className={cn(
                  "h-10 rounded-[10px] border text-xs font-semibold transition active:scale-[0.98]",
                  urgency === option.value
                    ? "border-primary bg-primary-soft text-primary"
                    : "border-border bg-bg text-text-muted"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </section>

        <section className="mt-3 rounded-[12px] bg-surface px-3 py-3">
          <h2 className="text-[15px] font-semibold leading-5 text-text">提醒方式</h2>
          <div className="mt-3 space-y-2">
            {reminderOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setReminder(option.value)}
                className={cn(
                  "flex h-10 w-full items-center justify-between rounded-[10px] border px-3 text-sm transition active:scale-[0.99]",
                  reminder === option.value
                    ? "border-primary bg-primary-soft text-primary"
                    : "border-border bg-bg text-text-muted"
                )}
              >
                <span>{option.label}</span>
                {reminder === option.value && <span className="text-xs font-semibold">已选</span>}
              </button>
            ))}
          </div>
        </section>

        <section className="mt-3 rounded-[12px] bg-surface px-3 py-3">
          <label className="text-xs font-semibold leading-4 text-text-tertiary">关联对象</label>
          <input
            value={peopleText}
            onChange={(event) => setPeopleText(event.target.value)}
            className="mt-2 h-10 w-full rounded-[10px] border border-border bg-bg px-3 text-sm text-text outline-none transition focus:border-primary"
            placeholder="例如：爸爸、同事、小李"
          />
        </section>
      </div>
    </div>
  );
}

function ArrangementTag({
  label,
  strong,
  tone,
}: {
  label: string;
  strong?: boolean;
  tone?: ArrangementItem["urgency"];
}) {
  const toneClass =
    tone === "red"
      ? "bg-[#FFE9E7] text-[#D9362B]"
      : tone === "orange"
        ? "bg-[#FFF3DE] text-[#C46B00]"
        : tone === "green"
          ? "bg-primary-soft text-primary"
          : "";
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] leading-4",
        toneClass || (strong ? "bg-primary-soft text-primary" : "bg-bg text-text-tertiary")
      )}
    >
      {label}
    </span>
  );
}

function ActionButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-8 rounded-[9px] border border-border bg-bg px-2.5 text-xs font-medium text-text-muted transition active:scale-[0.98]"
    >
      {children}
    </button>
  );
}

function getReminderLabel(reminder: ArrangementItem["reminder"]) {
  if (reminder === "off") return "不再提醒";
  if (reminder === "todayOff") return "今天不提醒";
  return "提醒中";
}

function getUrgencyConfig(urgency: ArrangementItem["urgency"]) {
  if (urgency === "red") {
    return {
      label: "消息+震动+电话",
      badgeClass: "bg-[#FFE9E7] text-[#D9362B]",
      dotClass: "bg-[#D9362B]",
    };
  }
  if (urgency === "orange") {
    return {
      label: "消息+震动",
      badgeClass: "bg-[#FFF3DE] text-[#C46B00]",
      dotClass: "bg-[#F59E0B]",
    };
  }
  return {
    label: "安排消息",
    badgeClass: "bg-primary-soft text-primary",
    dotClass: "bg-primary",
  };
}

function getExecutionLabel(level: ArrangementItem["executionLevel"]) {
  if (level === "aiComplete") return "AI可完成";
  if (level === "aiAssist") return "AI可辅助";
  return "需自己完成";
}
