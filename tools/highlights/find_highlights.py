#!/usr/bin/env python3
"""หาช่วงเด็ด (highlight candidates) จากวิดีโอไลฟ์ยาว ๆ

อ่านวิดีโอด้วย ffmpeg แบบสตรีม (ไม่โหลดทั้งไฟล์เข้าหน่วยความจำ) แล้วให้คะแนนทุกหน้าต่างเวลา
จาก 4 สัญญาณ:
  audio  เสียงดังขึ้นผิดปกติเทียบกับช่วงรอบ ๆ (มุก/เสียงหัวเราะ/ตื่นเต้น)
  speech พูดถี่ (จำนวนตัวอักษรต่อวินาทีจากข้อความถอดเสียง)
  kw     คำกระตุ้นในข้อความ (ฮ่า, 555, โอ้โห ฯลฯ ตั้งเองได้)
  scene  ภาพเปลี่ยนมาก (ช่วงเกม/จังหวะพีค)
แล้วคัดผู้เข้ารอบ ปรับจุดเริ่ม-จบให้ลงขอบประโยค และบอกช่วงเงียบที่ควรตัด

ผลลัพธ์: candidates.json, candidates.md (+ transcript.json ถ้าถอดเสียงเอง)
ไม่สร้างซับ ข้อความถอดเสียงใช้ช่วยเลือกช่วงเท่านั้น
ใช้เฉพาะ standard library ของ Python; faster-whisper ติดตั้งเพิ่มถ้าอยากให้ถอดเสียงให้
"""

import argparse
import bisect
import json
import math
import os
import re
import shutil
import subprocess
import sys

DEFAULT_KEYWORDS = [
    "ฮ่า", "555", "ขำ", "ตลก", "โอ้โห", "ว้าว", "โคตร", "สุดยอด",
    "ไม่อยากเชื่อ", "ชนะ", "แพ้", "เฮ้ย", "ไม่ไหว",
]
DB_FLOOR = -90.0


def log(msg):
    print(msg, file=sys.stderr, flush=True)


def die(msg):
    log("ผิดพลาด: " + msg)
    sys.exit(1)


def need_tool(name):
    if not shutil.which(name):
        die(f"ไม่พบ {name} ในเครื่อง ติดตั้งก่อน (Windows: winget install Gyan.FFmpeg)")


