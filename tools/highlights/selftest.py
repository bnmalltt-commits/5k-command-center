#!/usr/bin/env python3
"""ทดสอบ find_highlights.py ด้วยวิดีโอสังเคราะห์ (ไม่ต้องใช้ไฟล์จริง ไม่ต้องใช้อินเทอร์เน็ต)

รัน:  python3 selftest.py
ต้องมี ffmpeg/ffprobe ใน PATH
วิดีโอจำลอง 180 วินาที: พูดปกติ, เงียบ, และ "ช่วงเด็ด" 2 ช่วง (เสียงดัง + ภาพกะพริบ + คำกระตุ้น)
ที่ 60-68 วินาที และ 130-137 วินาที
"""

import importlib.util
import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
BURSTS = [(60.0, 68.0), (130.0, 137.0)]

# ช่วงพูด: (เริ่ม, จบ, ข้อความ)
SEGMENTS = [
    (0, 6, "สวัสดีทุกคนที่เข้ามาดูไลฟ์วันนี้"),
    (6, 14, "วันนี้เราจะมาเล่นเกมกันนะครับ"),
    (14, 20, "ก่อนอื่นต้องตั้งค่าอะไรหน่อย"),
    (23, 31, "เอาล่ะ เริ่มกันเลย ตาแรกนี้ขอเบา ๆ ก่อน"),
    (31, 40, "ตรงนี้ต้องระวังหน่อย ถ้าพลาดคือจบเลย"),
    (40, 52, "โอเค ผ่านมาได้แล้ว ต่อไปจะยากขึ้นอีกนิด"),
    (52, 60, "ก็เลยมาถึงตรงนี้ ลุ้นกันหน่อย"),
    (60, 64, "ฮ่าๆๆ 555 ตลกมากเลยอันนี้"),
    (64, 68, "โอ้โห ไม่อยากเชื่อเลยว่าจะเป็นแบบนี้"),
    (68, 71, "เดี๋ยวนะ ขอเล่าให้ฟังก่อน"),
    (71, 79, "เมื่อกี้คือไม่ได้ตั้งใจเลยจริง ๆ นะครับ"),
    (79, 90, "ต่อไปเรามาดูอีกด่านหนึ่งกัน ด่านนี้ไม่ง่ายเลย"),
    (90, 100, "ค่อย ๆ ไปทีละขั้น ไม่ต้องรีบ"),
    (103, 112, "พักเรื่องเกมสักแป๊บ มาคุยกับแชตกันหน่อย"),
    (112, 122, "มีคนถามว่าวันนี้เล่นถึงกี่โมง ก็คงดึกหน่อย"),
    (122, 130, "โอเค กลับมาเล่นต่อ ด่านสุดท้ายแล้วนะ"),
    (130, 134, "ว้าว ชนะแล้ว! สุดยอดเลย"),
    (134, 137, "555 ขำจนท้องแข็ง"),
    (137, 150, "ขอบคุณทุกคนที่อยู่ด้วยกันมาถึงตรงนี้นะครับ"),
    (150, 165, "เดี๋ยวพรุ่งนี้เจอกันใหม่ วันนี้ขอจบแค่นี้"),
    (165, 180, "บายครับ ฝันดีทุกคน"),
]


def run(cmd, **kw):
    r = subprocess.run(cmd, capture_output=True, **kw)
    if r.returncode != 0:
        sys.exit("คำสั่งล้มเหลว: " + " ".join(cmd[:4]) + "\n" + r.stderr.decode("utf-8", "replace")[-800:])
    return r


def make_media(path):
    # ระดับเสียง: เงียบ 0.002, พูด 0.15, ช่วงเด็ด 0.9 (ช่วง 20-23 และ 100-103 เงียบ, 69-71.5 เงียบกลางช่วงเด็ด)
    vol = ("if(between(t,60,68)+between(t,130,137),0.9,"
           "if(between(t,20,23)+between(t,100,103)+between(t,69,71.5),0.002,0.15))")
    flashes = "+".join(f"between(t,{a},{a + 0.5})" for a in (61, 62, 63, 64, 65, 66, 67, 131, 132, 133, 134, 135, 136))
    run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
         "-f", "lavfi", "-i", "color=c=black:s=320x180:r=25:d=180",
         "-f", "lavfi", "-i", "anoisesrc=d=180:c=pink:r=16000:a=0.5",
         "-filter_complex",
         f"[0:v]drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill:enable='{flashes}'[v];"
         f"[1:a]volume='{vol}':eval=frame[a]",
         "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-g", "50", "-pix_fmt", "yuv420p",
         "-c:a", "aac", path])


