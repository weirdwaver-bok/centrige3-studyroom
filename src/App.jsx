import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Building2,
  Lock,
  User,
  Phone,
  AlertTriangle,
  Home,
  X,
  Check,
  ArrowLeft,
  Loader2,
  CalendarDays,
  Users,
} from "lucide-react";
import { supabase } from "./supabaseClient";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const COMPLEX_NAME = "번영로센트리지 3단지";
const HERO_USE_PHOTO = false; // true로 바꾸고 public/hero.jpg를 넣으면 사진이 배경으로 나와요

// ── 스터디룸 예약 관련 설정 ──
const STUDYROOM_ROOMS = [1, 2];
const STUDYROOM_SLOTS = [
  { id: "slot1", label: "1타임", time: "10:00 ~ 13:00", start: 10, end: 13 },
  { id: "slot2", label: "2타임", time: "14:00 ~ 16:00", start: 14, end: 16 },
  { id: "slot3", label: "3타임", time: "17:00 ~ 20:00", start: 17, end: 20 },
];
const CLEANING_WEEKDAY = 2; // 0=일, 1=월, 2=화 ...
const CLEANING_START_HOUR = 12;
const CLEANING_END_HOUR = 16;
const MIN_GUESTS = 4;
const STUDYROOM_NOTICES = [
  {
    title: "이용 시 준수사항",
    lines: [
      "음주, 흡연, 음식물 섭취 및 반입을 금지합니다. (개인 텀블러만 허용)",
      "이용 시간을 준수해 주시고, 퇴실 후에는 키를 반납해 주셔야 합니다.",
      "다음 이용자분을 위하여 퇴실 시 정리정돈을 꼭 부탁드립니다.",
      "시설물·비품 파손·훼손 시 원상복구 및 변상하셔야 합니다.",
      "심한 소음을 유발하는 행위는 삼가 주시기 바랍니다.",
    ],
  },
];

function pad2(n) {
  return String(n).padStart(2, "0");
}
function fmt(y, m, d) {
  return `${y}-${pad2(m + 1)}-${pad2(d)}`;
}
function parseDate(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function addDays(str, n) {
  const dt = parseDate(str);
  dt.setDate(dt.getDate() + n);
  return fmt(dt.getFullYear(), dt.getMonth(), dt.getDate());
}
function diffDays(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / 86400000);
}
function displayDate(str) {
  return parseDate(str).toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}
function todayStr() {
  const t = new Date();
  return fmt(t.getFullYear(), t.getMonth(), t.getDate());
}

// DB(snake_case) <-> 앱 내부(camelCase) 변환
function fromDbRowStudyroom(row) {
  return {
    id: row.id,
    date: row.booking_date,
    room: row.room,
    slot: row.slot,
    name: row.name,
    unit: row.unit,
    phone: row.phone,
    guests: row.guests,
    status: row.status,
    createdAt: row.created_at,
  };
}

function slotInfo(slotId) {
  return STUDYROOM_SLOTS.find((s) => s.id === slotId);
}

function isSlotBlockedByCleaning(dateStr, slotId) {
  const dt = parseDate(dateStr);
  if (dt.getDay() !== CLEANING_WEEKDAY) return false;
  const slot = slotInfo(slotId);
  return slot.start < CLEANING_END_HOUR && slot.end > CLEANING_START_HOUR;
}

