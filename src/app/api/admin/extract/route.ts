import { NextResponse } from "next/server";
import { supabaseServer, supabaseService } from "@/lib/supabase/server";
import { extractText } from "@/lib/server/extract";

export const maxDuration = 60;

// Materials pipeline: after upload, extract the PDF text layer, chunk it and
// store rows in material_chunks for AI grounding. OCR for scanned documents
// is stubbed behind the extractor interface (status becomes 'needs_ocr').
export async function POST(request: Request) {
  const auth = await supabaseServer();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const db = supabaseService();
  const { data: profile } = await db.from("users").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { material_id } = await request.json();
  if (!material_id) return NextResponse.json({ error: "material_id required" }, { status: 400 });

  const { data: material } = await db
    .from("materials")
    .select("id, course_id, lecturer_id, file_url")
    .eq("id", material_id)
    .single();
  if (!material) return NextResponse.json({ error: "Material not found" }, { status: 404 });

  const { data: file, error: downloadError } = await db.storage
    .from("materials")
    .download(material.file_url);
  if (downloadError || !file) {
    await db.from("materials").update({ extracted_text_status: "failed" }).eq("id", material_id);
    return NextResponse.json({ error: "download_failed" }, { status: 500 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await extractText(buffer, material.file_url);

  if (result.status !== "extracted") {
    await db
      .from("materials")
      .update({ extracted_text_status: result.status })
      .eq("id", material_id);
    return NextResponse.json({ status: result.status });
  }

  await db.from("material_chunks").delete().eq("material_id", material_id);
  const rows = result.chunks.map((chunk_text, position) => ({
    material_id,
    course_id: material.course_id,
    lecturer_id: material.lecturer_id,
    chunk_text,
    position,
  }));
  if (rows.length) await db.from("material_chunks").insert(rows);
  await db.from("materials").update({ extracted_text_status: "extracted" }).eq("id", material_id);

  return NextResponse.json({ status: "extracted", chunks: rows.length });
}