def load_module():
    spec = importlib.util.spec_from_file_location("find_highlights", os.path.join(HERE, "find_highlights.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def overlaps(c, a, b):
    return c["start"] < b and c["end"] > a


def check(cond, msg):
    print(("  ผ่าน  " if cond else "  ไม่ผ่าน  ") + msg)
    if not cond:
        check.failed += 1


check.failed = 0


def run_tool(media, out, *extra):
    run([sys.executable, "-I", os.path.join(HERE, "find_highlights.py"), media, "--out", out,
         "--top", "6", *extra])
    with open(os.path.join(out, "candidates.json"), encoding="utf-8") as f:
        return json.load(f)["candidates"]


def top_hits_bursts(cands):
    top2 = cands[:2]
    return all(any(overlaps(c, a, b) for c in top2) for a, b in BURSTS)


def no_overlap(cands):
    s = sorted(cands, key=lambda c: c["start"])
    return all(s[i]["end"] <= s[i + 1]["start"] for i in range(len(s) - 1))


def main():
    mod = load_module()
    with tempfile.TemporaryDirectory() as tmp:
        media = os.path.join(tmp, "fake_live.mp4")
        print("สร้างวิดีโอสังเคราะห์ ...")
        make_media(media)
        tjson = os.path.join(tmp, "t.json")
        with open(tjson, "w", encoding="utf-8") as f:
            json.dump([{"start": a, "end": b, "text": t} for a, b, t in SEGMENTS], f, ensure_ascii=False)

        print("\n[1] มีข้อความถอดเสียง")
        c1 = run_tool(media, os.path.join(tmp, "o1"), "--transcript", tjson)
        for c in c1:
            print(f"     #{c['rank']} {c['start']}-{c['end']} score={c['score']} {c['reasons']}")
        check(len(c1) >= 2, "ได้ผู้เข้ารอบอย่างน้อย 2 ช่วง")
        check(top_hits_bursts(c1), "อันดับ 1-2 ครอบคลุมช่วงเด็ดทั้งสองช่วง")
        check(no_overlap(c1), "ผู้เข้ารอบไม่ซ้อนทับกัน")
        check(all(c["length"] <= 35.0 + 0.6 for c in c1), "ไม่ยาวเกิน max-len")
        edges_s = [a for a, _b, _t in SEGMENTS]
        edges_e = [b for _a, b, _t in SEGMENTS]
        snapped = [c for c in c1 if c["snapped_to"] == "sentence"]
        ok_edges = all(any(abs(c["start"] + 0.2 - s) < 0.06 or abs(c["start"] - 0.0) < 0.01 for s in edges_s)
                       and any(abs(c["end"] - 0.3 - e) < 0.06 or abs(c["end"] - 180.0) < 0.01 for e in edges_e)
                       for c in snapped)
        check(ok_edges and len(snapped) >= 2, "จุดเริ่ม-จบของช่วงที่ snap แล้วลงขอบประโยคจริง")
        check(all(c["snapped_to"] == "sentence" for c in c1[:2]), "ช่วงเด็ดอันดับ 1-2 snap ที่ประโยคทั้งสองด้าน")
        check(any(c["cut_silences"] for c in c1 if overlaps(c, 69, 71.5)),
              "ช่วงเงียบ 69-71.5 กลางช่วงเด็ดถูกแนะนำให้ตัด")
        kws = [w for c in c1 for r in c["reasons"] for w in [r] if r.startswith("คำกระตุ้น")]
        check(len(kws) >= 2, "เหตุผลระบุคำกระตุ้น")
        check(os.path.isfile(os.path.join(tmp, "o1", "candidates.md")), "สร้าง candidates.md")

        print("\n[2] ไม่มีข้อความถอดเสียง (เสียง+ภาพอย่างเดียว)")
        c2 = run_tool(media, os.path.join(tmp, "o2"), "--no-transcribe")
        for c in c2:
            print(f"     #{c['rank']} {c['start']}-{c['end']} score={c['score']} {c['reasons']}")
        check(top_hits_bursts(c2), "อันดับ 1-2 ครอบคลุมช่วงเด็ดทั้งสองช่วง")
        check(no_overlap(c2), "ผู้เข้ารอบไม่ซ้อนทับกัน")
        with open(os.path.join(tmp, "o2", "candidates.md"), encoding="utf-8") as f:
            check("ไม่มีข้อความถอดเสียง" in f.read(), "แจ้งในรายงานว่าไม่มีข้อความถอดเสียง")

        print("\n[3] ตัวอ่านไฟล์ข้อความ")
        srt = "1\n00:00:01,500 --> 00:00:04,000\nสวัสดี\n\n2\n00:01:02,000 --> 00:01:05,250\nฮ่าๆ ตลกมาก\nสองบรรทัด\n"
        segs = mod.parse_srt(srt)
        check(len(segs) == 2 and abs(segs[1]["start"] - 62.0) < 1e-6 and abs(segs[1]["end"] - 65.25) < 1e-6,
              "อ่าน .srt ได้ถูกต้อง")
        wrapped = os.path.join(tmp, "w.json")
        with open(wrapped, "w", encoding="utf-8") as f:
            json.dump({"segments": [{"start": 1, "end": 2, "text": "ทดสอบ"}]}, f, ensure_ascii=False)
        check(len(mod.load_transcript(wrapped)) == 1, "อ่าน JSON ที่มีคีย์ segments ได้")

        print("\n[4] ทดสอบกันบั๊กที่ผู้ตรวจพบ")
        check(mod.fmt_time(59.96) == "0:01:00.0" and mod.fmt_time(3599.97) == "1:00:00.0",
              "fmt_time ไม่พิมพ์ 60.0 วินาที")

        # ข้อความยาว ๆ ติดกัน (ขอบประโยคอยู่ห่างจุดพีค) ต้องไม่ทำให้ช่วงพีคหลุดจากคลิป
        long_segs = [(0, 13)] + [(a, a + 20) for a in range(13, 173, 20)] + [(173, 180)]
        tlong = os.path.join(tmp, "long.json")
        with open(tlong, "w", encoding="utf-8") as f:
            json.dump([{"start": a, "end": b, "text": "ข้อความยาวต่อเนื่องไม่มีจุดหยุด"} for a, b in long_segs], f,
                      ensure_ascii=False)
        c3 = run_tool(media, os.path.join(tmp, "o3"), "--transcript", tlong, "--no-scene")
        check(top_hits_bursts(c3), "ข้อความยาว 20 วินาทีติดกัน: ช่วงเด็ดยังอยู่ในอันดับ 1-2 และอยู่ในคลิป")
        check(all(c["length"] <= 35.0 + 5.0 + 0.6 for c in c3), "ข้อความยาว: ความยาวไม่เกินกำหนด")

        # คลิปไม่ควรมีประโยคข้างเคียงที่แค่แตะขอบจากการเผื่อเวลา
        check("โอเค ผ่านมาได้แล้ว" not in c1[0]["text"] and "ต่อไปเรามาดูอีกด่านหนึ่ง" not in c1[0]["text"],
              "ข้อความในรายงานไม่รวมประโยคข้างเคียงที่แค่แตะขอบ")

        # ไฟล์ที่เสียงเงียบสนิททั้งไฟล์ ต้องไม่ได้ช่วงเด็ดปลอม
        silent = os.path.join(tmp, "silent.mp4")
        run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
             "-f", "lavfi", "-i", "color=c=black:s=160x90:r=10:d=30",
             "-f", "lavfi", "-i", "anullsrc=r=16000:cl=mono", "-t", "30",
             "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", silent])
        r = subprocess.run([sys.executable, "-I", os.path.join(HERE, "find_highlights.py"), silent,
                            "--out", os.path.join(tmp, "o4"), "--no-transcribe", "--no-scene"],
                           capture_output=True)
        check(r.returncode != 0 and "เงียบสนิท" in r.stderr.decode("utf-8", "replace"),
              "เสียงเงียบทั้งไฟล์: หยุดพร้อมแจ้งเตือน ไม่สร้างช่วงเด็ดปลอม")

        # คำกระตุ้นไม่สนตัวพิมพ์เล็ก-ใหญ่
        _s, comps, _kw, _a = mod.score_windows(
            4, 5.0, [-30.0] * 4, [{"start": 0.0, "end": 5.0, "text": "HAHA that was great"}], None,
            ["haha"], {"audio": 0.35, "speech": 0.2, "kw": 0.25, "scene": 0.2})
        check(comps["kw"][0] > 0, "คำกระตุ้นตัวอักษรละตินจับได้แม้ Whisper พิมพ์ใหญ่")

        # แคชข้อความถอดเสียงต้องตรงไฟล์/โมเดล/ภาษา
        cp = os.path.join(tmp, "cache.json")
        meta = mod.cache_meta(media, "small", "th")
        mod.write_cache(cp, meta, [{"start": 1.0, "end": 2.0, "text": "ทดสอบแคช"}])
        check(len(mod.read_cache(cp, meta) or []) == 1, "แคช: ไฟล์/โมเดล/ภาษาตรงกัน ใช้ซ้ำได้")
        check(mod.read_cache(cp, mod.cache_meta(media, "medium", "th")) is None, "แคช: โมเดลต่างกัน ไม่ใช้ซ้ำ")
        check(mod.read_cache(cp, {**meta, "size": meta["size"] + 1}) is None, "แคช: คนละไฟล์ ไม่ใช้ซ้ำ")
        check(not os.path.exists(cp + ".tmp"), "แคช: เขียนแบบอะตอมมิก ไม่ทิ้งไฟล์ชั่วคราว")
        with open(cp, "w", encoding="utf-8") as f:
            f.write('{"video": "x"')  # ไฟล์เขียนไม่จบ
        check(mod.read_cache(cp, meta) is None, "แคช: ไฟล์เสีย/เขียนไม่จบ ไม่ทำให้โปรแกรมล้ม")

    print()
    if check.failed:
        sys.exit(f"ไม่ผ่าน {check.failed} ข้อ")
    print("ผ่านทุกข้อ")


if __name__ == "__main__":
    main()