def fmt_time(t):
    t = max(0.0, t)
    h = int(t // 3600)
    m = int((t % 3600) // 60)
    s = t - h * 3600 - m * 60
    return f"{h}:{m:02d}:{s:04.1f}"


def pct(vals, p):
    if not vals:
        return 0.0
    s = sorted(vals)
    k = min(len(s) - 1, max(0, int(round((len(s) - 1) * p / 100.0))))
    return s[k]


def median(vals):
    if not vals:
        return 0.0
    s = sorted(vals)
    n = len(s)
    return s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2.0


def clip01(x):
    return 0.0 if x < 0 else 1.0 if x > 1 else x


# ---------------------------------------------------------------- ffmpeg passes

def probe_duration(path):
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=nw=1:nk=1", path],
        capture_output=True, text=True)
    try:
        return float(r.stdout.strip())
    except ValueError:
        die("อ่านความยาววิดีโอไม่ได้ (ไฟล์เสียหรือพาธผิด?): " + r.stderr.strip()[:200])


def parse_db(s):
    try:
        v = float(s)
    except ValueError:
        return DB_FLOOR
    if math.isinf(v) or math.isnan(v):
        return DB_FLOOR
    return max(DB_FLOOR, v)


def audio_pass(path, window, silence_db, silence_min):
    """คืน (rms_db[], peak_db[], silences[(start,end)])"""
    n = int(16000 * window)
    af = (
        "aresample=16000,"
        f"silencedetect=n={silence_db}dB:d={silence_min},"
        f"asetnsamples=n={n}:p=0,"
        "astats=metadata=1:reset=1:measure_perchannel=none:measure_overall=RMS_level+Peak_level,"
        "ametadata=mode=print:file=-"
    )
    cmd = ["ffmpeg", "-hide_banner", "-nostdin", "-nostats", "-loglevel", "info",
           "-i", path, "-vn", "-af", af, "-f", "null", "-"]
    r = subprocess.run(cmd, capture_output=True)
    out = r.stdout.decode("utf-8", "replace")
    err = r.stderr.decode("utf-8", "replace")
    if r.returncode != 0:
        die("ffmpeg วิเคราะห์เสียงไม่สำเร็จ:\n" + err[-600:])

    rms, peak = {}, {}
    cur = None
    for line in out.splitlines():
        m = re.search(r"pts_time:([\d.]+)", line)
        if m:
            cur = int(round(float(m.group(1)) / window))
            continue
        if cur is None:
            continue
        if "Overall.RMS_level=" in line:
            rms[cur] = parse_db(line.split("=", 1)[1])
        elif "Overall.Peak_level=" in line:
            peak[cur] = parse_db(line.split("=", 1)[1])
    if not rms:
        die("ไม่พบข้อมูลเสียงในไฟล์ (ไฟล์ไม่มีเสียง?)")
    count = max(rms) + 1
    rms_l = [rms.get(i, DB_FLOOR) for i in range(count)]
    peak_l = [peak.get(i, DB_FLOOR) for i in range(count)]

    silences, start = [], None
    for line in err.splitlines():
        m = re.search(r"silence_start:\s*(-?[\d.]+)", line)
        if m:
            start = max(0.0, float(m.group(1)))
            continue
        m = re.search(r"silence_end:\s*(-?[\d.]+)", line)
        if m and start is not None:
            silences.append((start, float(m.group(1))))
            start = None
    if start is not None:  # เงียบถึงท้ายไฟล์
        silences.append((start, count * window))
    return rms_l, peak_l, silences


def scene_pass(path, threshold):
    """คืน [(เวลา, คะแนนเปลี่ยนฉาก)] อ่านเฉพาะ keyframe ให้เร็ว (ละเอียดระดับ keyframe)"""
    vf = (f"scale=160:-2,select='gt(scene,{threshold})',"
          "metadata=mode=print:key=lavfi.scene_score:file=-")
    cmd = ["ffmpeg", "-hide_banner", "-nostdin", "-nostats", "-loglevel", "error",
           "-skip_frame", "nokey", "-i", path, "-an", "-vf", vf, "-f", "null", "-"]
    r = subprocess.run(cmd, capture_output=True)
    if r.returncode != 0:
        log("คำเตือน: วิเคราะห์ภาพไม่สำเร็จ ข้ามเกณฑ์ภาพ: "
            + r.stderr.decode("utf-8", "replace")[-300:])
        return None
    events, t = [], None
    for line in r.stdout.decode("utf-8", "replace").splitlines():
        m = re.search(r"pts_time:([\d.]+)", line)
        if m:
            t = float(m.group(1))
            continue
        if "scene_score=" in line and t is not None:
            try:
                events.append((t, float(line.split("=", 1)[1])))
            except ValueError:
                pass
    return events


# ------------------------------------------------------------------ transcript

def parse_srt(text):
    segs = []
    blocks = re.split(r"\n\s*\n", text.replace("\r", "").strip())
    ts = r"(\d+):(\d+):(\d+)[,.](\d+)"
    for b in blocks:
        m = re.search(ts + r"\s*-->\s*" + ts, b)
        if not m:
            continue
        g = [int(x) for x in m.groups()]
        start = g[0] * 3600 + g[1] * 60 + g[2] + g[3] / (10 ** len(m.group(4)))
        end = g[4] * 3600 + g[5] * 60 + g[6] + g[7] / (10 ** len(m.group(8)))
        body = b[m.end():].strip().replace("\n", " ")
        if body:
            segs.append({"start": start, "end": end, "text": body})
    return segs


def load_transcript(path):
    with open(path, "r", encoding="utf-8-sig") as f:
        raw = f.read()
    if path.lower().endswith(".srt"):
        segs = parse_srt(raw)
    else:
        data = json.loads(raw)
        if isinstance(data, dict):
            data = data.get("segments", [])
        segs = []
        for s in data:
            try:
                segs.append({"start": float(s["start"]), "end": float(s["end"]),
                             "text": str(s.get("text", "")).strip()})
            except (KeyError, TypeError, ValueError):
                continue
    segs = [s for s in segs if s["text"] and s["end"] > s["start"]]
    segs.sort(key=lambda s: s["start"])
    if not segs:
        die(f"อ่านข้อความถอดเสียงจาก {path} ไม่ได้ (รองรับ JSON รายการ {{start,end,text}}, "
            "JSON ที่มีคีย์ segments หรือ .srt)")
    return segs


def transcribe(path, outdir, model_size, language, device):
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        log("ไม่พบ faster-whisper (pip install faster-whisper) ข้ามการถอดเสียง "
            "จะให้คะแนนจากเสียงและภาพอย่างเดียว หรือใช้ --transcript ไฟล์.json/.srt")
        return None
    wav = os.path.join(outdir, "_audio16k.wav")
    log("กำลังแยกเสียงเพื่อถอดเสียง ...")
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostdin", "-nostats", "-loglevel", "error",
                        "-y", "-i", path, "-vn", "-ac", "1", "-ar", "16000", wav],
                       capture_output=True)
    if r.returncode != 0:
        log("แยกเสียงไม่สำเร็จ ข้ามการถอดเสียง: " + r.stderr.decode("utf-8", "replace")[-300:])
        return None
    try:
        compute = "int8" if device == "cpu" else "float16"
        model = WhisperModel(model_size, device=device, compute_type=compute)
        log(f"กำลังถอดเสียง (โมเดล {model_size}, {device}) อาจใช้เวลานานกับไลฟ์ยาว ๆ ...")
        it, _info = model.transcribe(wav, language=language, vad_filter=True)
        segs = []
        for s in it:
            text = s.text.strip()
            if text:
                segs.append({"start": float(s.start), "end": float(s.end), "text": text})
            if len(segs) % 200 == 0 and segs:
                log(f"  ถอดได้ถึง {fmt_time(s.end)}")
        return segs
    except Exception as e:  # โมเดลโหลดไม่ได้/หน่วยความจำไม่พอ ฯลฯ
        log(f"ถอดเสียงไม่สำเร็จ ({type(e).__name__}: {e}) ข้ามการถอดเสียง")
        return None
    finally:
        try:
            os.remove(wav)
        except OSError:
            pass


