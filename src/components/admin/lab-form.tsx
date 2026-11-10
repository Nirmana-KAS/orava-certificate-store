"use client";

import { ImageUp, LoaderCircle } from "lucide-react";
import { startTransition, useActionState, useEffect, useId, useState } from "react";

import { LabLogo } from "@/components/admin/lab-logo";
import { Field } from "@/components/forms/field";
import { FormAlert } from "@/components/forms/form-alert";
import { Button } from "@/components/ui/button";
import { saveLabAction } from "@/lib/admin/lab-actions";
import { LOGO_BOX_PX, LOGO_MAX_BYTES } from "@/lib/labs";

type Initial = { name: string; shortName: string; website: string; logoSrc: string | null };

/** Shrinks a picked logo to fit the logo box, as WebP (or PNG where WebP can't be made). */
async function prepareLogo(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, LOGO_BOX_PX / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.9),
    );
    if (blob && blob.type === "image/webp") return blob;
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!png) throw new Error("no image");
    return png;
  } finally {
    bitmap.close();
  }
}

export function LabForm({ labId, initial }: { labId: string | null; initial?: Initial }) {
  const [state, action, pending] = useActionState(saveLabAction.bind(null, labId), null);
  const logoId = useId();
  const [logo, setLogo] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [shortName, setShortName] = useState(initial?.shortName ?? "");

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  async function onPick(file: File | undefined) {
    if (!file) return;
    setProblem(null);
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      return setProblem("Choose a PNG, JPEG or WebP image.");
    }
    try {
      const blob = await prepareLogo(file);
      if (blob.size > LOGO_MAX_BYTES)
        return setProblem("This logo is too large even after resizing.");
      setLogo(blob);
      setRemoveLogo(false);
      setPreview(URL.createObjectURL(blob));
    } catch {
      setProblem("This image couldn't be opened. Try another file.");
    }
  }

  const v = (k: "name" | "website") => state?.values?.[k] ?? initial?.[k] ?? "";
  const shown = preview ?? (removeLogo ? null : (initial?.logoSrc ?? null));

  return (
    <form
      noValidate
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        fd.delete("logoPicker");
        if (logo) fd.set("logo", logo, logo.type === "image/webp" ? "logo.webp" : "logo.png");
        if (removeLogo) fd.set("removeLogo", "1");
        startTransition(() => action(fd));
      }}
    >
      <FormAlert state={state} />
      <div className="grid gap-5 md:grid-cols-2">
        <Field
          label="Full name"
          name="name"
          defaultValue={v("name")}
          error={state?.fields?.name}
          hint="For example Asian Institute of Gemological Sciences."
          autoComplete="off"
        />
        <Field
          label="Short name"
          name="shortName"
          value={shortName}
          onChange={(e) => setShortName(e.target.value)}
          error={state?.fields?.shortName}
          hint="Used in type names and file names, for example AIGS."
          autoComplete="off"
        />
      </div>
      <Field
        label="Website (optional)"
        name="website"
        type="url"
        inputMode="url"
        defaultValue={v("website")}
        error={state?.fields?.website}
        autoComplete="off"
      />

      <div className="grid gap-3">
        <p className="text-sm font-medium">Logo</p>
        <div className="flex flex-wrap items-center gap-4">
          <LabLogo src={shown} name={shortName.trim() || "Lab"} size="lg" />
          <div className="grid gap-2">
            <input
              id={logoId}
              name="logoPicker"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={(e) => {
                void onPick(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <Button asChild variant="outline" className="w-full sm:w-auto">
              <label htmlFor={logoId} className="cursor-pointer">
                <ImageUp /> {shown ? "Replace logo" : "Choose logo"}
              </label>
            </Button>
            {shown ? (
              <Button
                type="button"
                variant="ghost"
                className="w-full sm:w-auto"
                onClick={() => {
                  setLogo(null);
                  setPreview(null);
                  setRemoveLogo(true);
                }}
              >
                Remove logo
              </Button>
            ) : null}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          PNG, JPEG or WebP. It is resized on this device before it is saved.
        </p>
        {problem ? <p className="text-sm font-medium text-destructive">{problem}</p> : null}
      </div>

      <Button
        type="submit"
        size="lg"
        disabled={pending}
        className="w-full sm:w-auto sm:justify-self-start"
      >
        {pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
        {labId ? "Save lab" : "Add lab"}
      </Button>
    </form>
  );
}