export default function App() {
  const [toast, setToast] = useState(null);

  const [view, setView] = useState("calendar");
  const [session, setSession] = useState(null);
  const [adminModal, setAdminModal] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  const [srBookings, setSrBookings] = useState([]);
  const [srLoaded, setSrLoaded] = useState(false);
  const [srLoadError, setSrLoadError] = useState(false);
  const [srCursor, setSrCursor] = useState(() => {
    const t = new Date();
    return { y: t.getFullYear(), m: t.getMonth() };
  });
  const [srDayModalDate, setSrDayModalDate] = useState(null); // 클릭한 날짜 (yyyy-mm-dd)
  const [srPendingPick, setSrPendingPick] = useState(null); // { date, room, slot }
  const [srNoticeOpen, setSrNoticeOpen] = useState(false);
  const [srAgreed, setSrAgreed] = useState(false);
  const [srFormOpen, setSrFormOpen] = useState(false);
  const [srForm, setSrForm] = useState({ name: "", unit: "", phone: "", guests: MIN_GUESTS });
  const [srSubmitting, setSrSubmitting] = useState(false);
  const [srTab, setSrTab] = useState("pending");
  const [srMyBookingModal, setSrMyBookingModal] = useState(false);
  const [srMyPhoneInput, setSrMyPhoneInput] = useState("");
  const [srMyBookings, setSrMyBookings] = useState(null);
  const [srMyBookingsLoading, setSrMyBookingsLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (!s) setView("calendar");
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const loadSrBookings = useCallback(async () => {
    const { data, error } = await supabase
      .from("studyroom_bookings")
      .select("*")
      .order("booking_date", { ascending: true });
    if (error) {
      setSrLoadError(true);
      return;
    }
    setSrLoadError(false);
    setSrBookings((data || []).map(fromDbRowStudyroom));
  }, []);

  useEffect(() => {
    (async () => {
      await loadSrBookings();
      setSrLoaded(true);
    })();
  }, [loadSrBookings]);

  const showToast = useCallback((msg, kind = "ok") => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 3200);
  }, []);

  // ── 스터디룸 관련 함수 ──
  const srStatusMap = useMemo(() => {
    const map = {};
    for (const b of srBookings) {
      if (b.status !== "pending" && b.status !== "approved") continue;
      map[`${b.date}_${b.room}_${b.slot}`] = b.status;
    }
    return map;
  }, [srBookings]);

  function srSlotStatus(dateStr, room, slotId) {
    if (isSlotBlockedByCleaning(dateStr, slotId)) return "cleaning";
    return srStatusMap[`${dateStr}_${room}_${slotId}`] || null; // null = 예약 가능
  }

  function pickSrSlot(dateStr, room, slotId) {
    if (dateStr < todayStr()) return;
    if (srSlotStatus(dateStr, room, slotId)) return;
    setSrPendingPick({ date: dateStr, room, slot: slotId });
    setSrDayModalDate(null);
    setSrNoticeOpen(true);
  }

  async function submitSrBooking(e) {
    e.preventDefault();
    if (!srForm.name.trim() || !srForm.unit.trim() || !srForm.phone.trim()) {
      showToast("이름, 동/호수, 연락처를 입력해 주세요.", "error");
      return;
    }
    if (Number(srForm.guests) < MIN_GUESTS) {
      showToast(`인원은 최소 ${MIN_GUESTS}명부터 예약할 수 있어요.`, "error");
      return;
    }
    setSrSubmitting(true);
    const { error } = await supabase.from("studyroom_bookings").insert([
      {
        booking_date: srPendingPick.date,
        room: srPendingPick.room,
        slot: srPendingPick.slot,
        name: srForm.name.trim(),
        unit: srForm.unit.trim(),
        phone: srForm.phone.trim(),
        guests: Number(srForm.guests),
        status: "pending",
      },
    ]);
    setSrSubmitting(false);
    if (error) {
      showToast("예약 신청에 실패했어요. 다시 시도해 주세요.", "error");
      return;
    }
    await loadSrBookings();
    setSrFormOpen(false);
    setSrAgreed(false);
    setSrPendingPick(null);
    setSrForm({ name: "", unit: "", phone: "", guests: MIN_GUESTS });
    showToast("예약 신청이 접수됐어요. 관리사무소 승인 후 확정돼요.", "ok");
  }

  async function setSrStatus(id, status) {
    const { error } = await supabase.from("studyroom_bookings").update({ status }).eq("id", id);
    if (error) {
      showToast("처리에 실패했어요. 다시 시도해 주세요.", "error");
      return;
    }
    await loadSrBookings();
    const msg =
      status === "approved" ? "예약을 승인했어요." : status === "cancelled" ? "예약을 취소했어요." : "예약을 거절했어요.";
    showToast(msg, "ok");
  }

  async function deleteSrBooking(id) {
    if (!window.confirm("이 예약 기록을 완전히 삭제하시겠어요? 삭제하면 되돌릴 수 없어요.")) return;
    const { error } = await supabase.from("studyroom_bookings").delete().eq("id", id);
    if (error) {
      showToast("삭제에 실패했어요. 다시 시도해 주세요.", "error");
      return;
    }
    await loadSrBookings();
    showToast("예약 기록을 삭제했어요.", "ok");
  }

  async function searchMySrBookings() {
    if (!srMyPhoneInput.trim()) {
      showToast("연락처를 입력해 주세요.", "error");
      return;
    }
    setSrMyBookingsLoading(true);
    const { data, error } = await supabase
      .from("studyroom_bookings")
      .select("*")
      .eq("phone", srMyPhoneInput.trim())
      .in("status", ["pending", "approved"])
      .order("booking_date", { ascending: true });
    setSrMyBookingsLoading(false);
    if (error) {
      showToast("조회에 실패했어요. 다시 시도해 주세요.", "error");
      return;
    }
    setSrMyBookings((data || []).map(fromDbRowStudyroom));
  }

  async function cancelMySrBooking(id) {
    if (!window.confirm("이 예약을 취소하시겠어요?")) return;
    const { data, error } = await supabase.rpc("cancel_my_studyroom_booking", {
      p_id: id,
      p_phone: srMyPhoneInput.trim(),
    });
    if (error || !data) {
      showToast("취소에 실패했어요. 연락처를 다시 확인해 주세요.", "error");
      return;
    }
    showToast("예약이 취소됐어요.", "ok");
    await searchMySrBookings();
    await loadSrBookings();
  }

  async function tryAdminLogin() {
    setPwError("");
    setLoggingIn(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: emailInput.trim(),
      password: pwInput,
    });
    setLoggingIn(false);
    if (error) {
      setPwError("이메일 또는 비밀번호가 맞지 않아요.");
      return;
    }
    setView("admin");
    setAdminModal(false);
    setEmailInput("");
    setPwInput("");
  }

  async function adminLogout() {
    await supabase.auth.signOut();
    setView("calendar");
  }

  const srGrid = useMemo(() => {
    const { y, m } = srCursor;
    const firstWeekday = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(fmt(y, m, d));
    return cells;
  }, [srCursor]);

  const srPendingCount = srBookings.filter((b) => b.status === "pending").length;
  const srApprovedCount = srBookings.filter((b) => b.status === "approved").length;
  const srRejectedCount = srBookings.filter((b) => b.status === "rejected").length;
  const srCancelledCount = srBookings.filter((b) => b.status === "cancelled").length;
  const srFilteredBookings = srBookings
    .filter((b) => b.status === srTab)
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  return (
    <div className="cg-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nanum+Myeongjo:wght@700;800&family=Noto+Sans+KR:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');

        .cg-root {
          --navy: #1b2438;
          --navy-light: #2a3550;
          --slate: #4c5870;
          --slate-soft: #7c869a;
          --gold: #b98d4b;
          --gold-dark: #93702f;
          --bg: #f2f3f6;
          --bg-deep: #e6e8ee;
          --card: #ffffff;
          --ink: #1e222c;
          --amber-wash: #fbf0da;
          --amber-line: #c9a227;

          font-family: 'Noto Sans KR', sans-serif;
          background: var(--bg);
          color: var(--ink);
          min-height: 100vh;
        }
        @media (min-width: 640px) {
          .cg-root {
            max-width: 480px;
            margin: 32px auto;
            border-radius: 20px;
            overflow: hidden;
            box-shadow: 0 24px 60px rgba(27,36,56,0.16);
            min-height: auto;
          }
        }
        .cg-root * { box-sizing: border-box; }
        .cg-root button { font-family: inherit; cursor: pointer; }
        .cg-root button:disabled { cursor: not-allowed; }
        .cg-root button:focus-visible,
        .cg-root input:focus-visible,
        .cg-root textarea:focus-visible {
          outline: 2px solid var(--gold);
          outline-offset: 2px;
        }
        @media (prefers-reduced-motion: reduce) {
          .cg-root * { transition: none !important; animation: none !important; }
        }

        .cg-mono { font-family: 'IBM Plex Mono', monospace; }
        .cg-display { font-family: 'Nanum Myeongjo', serif; }

        .cg-hero {
          position: relative;
          background: linear-gradient(160deg, var(--navy) 0%, var(--navy-light) 100%);
          padding: 28px 24px 32px;
          overflow: hidden;
        }
        .cg-hero-photo {
          background-image: url('/hero.jpg'), linear-gradient(160deg, var(--navy) 0%, var(--navy-light) 100%);
          background-size: cover;
          background-position: center;
        }
        .cg-hero-photo::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, rgba(27,36,56,0.55) 0%, rgba(27,36,56,0.75) 100%);
          z-index: 0;
        }
        .cg-hero-top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          position: relative;
          z-index: 2;
          gap: 12px;
        }
        .cg-brand-row {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .cg-seal {
          flex-shrink: 0;
          width: 46px;
          height: 46px;
          border-radius: 50%;
          border: 1.5px solid var(--gold);
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
        }
        .cg-seal::before {
          content: '';
          position: absolute;
          inset: 4px;
          border: 1px solid rgba(185,141,75,0.5);
          border-radius: 50%;
        }
        .cg-seal-mark {
          font-family: 'Nanum Myeongjo', serif;
          font-weight: 800;
          font-size: 15px;
          color: var(--gold);
          letter-spacing: 0.02em;
        }
        .cg-eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: var(--gold);
          font-size: 11.5px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          margin-bottom: 6px;
          opacity: 0.95;
        }
        .cg-title {
          font-size: 26px;
          color: #f5f4f0;
          margin: 0 0 4px;
          line-height: 1.25;
          font-weight: 800;
        }
        .cg-tagline {
          color: #b7bccb;
          font-size: 13px;
          margin: 0;
          max-width: 280px;
          line-height: 1.6;
        }
        .cg-admin-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(185,141,75,0.45);
          color: #f0ead9;
          padding: 8px 13px;
          border-radius: 100px;
          font-size: 12.5px;
          font-weight: 500;
          white-space: nowrap;
          transition: background 0.15s;
          flex-shrink: 0;
        }
        .cg-admin-btn:hover { background: rgba(255,255,255,0.16); }

        .cg-hero-scene {
          position: absolute;
          left: 0; right: 0; bottom: 0;
          height: 84px;
          z-index: 1;
        }

        .cg-body { padding: 22px 20px 40px; max-width: 480px; margin: 0 auto; }

        .cg-window-banner {
          display: flex;
          align-items: center;
          gap: 8px;
          background: var(--amber-wash);
          border: 1px solid var(--amber-line);
          color: var(--gold-dark);
          font-size: 12.5px;
          font-weight: 500;
          border-radius: 10px;
          padding: 11px 13px;
          max-width: 420px;
          margin: 14px auto 0;
          line-height: 1.5;
        }
        .cg-window-banner-info {
          background: #eef1f5;
          border-color: var(--bg-deep);
          color: var(--slate);
          font-weight: 600;
        }
        .cg-calendar-disabled { opacity: 0.5; }
        .cg-window-banner svg { flex-shrink: 0; }

        .cg-month-nav {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin: 0 auto 16px;
          max-width: 420px;
          background: var(--card);
          border: 1px solid var(--bg-deep);
          border-radius: 14px;
          padding: 10px 12px;
          position: relative;
          z-index: 3;
          box-shadow: 0 6px 16px rgba(27,36,56,0.08);
        }
        .cg-nav-btn {
          background: var(--bg);
          border: 1px solid var(--bg-deep);
          border-radius: 8px;
          width: 32px; height: 32px;
          display: flex; align-items: center; justify-content: center;
          color: var(--navy);
        }
        .cg-nav-btn:hover { background: var(--bg-deep); }
        .cg-month-label {
          font-family: 'Nanum Myeongjo', serif;
          font-weight: 700;
          font-size: 16.5px;
          color: var(--ink);
        }

        .cg-calendar-card {
          max-width: 420px;
          margin: 0 auto;
          background: var(--card);
          border: 1px solid var(--bg-deep);
          border-radius: 16px;
          padding: 16px;
        }
        .cg-weekdays {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          margin-bottom: 6px;
        }
        .cg-weekdays span {
          text-align: center;
          font-size: 11.5px;
          color: var(--slate-soft);
          font-weight: 600;
        }
        .cg-days {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 4px;
        }
        .cg-day {
          position: relative;
          aspect-ratio: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 10px;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 13px;
          font-weight: 500;
          background: transparent;
          border: 1px solid transparent;
          color: var(--ink);
          transition: background 0.12s, color 0.12s, border-color 0.12s;
        }
        .cg-day.empty { visibility: hidden; }
        .cg-day.past { color: #c9cdd6; cursor: default; }
        .cg-day.available:hover { background: var(--bg); border-color: var(--bg-deep); }
        .cg-day.blocked-approved {
          background: repeating-linear-gradient(135deg, var(--slate), var(--slate) 4px, #5c6884 4px, #5c6884 8px);
          color: #eef0f5;
          cursor: not-allowed;
        }
        .cg-day.blocked-pending {
          background: var(--amber-wash);
          color: var(--gold-dark);
          border: 1px dashed var(--amber-line);
          cursor: not-allowed;
        }
        .cg-day.in-range { background: rgba(185,141,75,0.14); color: var(--gold-dark); }
        .cg-day-selectable { cursor: pointer !important; box-shadow: inset 0 0 0 1.5px var(--navy); }
        .cg-day-selectable:hover { filter: brightness(0.96); }
        .cg-day.range-start, .cg-day.range-end {
          background: var(--navy);
          color: #f5f4f0;
          font-weight: 600;
        }
        .cg-day.range-start::after, .cg-day.range-end::after {
          content: '';
          position: absolute;
          inset: -3px;
          border: 1.5px solid var(--gold);
          border-radius: 12px;
        }
        .cg-day.today:not(.range-start):not(.range-end) { box-shadow: inset 0 0 0 1.5px var(--gold); }

        .cg-legend {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          max-width: 420px;
          margin: 14px auto 0;
          font-size: 12px;
          color: var(--slate-soft);
        }
        .cg-legend-item { display: flex; align-items: center; gap: 5px; }
        .cg-dot { width: 10px; height: 10px; border-radius: 3px; }

        .cg-selbar {
          max-width: 420px;
          margin: 18px auto 0;
          background: var(--navy);
          border-radius: 14px;
          padding: 16px 18px;
          color: #f5f4f0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .cg-selbar-dates { font-size: 13px; }
        .cg-selbar-dates .cg-nights {
          font-family: 'Nanum Myeongjo', serif;
          font-size: 16.5px;
          font-weight: 700;
          display: block;
          margin-top: 2px;
        }
        .cg-cta {
          background: var(--gold);
          color: var(--navy);
          border: none;
          padding: 10px 16px;
          border-radius: 10px;
          font-weight: 700;
          font-size: 13.5px;
          white-space: nowrap;
        }
        .cg-cta:hover { background: #c99e5f; }
        .cg-clear-link {
          background: none;
          border: none;
          color: #a7adbe;
          font-size: 12px;
          text-decoration: underline;
          padding: 0;
          margin-top: 6px;
        }
        .cg-mybooking-link {
          display: block;
          margin: 22px auto 0;
          background: none;
          border: none;
          color: var(--slate);
          font-size: 12.5px;
          font-weight: 600;
          text-decoration: underline;
          text-align: center;
        }
        .cg-mybooking-link:hover { color: var(--navy); }

        .cg-apptabs {
          display: flex;
          gap: 8px;
          padding: 14px 20px 18px;
          max-width: 480px;
          margin: 0 auto;
        }
        .cg-apptab {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          background: var(--card);
          border: 1px solid var(--bg-deep);
          border-radius: 10px;
          padding: 10px;
          font-size: 13px;
          font-weight: 600;
          color: var(--slate-soft);
        }
        .cg-apptab.active {
          background: var(--navy);
          border-color: var(--navy);
          color: #f5f4f0;
        }
        .cg-apptab:hover:not(.active) { background: var(--bg); }

        .cg-room-block { margin-bottom: 16px; }
        .cg-room-block:last-child { margin-bottom: 0; }
        .cg-room-title {
          font-family: 'Nanum Myeongjo', serif;
          font-weight: 700;
          font-size: 14.5px;
          color: var(--navy);
          margin-bottom: 8px;
        }
        .cg-slot-list { display: flex; flex-direction: column; gap: 7px; }
        .cg-slot-btn {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: var(--bg);
          border: 1px solid var(--bg-deep);
          border-radius: 10px;
          padding: 11px 13px;
          font-size: 13px;
          font-weight: 600;
          color: var(--ink);
        }
        .cg-slot-btn:hover:not(:disabled) { background: var(--bg-deep); }
        .cg-slot-btn:disabled { cursor: not-allowed; }
        .cg-slot-btn.blocked {
          background: var(--amber-wash);
          border-color: var(--amber-line);
          color: var(--gold-dark);
        }
        .cg-slot-btn-status { font-size: 11.5px; font-weight: 700; opacity: 0.75; }

        .cg-overlay {
          position: fixed;
          inset: 0;
          background: rgba(27,36,56,0.5);
          display: flex;
          align-items: flex-end;
          justify-content: center;
          z-index: 50;
        }
        @media (min-width: 480px) {
          .cg-overlay { align-items: center; padding: 20px; }
        }
        .cg-modal {
          background: var(--card);
          width: 100%;
          max-width: 420px;
          border-radius: 20px 20px 0 0;
          padding: 22px 20px 26px;
          max-height: 88vh;
          overflow-y: auto;
        }
        @media (min-width: 480px) {
          .cg-modal { border-radius: 18px; }
        }
        .cg-modal-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 14px;
        }
        .cg-modal-title {
          font-family: 'Nanum Myeongjo', serif;
          font-size: 18px;
          font-weight: 700;
          margin: 0 0 4px;
        }
        .cg-modal-sub { font-size: 12.5px; color: var(--slate-soft); margin: 0; }
        .cg-close-btn {
          background: var(--bg);
          border: none;
          border-radius: 8px;
          width: 30px; height: 30px;
          display: flex; align-items: center; justify-content: center;
          color: var(--ink);
          flex-shrink: 0;
        }
        .cg-field { margin-bottom: 13px; }
        .cg-field-row { display: flex; gap: 10px; }
        .cg-field-row .cg-field { flex: 1; }
        .cg-field label {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 12.5px;
          font-weight: 600;
          color: var(--slate);
          margin-bottom: 5px;
        }
        .cg-field input, .cg-field textarea {
          width: 100%;
          border: 1px solid var(--bg-deep);
          background: var(--bg);
          border-radius: 10px;
          padding: 10px 12px;
          font-size: 14px;
          font-family: inherit;
          color: var(--ink);
        }
        .cg-field textarea { resize: vertical; min-height: 60px; }
        .cg-account-box {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          background: var(--amber-wash);
          border: 1px solid var(--amber-line);
          border-radius: 10px;
          padding: 12px 13px;
          margin-bottom: 14px;
          color: var(--gold-dark);
        }
        .cg-account-label { font-size: 11.5px; font-weight: 600; margin-bottom: 3px; opacity: 0.85; }
        .cg-account-value { font-size: 14px; font-weight: 600; color: var(--ink); }
        .cg-submit-btn {
          width: 100%;
          background: var(--gold);
          color: var(--navy);
          border: none;
          padding: 12px;
          border-radius: 10px;
          font-weight: 700;
          font-size: 14.5px;
          display: flex; align-items: center; justify-content: center; gap: 6px;
          margin-top: 4px;
        }
        .cg-submit-btn:hover { background: #c99e5f; }
        .cg-submit-btn:disabled { opacity: 0.6; }

        .cg-admin-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 16px;
        }
        .cg-logout-btn {
          margin-left: auto;
          background: var(--card);
          border: 1px solid var(--bg-deep);
          border-radius: 100px;
          padding: 7px 13px;
          font-size: 12px;
          font-weight: 600;
          color: var(--slate);
        }
        .cg-logout-btn:hover { background: var(--bg); }
        .cg-back-btn {
          background: var(--card);
          border: 1px solid var(--bg-deep);
          border-radius: 9px;
          width: 34px; height: 34px;
          display: flex; align-items: center; justify-content: center;
          color: var(--navy);
        }
        .cg-admin-title {
          font-family: 'Nanum Myeongjo', serif;
          font-size: 18px;
          font-weight: 700;
          margin: 0;
        }
        .cg-tabs {
          display: flex;
          gap: 8px;
          margin-bottom: 16px;
          overflow-x: auto;
        }
        .cg-tab {
          background: var(--card);
          border: 1px solid var(--bg-deep);
          border-radius: 100px;
          padding: 7px 13px;
          font-size: 12.5px;
          font-weight: 600;
          color: var(--slate-soft);
          white-space: nowrap;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .cg-tab.active {
          background: var(--navy);
          border-color: var(--navy);
          color: #f5f4f0;
        }
        .cg-tab-count {
          background: rgba(0,0,0,0.06);
          border-radius: 100px;
          padding: 1px 6px;
          font-size: 11px;
        }
        .cg-tab.active .cg-tab-count { background: rgba(255,255,255,0.2); }

        .cg-booking-card {
          background: var(--card);
          border: 1px solid var(--bg-deep);
          border-radius: 14px;
          padding: 14px 15px;
          margin-bottom: 10px;
        }
        .cg-booking-dates {
          font-family: 'Nanum Myeongjo', serif;
          font-weight: 700;
          font-size: 14.5px;
          color: var(--navy);
          margin-bottom: 2px;
        }
        .cg-booking-nights { font-size: 12px; color: var(--slate-soft); margin-bottom: 10px; }
        .cg-booking-row {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          color: #3a3f4d;
          margin-bottom: 4px;
        }
        .cg-booking-row svg { flex-shrink: 0; color: var(--slate-soft); }
        .cg-booking-memo {
          font-size: 12.5px;
          color: var(--slate);
          background: var(--bg);
          border-radius: 8px;
          padding: 8px 10px;
          margin-top: 8px;
        }
        .cg-booking-actions {
          display: flex;
          gap: 8px;
          margin-top: 12px;
        }
        .cg-approve-btn, .cg-reject-btn, .cg-cancel-btn {
          flex: 1;
          border: none;
          border-radius: 9px;
          padding: 9px;
          font-size: 13px;
          font-weight: 600;
          display: flex; align-items: center; justify-content: center; gap: 5px;
        }
        .cg-approve-btn { background: var(--navy); color: #f5f4f0; }
        .cg-approve-btn:hover { background: var(--navy-light); }
        .cg-reject-btn { background: var(--bg); color: #9a4632; border: 1px solid #e3d3c4; }
        .cg-reject-btn:hover { background: #f1e2d4; }
        .cg-cancel-btn { background: var(--bg); color: var(--slate); border: 1px solid var(--bg-deep); flex: 0.7; }
        .cg-cancel-btn:hover { background: var(--bg-deep); }
        .cg-delete-link {
          display: block;
          margin: 8px 0 0 auto;
          background: none;
          border: none;
          color: #b3b8c4;
          font-size: 11.5px;
          text-decoration: underline;
          padding: 0;
        }
        .cg-delete-link:hover { color: #9a4632; }
        .cg-empty {
          text-align: center;
          padding: 40px 20px;
          color: var(--slate-soft);
          font-size: 13.5px;
        }

        .cg-pw-field {
          width: 100%;
          border: 1px solid var(--bg-deep);
          background: var(--bg);
          border-radius: 10px;
          padding: 10px 12px;
          font-size: 14px;
          margin-bottom: 6px;
        }
        .cg-pw-error { color: #a04f22; font-size: 12px; margin: 0 0 10px; }
        .cg-pw-hint { color: var(--slate-soft); font-size: 11.5px; margin: -2px 0 12px; }

        .cg-toast {
          position: fixed;
          bottom: 18px;
          left: 50%;
          transform: translateX(-50%);
          background: var(--navy);
          color: #f5f4f0;
          padding: 11px 18px;
          border-radius: 100px;
          font-size: 13px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.22);
          z-index: 60;
          max-width: 90%;
          text-align: center;
        }
        .cg-toast.error { background: #9a4632; }

        .cg-notice-body {
          max-height: 50vh;
          overflow-y: auto;
          margin-bottom: 16px;
          padding-right: 4px;
        }
        .cg-notice-section { margin-bottom: 16px; }
        .cg-notice-section:last-child { margin-bottom: 0; }
        .cg-notice-section-title {
          font-family: 'Nanum Myeongjo', serif;
          font-weight: 700;
          font-size: 14px;
          color: var(--navy);
          margin-bottom: 6px;
        }
        .cg-notice-list {
          margin: 0;
          padding: 0;
          list-style: none;
        }
        .cg-notice-list li {
          display: flex;
          gap: 8px;
          font-size: 12.5px;
          color: #3a3f4d;
          line-height: 1.55;
          margin-bottom: 8px;
        }
        .cg-notice-list li:last-child { margin-bottom: 0; }
        .cg-notice-list li::before {
          content: '·';
          color: var(--gold);
          font-weight: 800;
          flex-shrink: 0;
        }
        .cg-agree-row {
          display: flex;
          align-items: center;
          gap: 8px;
          background: var(--bg);
          border-radius: 10px;
          padding: 11px 12px;
          margin-bottom: 14px;
          cursor: pointer;
        }
        .cg-agree-row input { width: 16px; height: 16px; accent-color: var(--navy); }
        .cg-agree-row span { font-size: 13px; font-weight: 500; }

        .cg-loading, .cg-load-error {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 60px 20px;
          color: var(--slate-soft);
          font-size: 13.5px;
          text-align: center;
        }
        .cg-spin { animation: cg-spin 0.9s linear infinite; }
        @keyframes cg-spin { to { transform: rotate(360deg); } }
      `}</style>

      <div className={`cg-hero ${HERO_USE_PHOTO ? "cg-hero-photo" : ""}`}>
        <div className="cg-hero-top">
          <div className="cg-brand-row">
            <div className="cg-seal">
              <span className="cg-seal-mark">번</span>
            </div>
            <div>
              <span className="cg-eyebrow">
                <Building2 size={12} /> Study Room · 울산 중구 복산동
              </span>
              <h1 className="cg-title cg-display">{COMPLEX_NAME} 스터디룸</h1>
              <p className="cg-tagline">입주민 전용 스터디룸, 날짜와 시간대를 선택해 간편하게 예약하세요.</p>
            </div>
          </div>
          {view === "calendar" ? (
            <button
              className="cg-admin-btn"
              onClick={() => (session ? setView("admin") : setAdminModal(true))}
            >
              <Lock size={13} /> 관리사무소
            </button>
          ) : null}
        </div>
      </div>

      {!srLoaded ? (
        <div className="cg-loading">
          <Loader2 size={16} className="cg-spin" /> 예약 정보를 불러오는 중이에요
        </div>
      ) : srLoadError ? (
        <div className="cg-load-error">
          예약 정보를 불러오지 못했어요. Supabase 연결(studyroom_bookings 테이블)을 확인해 주세요.
        </div>
      ) : view === "calendar" ? (
        <div className="cg-body">
          <div className="cg-month-nav">
            <button
              className="cg-nav-btn"
              onClick={() =>
                setSrCursor((c) => (c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 }))
              }
              aria-label="이전 달"
            >
              <ChevronLeft size={17} />
            </button>
            <span className="cg-month-label">
              {new Date(srCursor.y, srCursor.m, 1).toLocaleDateString("ko-KR", {
                year: "numeric",
                month: "long",
              })}
            </span>
            <button
              className="cg-nav-btn"
              onClick={() =>
                setSrCursor((c) => (c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 }))
              }
              aria-label="다음 달"
            >
              <ChevronRight size={17} />
            </button>
          </div>

          <div className="cg-calendar-card">
            <div className="cg-weekdays">
              {WEEKDAYS.map((w) => (
                <span key={w}>{w}</span>
              ))}
            </div>
            <div className="cg-days">
              {srGrid.map((dateStr, i) => {
                if (!dateStr) return <div key={`e${i}`} className="cg-day empty" />;
                const isPast = dateStr < todayStr();
                const isToday = dateStr === todayStr();
                const isTuesday = parseDate(dateStr).getDay() === CLEANING_WEEKDAY;
                let cls = "cg-day ";
                cls += isPast ? "past" : "available";
                if (isToday) cls += " today";
                return (
                  <button
                    key={dateStr}
                    className={cls}
                    disabled={isPast}
                    onClick={() => setSrDayModalDate(dateStr)}
                    title={isTuesday ? "화요일은 12:00~16:00 청소시간이 있어요" : undefined}
                  >
                    {parseDate(dateStr).getDate()}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="cg-legend">
            <span className="cg-legend-item">
              <span className="cg-dot" style={{ background: "#fff", border: "1px solid #e2e5ea" }} />
              날짜 클릭해서 시간대 선택
            </span>
            <span className="cg-legend-item">
              <span className="cg-dot" style={{ background: "#4c5870" }} />
              화요일 12~16시 청소시간
            </span>
          </div>

          <button className="cg-mybooking-link" onClick={() => setSrMyBookingModal(true)}>
            내 예약 확인 · 취소
          </button>
        </div>
      ) : (
        <div className="cg-body">
          <div className="cg-admin-header">
            <button className="cg-back-btn" onClick={() => setView("calendar")} aria-label="달력으로 돌아가기">
              <ArrowLeft size={16} />
            </button>
            <h2 className="cg-admin-title cg-display">스터디룸 예약 관리</h2>
            <button className="cg-logout-btn" onClick={adminLogout}>
              로그아웃
            </button>
          </div>

          <div className="cg-tabs">
            <button className={`cg-tab ${srTab === "pending" ? "active" : ""}`} onClick={() => setSrTab("pending")}>
              대기중 <span className="cg-tab-count">{srPendingCount}</span>
            </button>
            <button className={`cg-tab ${srTab === "approved" ? "active" : ""}`} onClick={() => setSrTab("approved")}>
              승인됨 <span className="cg-tab-count">{srApprovedCount}</span>
            </button>
            <button className={`cg-tab ${srTab === "rejected" ? "active" : ""}`} onClick={() => setSrTab("rejected")}>
              거절됨 <span className="cg-tab-count">{srRejectedCount}</span>
            </button>
            <button className={`cg-tab ${srTab === "cancelled" ? "active" : ""}`} onClick={() => setSrTab("cancelled")}>
              취소됨 <span className="cg-tab-count">{srCancelledCount}</span>
            </button>
          </div>

          {srFilteredBookings.length === 0 ? (
            <div className="cg-empty">
              <CalendarDays size={22} style={{ marginBottom: 8, opacity: 0.5 }} />
              <div>해당하는 예약이 없어요.</div>
            </div>
          ) : (
            srFilteredBookings.map((b) => (
              <div className="cg-booking-card" key={b.id}>
                <div className="cg-booking-dates cg-mono">{displayDate(b.date)}</div>
                <div className="cg-booking-nights">
                  스터디룸 {b.room} · {slotInfo(b.slot).label} ({slotInfo(b.slot).time})
                </div>
                <div className="cg-booking-row">
                  <User size={13} /> {b.name}
                </div>
                <div className="cg-booking-row">
                  <Home size={13} /> {b.unit}
                </div>
                <div className="cg-booking-row">
                  <Phone size={13} /> {b.phone}
                </div>
                <div className="cg-booking-row">
                  <Users size={13} /> 인원 {b.guests}명
                </div>
                {b.status === "pending" && (
                  <div className="cg-booking-actions">
                    <button className="cg-approve-btn" onClick={() => setSrStatus(b.id, "approved")}>
                      <Check size={14} /> 승인
                    </button>
                    <button className="cg-reject-btn" onClick={() => setSrStatus(b.id, "rejected")}>
                      <X size={14} /> 거절
                    </button>
                    <button
                      className="cg-cancel-btn"
                      onClick={() => {
                        if (window.confirm("이 예약 신청을 취소하시겠어요?")) setSrStatus(b.id, "cancelled");
                      }}
                    >
                      취소
                    </button>
                  </div>
                )}
                {b.status === "approved" && (
                  <div className="cg-booking-actions">
                    <button
                      className="cg-reject-btn"
                      onClick={() => {
                        if (window.confirm("이 예약을 취소하시겠어요? 해당 시간대는 다시 예약 가능해져요.")) {
                          setSrStatus(b.id, "cancelled");
                        }
                      }}
                    >
                      <X size={14} /> 예약 취소
                    </button>
                  </div>
                )}
                <button className="cg-delete-link" onClick={() => deleteSrBooking(b.id)}>
                  삭제
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {adminModal && (
        <div className="cg-overlay" onClick={() => setAdminModal(false)}>
          <div className="cg-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 340 }}>
            <div className="cg-modal-head">
              <div>
                <h3 className="cg-modal-title">관리사무소 로그인</h3>
                <p className="cg-modal-sub">예약을 승인하거나 거절할 수 있어요.</p>
              </div>
              <button className="cg-close-btn" onClick={() => setAdminModal(false)} aria-label="닫기">
                <X size={15} />
              </button>
            </div>
            <input
              type="email"
              className="cg-pw-field"
              placeholder="관리자 이메일"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && tryAdminLogin()}
              autoFocus
            />
            <input
              type="password"
              className="cg-pw-field"
              placeholder="비밀번호"
              value={pwInput}
              onChange={(e) => setPwInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && tryAdminLogin()}
            />
            {pwError && <p className="cg-pw-error">{pwError}</p>}
            <button className="cg-submit-btn" onClick={tryAdminLogin} disabled={loggingIn}>
              {loggingIn ? <Loader2 size={14} className="cg-spin" /> : <Lock size={14} />} 로그인
            </button>
          </div>
        </div>
      )}


      {srDayModalDate && (
        <div className="cg-overlay" onClick={() => setSrDayModalDate(null)}>
          <div className="cg-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cg-modal-head">
              <div>
                <h3 className="cg-modal-title">{displayDate(srDayModalDate)}</h3>
                <p className="cg-modal-sub">방과 시간대를 선택해 주세요.</p>
              </div>
              <button className="cg-close-btn" onClick={() => setSrDayModalDate(null)} aria-label="닫기">
                <X size={15} />
              </button>
            </div>
            {STUDYROOM_ROOMS.map((room) => (
              <div className="cg-room-block" key={room}>
                <div className="cg-room-title">스터디룸 {room}</div>
                <div className="cg-slot-list">
                  {STUDYROOM_SLOTS.map((slot) => {
                    const status = srSlotStatus(srDayModalDate, room, slot.id);
                    let label = "예약 가능";
                    if (status === "approved") label = "예약 마감";
                    else if (status === "pending") label = "승인 대기중";
                    else if (status === "cleaning") label = "청소시간";
                    return (
                      <button
                        key={slot.id}
                        className={`cg-slot-btn ${status ? "blocked" : ""}`}
                        disabled={!!status}
                        onClick={() => pickSrSlot(srDayModalDate, room, slot.id)}
                      >
                        <span className="cg-slot-btn-time">
                          {slot.label} · {slot.time}
                        </span>
                        <span className="cg-slot-btn-status">{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {srNoticeOpen && (
        <div className="cg-overlay" onClick={() => setSrNoticeOpen(false)}>
          <div className="cg-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cg-modal-head">
              <div>
                <h3 className="cg-modal-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <AlertTriangle size={16} color="var(--gold-dark)" /> 예약 전 꼭 확인해 주세요
                </h3>
                <p className="cg-modal-sub">
                  {srPendingPick && (
                    <>
                      {displayDate(srPendingPick.date)} · 스터디룸 {srPendingPick.room} ·{" "}
                      {slotInfo(srPendingPick.slot).label} ({slotInfo(srPendingPick.slot).time})
                    </>
                  )}
                </p>
              </div>
              <button className="cg-close-btn" onClick={() => setSrNoticeOpen(false)} aria-label="닫기">
                <X size={15} />
              </button>
            </div>
            <div className="cg-notice-body">
              {STUDYROOM_NOTICES.map((section, i) => (
                <div className="cg-notice-section" key={i}>
                  <div className="cg-notice-section-title">{section.title}</div>
                  <ul className="cg-notice-list">
                    {section.lines.map((line, j) => (
                      <li key={j}>{line}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <label className="cg-agree-row">
              <input type="checkbox" checked={srAgreed} onChange={(e) => setSrAgreed(e.target.checked)} />
              <span>위 내용을 확인했으며 동의합니다.</span>
            </label>
            <button
              className="cg-submit-btn"
              disabled={!srAgreed}
              onClick={() => {
                setSrNoticeOpen(false);
                setSrFormOpen(true);
              }}
            >
              <Check size={15} /> 동의하고 계속하기
            </button>
          </div>
        </div>
      )}

      {srFormOpen && srPendingPick && (
        <div className="cg-overlay" onClick={() => setSrFormOpen(false)}>
          <div className="cg-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cg-modal-head">
              <div>
                <h3 className="cg-modal-title">예약 정보 입력</h3>
                <p className="cg-modal-sub">
                  {displayDate(srPendingPick.date)} · 스터디룸 {srPendingPick.room} ·{" "}
                  {slotInfo(srPendingPick.slot).label} ({slotInfo(srPendingPick.slot).time})
                </p>
              </div>
              <button
                className="cg-close-btn"
                onClick={() => {
                  setSrFormOpen(false);
                  setSrAgreed(false);
                }}
                aria-label="닫기"
              >
                <X size={15} />
              </button>
            </div>
            <form onSubmit={submitSrBooking}>
              <div className="cg-field-row">
                <div className="cg-field">
                  <label>
                    <User size={13} /> 예약자 이름
                  </label>
                  <input
                    value={srForm.name}
                    onChange={(e) => setSrForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="홍길동"
                    required
                  />
                </div>
                <div className="cg-field">
                  <label>
                    <Home size={13} /> 동 / 호수
                  </label>
                  <input
                    value={srForm.unit}
                    onChange={(e) => setSrForm((f) => ({ ...f, unit: e.target.value }))}
                    placeholder="303동 1502호"
                    required
                  />
                </div>
              </div>
              <div className="cg-field">
                <label>
                  <Phone size={13} /> 연락처
                </label>
                <input
                  value={srForm.phone}
                  onChange={(e) => setSrForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="010-1234-5678"
                  required
                />
              </div>
              <div className="cg-field">
                <label>
                  <Users size={13} /> 인원 (최소 {MIN_GUESTS}명)
                </label>
                <input
                  type="number"
                  min={MIN_GUESTS}
                  max="20"
                  value={srForm.guests}
                  onChange={(e) => setSrForm((f) => ({ ...f, guests: e.target.value }))}
                  required
                />
              </div>
              <button className="cg-submit-btn" type="submit" disabled={srSubmitting}>
                {srSubmitting ? <Loader2 size={15} className="cg-spin" /> : <Check size={15} />}
                예약 신청하기
              </button>
            </form>
          </div>
        </div>
      )}

      {srMyBookingModal && (
        <div
          className="cg-overlay"
          onClick={() => {
            setSrMyBookingModal(false);
            setSrMyBookings(null);
            setSrMyPhoneInput("");
          }}
        >
          <div className="cg-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cg-modal-head">
              <div>
                <h3 className="cg-modal-title">내 예약 확인 · 취소</h3>
                <p className="cg-modal-sub">예약할 때 입력한 연락처로 조회할 수 있어요.</p>
              </div>
              <button
                className="cg-close-btn"
                onClick={() => {
                  setSrMyBookingModal(false);
                  setSrMyBookings(null);
                  setSrMyPhoneInput("");
                }}
                aria-label="닫기"
              >
                <X size={15} />
              </button>
            </div>
            <div className="cg-field-row">
              <div className="cg-field" style={{ flex: 2 }}>
                <input
                  value={srMyPhoneInput}
                  onChange={(e) => setSrMyPhoneInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && searchMySrBookings()}
                  placeholder="010-1234-5678"
                  autoFocus
                />
              </div>
              <button
                className="cg-submit-btn"
                style={{ flex: 1, marginTop: 0 }}
                onClick={searchMySrBookings}
                disabled={srMyBookingsLoading}
              >
                {srMyBookingsLoading ? <Loader2 size={14} className="cg-spin" /> : "조회"}
              </button>
            </div>

            {srMyBookings !== null && (
              <div style={{ marginTop: 14 }}>
                {srMyBookings.length === 0 ? (
                  <div className="cg-empty">이 연락처로 된 예약이 없어요.</div>
                ) : (
                  srMyBookings.map((b) => (
                    <div className="cg-booking-card" key={b.id}>
                      <div className="cg-booking-dates cg-mono">{displayDate(b.date)}</div>
                      <div className="cg-booking-nights">
                        스터디룸 {b.room} · {slotInfo(b.slot).label} ({slotInfo(b.slot).time}) ·{" "}
                        {b.status === "approved" ? "승인됨" : "승인 대기중"}
                      </div>
                      <div className="cg-booking-row">
                        <User size={13} /> {b.name}
                      </div>
                      <div className="cg-booking-row">
                        <Home size={13} /> {b.unit}
                      </div>
                      <div className="cg-booking-actions">
                        <button className="cg-reject-btn" onClick={() => cancelMySrBooking(b.id)}>
                          <X size={14} /> 예약 취소
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {toast && <div className={`cg-toast ${toast.kind === "error" ? "error" : ""}`}>{toast.msg}</div>}
    </div>
  );
}
