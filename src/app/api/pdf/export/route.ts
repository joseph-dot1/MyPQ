import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";
import { supabaseServer, supabaseService } from "@/lib/supabase/server";
import { hasActivePremium } from "@/lib/server/premium";
import type { Question } from "@/lib/types";

export const maxDuration = 60;

// Premium PDF export: print-ready set with the student's full name + phone
// watermarked diagonally on EVERY page (serves photocopy culture, makes leaks
// traceable). Generated once per user+set, cached in storage.
export async function POST(request: Request) {
  const auth = await supabaseServer();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { set_id } = await request.json();
  if (!set_id) return NextResponse.json({ error: "set_id required" }, { status: 400 });

  const db = supabaseService();

  if (!(await hasActivePremium(db, user.id))) {
    return NextResponse.json({ error: "premium_required" }, { status: 403 });
  }

  const signed = async (path: string) => {
    const { data } = await db.storage.from("exports").createSignedUrl(path, 3600);
    return data?.signedUrl ?? null;
  };

  // Cached?
  const { data: cached } = await db
    .from("pdf_exports")
    .select("file_url")
    .eq("user_id", user.id)
    .eq("question_set_id", set_id)
    .maybeSingle();
  if (cached) {
    const url = await signed(cached.file_url);
    if (url) return NextResponse.json({ url, cached: true });
  }

  const [{ data: profile }, { data: set }, { data: questions }] = await Promise.all([
    db.from("users").select("name, phone").eq("id", user.id).single(),
    db
      .from("question_sets")
      .select("*, courses(code, title), sessions(name)")
      .eq("id", set_id)
      .single(),
    db.from("questions").select("*").eq("question_set_id", set_id).order("number"),
  ]);
  if (!set) return NextResponse.json({ error: "Set not found" }, { status: 404 });

  const watermark = `${profile?.name || "MyPQ student"} · ${profile?.phone || user.email || ""}`;
  const bytes = await buildPdf(
    (set as any).courses?.code ?? "",
    (set as any).courses?.title ?? "",
    (set as any).sessions?.name ?? "",
    set.semester,
    (questions ?? []) as Question[],
    watermark
  );

  const path = `${user.id}/${set_id}.pdf`;
  const { error: uploadError } = await db.storage
    .from("exports")
    .upload(path, bytes, { contentType: "application/pdf", upsert: true });
  if (uploadError) return NextResponse.json({ error: "upload_failed" }, { status: 500 });

  await db
    .from("pdf_exports")
    .upsert(
      { user_id: user.id, question_set_id: set_id, file_url: path },
      { onConflict: "user_id,question_set_id" }
    );

  const url = await signed(path);
  return NextResponse.json({ url, cached: false });
}

async function buildPdf(
  code: string,
  title: string,
  sessionName: string,
  semester: string,
  questions: Question[],
  watermark: string
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 595; // A4
  const pageHeight = 842;
  const margin = 56;
  const maxWidth = pageWidth - margin * 2;
  const size = 11;
  const lineHeight = 16;

  let page = doc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const stampWatermark = (p: typeof page) => {
    p.drawText(watermark, {
      x: 60,
      y: 180,
      size: 26,
      font,
      color: rgb(0.11, 0.18, 0.56),
      opacity: 0.14,
      rotate: degrees(35),
    });
    p.drawText(watermark, {
      x: 120,
      y: 520,
      size: 26,
      font,
      color: rgb(0.11, 0.18, 0.56),
      opacity: 0.14,
      rotate: degrees(35),
    });
  };
  stampWatermark(page);

  const newPage = () => {
    page = doc.addPage([pageWidth, pageHeight]);
    stampWatermark(page);
    y = pageHeight - margin;
  };

  const write = (text: string, useFont = font, textSize = size, indent = 0) => {
    for (const paragraph of text.split("\n")) {
      const words = paragraph.split(/\s+/).filter(Boolean);
      let line = "";
      const flush = () => {
        if (y < margin + 20) newPage();
        page.drawText(line, { x: margin + indent, y, size: textSize, font: useFont });
        y -= lineHeight;
        line = "";
      };
      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (useFont.widthOfTextAtSize(candidate, textSize) > maxWidth - indent && line) flush();
        line = line ? `${line} ${word}` : word;
      }
      if (line) flush();
      if (words.length === 0) y -= lineHeight / 2;
    }
  };

  write(`${code} — ${title}`, bold, 15);
  write(`${sessionName} · ${semester} semester · exported from MyPQ`, font, 10);
  y -= lineHeight;

  for (const q of questions) {
    write(`${q.number}. ${q.body_md}`, bold);
    if (q.options) {
      for (const o of q.options) {
        const marker = q.correct_option === o.key ? " ✓" : "";
        write(`${o.key}. ${o.text}${marker}`, font, size, 16);
      }
    }
    if (q.answer_md) write(`Answer: ${q.answer_md}`, font, size, 16);
    if (q.answer_source === "ai_deduced") {
      write("Deduced from course material — verify with your lecturer", font, 9, 16);
    }
    if (q.explanation_md) write(`Explanation: ${q.explanation_md}`, font, 10, 16);
    y -= lineHeight / 2;
  }

  return doc.save();
}