# --------------------------------------------------------------------- scoring

def spread(segments, nwin, window, fn):
    arr = [0.0] * nwin
    for s in segments:
        v = fn(s)
        if not v:
            continue
        dur = max(s["end"] - s["start"], 1e-6)
        i0 = max(0, int(s["start"] // window))
        i1 = min(nwin - 1, int(min(s["end"], nwin * window - 1e-9) // window))
        for i in range(i0, i1 + 1):
            ov = min(s["end"], (i + 1) * window) - max(s["start"], i * window)
            if ov > 0:
                arr[i] += v * ov / dur
    return arr


def rolling_median(vals, half):
    out = []
    for i in range(len(vals)):
        out.append(median(vals[max(0, i - half):i + half + 1]))
    return out


def score_windows(nwin, window, rms, segments, scenes, keywords, weights):
    rms = (rms + [DB_FLOOR] * nwin)[:nwin]
    base = rolling_median(rms, max(1, int(round(60.0 / window))))
    burst = [max(0.0, r - b) if r > DB_FLOOR else 0.0 for r, b in zip(rms, base)]
    sorted_rms = sorted(rms)
    p95 = pct(burst, 95) or 1.0
    audio = []
    for r, bu in zip(rms, burst):
        rank = bisect.bisect_right(sorted_rms, r) / float(len(sorted_rms))
        audio.append(0.6 * clip01(bu / p95) + 0.4 * rank)

    speech = [0.0] * nwin
    kw = [0.0] * nwin
    kw_words = [set() for _ in range(nwin)]
    if segments:
        chars = spread(segments, nwin, window, lambda s: len(re.sub(r"\s+", "", s["text"])))
        sp95 = pct(chars, 95) or 1.0
        speech = [clip01(c / sp95) for c in chars]
        hits = spread(segments, nwin, window,
                      lambda s: sum(s["text"].count(k) for k in keywords))
        kw = [clip01(h / 2.0) for h in hits]
        for s in segments:
            found = [k for k in keywords if k in s["text"]]
            if not found:
                continue
            i0 = max(0, int(s["start"] // window))
            i1 = min(nwin - 1, int(s["end"] // window))
            for i in range(i0, i1 + 1):
                kw_words[i].update(found)

    scene = [0.0] * nwin
    if scenes:
        acc = [0.0] * nwin
        for t, sc in scenes:
            i = int(t // window)
            if 0 <= i < nwin:
                acc[i] += sc
        scene = [clip01(a / 1.0) for a in acc]

    comps = {"audio": audio, "speech": speech, "kw": kw, "scene": scene}
    active = {k: w for k, w in weights.items()
              if w > 0 and (k == "audio" or (k in ("speech", "kw") and segments)
                            or (k == "scene" and scenes is not None))}
    tot = sum(active.values()) or 1.0
    raw = [sum(active[k] * comps[k][i] for k in active) / tot for i in range(nwin)]
    smooth = []
    for i in range(nwin):
        a = raw[i - 1] if i > 0 else raw[i]
        c = raw[i]
        b = raw[i + 1] if i + 1 < nwin else raw[i]
        smooth.append(0.25 * a + 0.5 * c + 0.25 * b)
    return smooth, comps, kw_words, active


# ------------------------------------------------------------------- selection

def snap_start(t, segs, max_fwd=3.0):
    for s in segs:
        if s["start"] <= t < s["end"]:
            return s["start"]
        if s["start"] >= t:
            return s["start"] if s["start"] - t <= max_fwd else t
    return t


def snap_end(t, segs, max_back=3.0):
    prev = None
    for s in segs:
        if s["start"] < t <= s["end"]:
            return s["end"]
        if s["end"] < t:
            prev = s
        else:
            break
    if prev is not None and t - prev["end"] <= max_back:
        return prev["end"]
    return t


def snap_silence_start(t, silences, span=5.0):
    best = None
    for s, e in silences:
        if t - span <= e <= t + 0.5 and (best is None or e > best):
            best = e
    return best if best is not None else t


def snap_silence_end(t, silences, span=5.0):
    best = None
    for s, e in silences:
        if t - 0.5 <= s <= t + span and (best is None or s < best):
            best = s
    return best if best is not None else t


def build_candidates(path, duration, window, nwin, smooth, comps, kw_words, segments,
                     silences, silence_min, clip_len, max_len, top):
    order = sorted(range(nwin), key=lambda i: smooth[i], reverse=True)
    chosen = []
    min_len = max(8.0, clip_len / 2.0)
    for i in order:
        if len(chosen) >= top:
            break
        if smooth[i] <= 0:
            break
        center = i * window + window / 2.0
        start = max(0.0, center - clip_len / 2.0)
        end = min(duration, center + clip_len / 2.0)
        snapped = False
        if segments:
            start = snap_start(start, segments)
            end = snap_end(end, segments)
            snapped = True
            # ไม่ให้ยาวเกิน max_len: ถอยจุดจบไปขอบประโยคก่อนหน้า
            while end - start > max_len:
                prev = [s["end"] for s in segments if start + min_len <= s["end"] < end - 0.01]
                if not prev:
                    end = start + max_len
                    break
                end = max(prev)
            start = max(0.0, start - 0.2)
            end = min(duration, end + 0.3)
        elif silences:
            s2 = snap_silence_start(start, silences)
            e2 = snap_silence_end(end, silences)
            snapped = (s2 != start or e2 != end)
            start, end = s2, e2
        if end - start > max_len:
            end = start + max_len
        if end - start < min_len or any(start < c["end"] and end > c["start"] for c in chosen):
            continue
        w0, w1 = int(start // window), min(nwin - 1, int(end // window))
        rng = range(w0, w1 + 1)
        comp_max = {k: round(max(v[j] for j in rng), 3) for k, v in comps.items()}
        words = sorted(set().union(*[kw_words[j] for j in rng]))
        reasons = []
        if comp_max["audio"] >= 0.6:
            reasons.append("เสียงดังขึ้นเด่น (น่าจะขำ/ตื่นเต้น)")
        if comp_max["speech"] >= 0.6:
            reasons.append("พูดถี่/เร็ว")
        if words:
            reasons.append("คำกระตุ้น: " + ", ".join(words))
        if comp_max["scene"] >= 0.5:
            reasons.append("ภาพเปลี่ยนมาก (เกม/พีค)")
        if not reasons:
            reasons.append("คะแนนรวมสูงสุดในช่วงนี้")
        text = ""
        if segments:
            inside = [s["text"] for s in segments if s["end"] > start and s["start"] < end]
            text = " ".join(inside)
        cuts = []
        for s, e in silences:
            a, b = max(s, start), min(e, end)
            if b - a >= silence_min + 0.6:
                cuts.append([round(a + 0.3, 2), round(b - 0.3, 2)])
        trimmed = (end - start) - sum(b - a for a, b in cuts)
        chosen.append({
            "start": round(start, 2), "end": round(end, 2),
            "length": round(end - start, 1),
            "length_after_cuts": round(trimmed, 1),
            "score": round(smooth[i], 3),
            "components": comp_max,
            "reasons": reasons,
            "text": (text[:300] + "…") if len(text) > 300 else text,
            "cut_silences": cuts,
            "snapped_to": "sentence" if segments else ("silence" if snapped else "none"),
        })
    for rank, c in enumerate(chosen, 1):
        c["rank"] = rank
    return chosen


# ---------------------------------------------------------------------- output

def write_outputs(outdir, video, duration, chosen, meta):
    with open(os.path.join(outdir, "candidates.json"), "w", encoding="utf-8") as f:
        json.dump({"video": video, "duration": round(duration, 1), "meta": meta,
                   "candidates": chosen}, f, ensure_ascii=False, indent=2)

    lines = ["# ผู้เข้ารอบช่วงเด็ด", "",
             f"ไฟล์: `{video}` ความยาวรวม {fmt_time(duration)}", "",
             "เกณฑ์ที่ใช้: " + ", ".join(meta["criteria"]), ""]
    for note in meta["notes"]:
        lines.append(f"> {note}")
    lines += ["", "| # | เริ่ม–จบ | ยาว(วิ) | คะแนน | เหตุผล |", "|---|---|---|---|---|"]
    for c in chosen:
        lines.append(f"| {c['rank']} | {fmt_time(c['start'])} – {fmt_time(c['end'])} | "
                     f"{c['length']} | {c['score']} | {'; '.join(c['reasons'])} |")
    lines += ["", "## รายละเอียด", ""]
    for c in chosen:
        lines.append(f"### #{c['rank']}  {fmt_time(c['start'])} – {fmt_time(c['end'])}  "
                     f"({c['length']} วิ, หลังตัดเงียบ ~{c['length_after_cuts']} วิ)")
        lines.append(f"- เหตุผล: {'; '.join(c['reasons'])}")
        lines.append("- สัญญาณ: " + ", ".join(f"{k}={v}" for k, v in c["components"].items()))
        lines.append(f"- จุดตัดลงที่: {c['snapped_to']}")
        if c["text"]:
            lines.append(f"- ข้อความ: {c['text']}")
        if c["cut_silences"]:
            lines.append("- ช่วงเงียบที่ควรตัดออก: "
                         + ", ".join(f"{fmt_time(a)}–{fmt_time(b)}" for a, b in c["cut_silences"]))
        lines.append("- ดูตัวอย่างเร็ว ๆ:")
        lines.append("  ```")
        lines.append(f'  ffmpeg -ss {c["start"]} -i "{video}" -t {c["length"]} '
                     f'-c:v libx264 -preset veryfast -crf 23 -c:a aac "preview_{c["rank"]:02d}.mp4"')
        lines.append("  ```")
        lines.append("")
    lines += ["## เรียงตามเวลาในไลฟ์", ""]
    for c in sorted(chosen, key=lambda c: c["start"]):
        lines.append(f"- #{c['rank']}  {fmt_time(c['start'])} – {fmt_time(c['end'])}")
    with open(os.path.join(outdir, "candidates.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description="หาช่วงเด็ดจากวิดีโอไลฟ์ (ไม่สร้างซับ)")
    ap.add_argument("video", help="ไฟล์วิดีโอ เช่น lung-a-live.mp4")
    ap.add_argument("--out", default="highlights_out", help="โฟลเดอร์ผลลัพธ์")
    ap.add_argument("--top", type=int, default=10, help="จำนวนผู้เข้ารอบ (ค่าเริ่มต้น 10)")
    ap.add_argument("--window", type=float, default=5.0, help="ขนาดหน้าต่างให้คะแนน (วินาที)")
    ap.add_argument("--clip-len", type=float, default=20.0, help="ความยาวเป้าหมายต่อช่วง (วินาที)")
    ap.add_argument("--max-len", type=float, default=35.0, help="ยาวสุดต่อช่วง (วินาที)")
    ap.add_argument("--transcript", help="ไฟล์ข้อความถอดเสียง .json หรือ .srt (ข้ามการถอดเสียงเอง)")
    ap.add_argument("--no-transcribe", action="store_true", help="ไม่ถอดเสียง (เร็ว ใช้เสียง+ภาพอย่างเดียว)")
    ap.add_argument("--retranscribe", action="store_true", help="ถอดเสียงใหม่ แม้มี transcript.json เดิม")
    ap.add_argument("--model", default="small", help="โมเดล whisper (small เร็ว, medium/large-v3 แม่นกว่าแต่ช้า)")
    ap.add_argument("--language", default="th")
    ap.add_argument("--device", default="cpu", choices=["cpu", "cuda"])
    ap.add_argument("--keywords", help="คำกระตุ้น คั่นด้วยจุลภาค (แทนค่าเริ่มต้น)")
    ap.add_argument("--no-scene", action="store_true", help="ข้ามการวิเคราะห์ภาพ")
    ap.add_argument("--scene-threshold", type=float, default=0.3)
    ap.add_argument("--silence-db", type=float, default=-35.0)
    ap.add_argument("--silence-min", type=float, default=1.0, help="เงียบยาวเกินนี้ (วินาที) ถึงแนะนำให้ตัด")
    args = ap.parse_args()

    if not os.path.isfile(args.video):
        die(f"ไม่พบไฟล์ {args.video}")
    need_tool("ffmpeg")
    need_tool("ffprobe")
    os.makedirs(args.out, exist_ok=True)
    keywords = ([k.strip() for k in args.keywords.split(",") if k.strip()]
                if args.keywords else DEFAULT_KEYWORDS)

    duration = probe_duration(args.video)
    log(f"ความยาว {fmt_time(duration)}")
    log("1/3 วิเคราะห์เสียง ...")
    rms, peak, silences = audio_pass(args.video, args.window, args.silence_db, args.silence_min)
    nwin = max(len(rms), int(math.ceil(duration / args.window)))

    scenes = None
    if not args.no_scene:
        log("2/3 วิเคราะห์ภาพ (เฉพาะ keyframe) ...")
        scenes = scene_pass(args.video, args.scene_threshold)

    notes = []
    segments = None
    tpath = os.path.join(args.out, "transcript.json")
    if args.transcript:
        segments = load_transcript(args.transcript)
    elif not args.no_transcribe:
        if os.path.isfile(tpath) and not args.retranscribe:
            log("3/3 ใช้ transcript.json เดิม (ใส่ --retranscribe ถ้าอยากถอดใหม่)")
            segments = load_transcript(tpath)
        else:
            log("3/3 ถอดเสียง ...")
            segments = transcribe(args.video, args.out, args.model, args.language, args.device)
            if segments:
                with open(tpath, "w", encoding="utf-8") as f:
                    json.dump(segments, f, ensure_ascii=False, indent=2)
    if not segments:
        notes.append("ไม่มีข้อความถอดเสียง: คะแนนมาจากเสียงและภาพเท่านั้น และจุดตัดอิงช่วงเงียบแทนขอบประโยค")

    weights = {"audio": 0.35, "speech": 0.20, "kw": 0.25, "scene": 0.20}
    smooth, comps, kw_words, active = score_windows(
        nwin, args.window, rms, segments, scenes, keywords, weights)
    chosen = build_candidates(args.video, duration, args.window, nwin, smooth, comps, kw_words,
                              segments or [], silences, args.silence_min,
                              args.clip_len, args.max_len, args.top)
    if not chosen:
        die("ไม่พบช่วงที่เข้าเกณฑ์เลย (ลองลด --clip-len หรือตรวจว่าไฟล์มีเสียง)")

    labels = {"audio": "เสียงดังขึ้นผิดปกติ", "speech": "พูดถี่", "kw": "คำกระตุ้น",
              "scene": "ภาพเปลี่ยนฉาก"}
    criteria = [labels[k] for k in active]
    if scenes is None:
        notes.append("ไม่ได้วิเคราะห์ภาพ (ปิดไว้หรือผิดพลาด)")
    notes.append("เกณฑ์ 'แชตคึกคัก' ทำอัตโนมัติไม่ได้ ถ้าแชตไม่อยู่ในภาพ ต้องดูเอง")
    notes.append("เสียงหัวเราะวัดจากพลังงานเสียงเป็นแค่ตัวช่วย ควรฟังตัวอย่างก่อนเลือก")
    meta = {"criteria": criteria, "notes": notes, "window": args.window,
            "weights": {k: round(v / sum(active.values()), 3) for k, v in active.items()},
            "keywords": keywords, "transcribed": bool(segments)}
    write_outputs(args.out, args.video, duration, chosen, meta)

    log(f"เสร็จแล้ว: {len(chosen)} ช่วง -> {os.path.join(args.out, 'candidates.md')}")
    for c in chosen:
        print(f"#{c['rank']:>2}  {fmt_time(c['start'])} – {fmt_time(c['end'])}  "
              f"{c['length']:>5}s  score={c['score']}  {'; '.join(c['reasons'])}")


if __name__ == "__main__":
    main()
