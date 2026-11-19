"use client";

import { Field, Input, Select, Toggle } from "@/components/ui";
import { LEVEL_LABELS, SENSITIVITY_LEVELS, type ProctoringSettings, type SensitivityLevel } from "@/lib/shared/proctoring";

export function ProctoringForm({
  value, onChange, proctored, setProctored, hideMaster,
}: {
  value: ProctoringSettings;
  onChange: (v: ProctoringSettings) => void;
  proctored: boolean;
  setProctored: (v: boolean) => void;
  /** Settings page: the defaults are always "proctored". */
  hideMaster?: boolean;
}) {
  const set = <K extends keyof ProctoringSettings>(k: K, v: ProctoringSettings[K]) => onChange({ ...value, [k]: v });
  const off = !proctored;
  return (
    <div className="grid gap-6">
      {hideMaster ? null : <Toggle
        checked={proctored}
        onChange={setProctored}
        label="Proctor this test"
        description="Off: no camera, no fullscreen lock, no tab-switch strikes. Paste stays blocked."
      />}

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-ui border border-line bg-bg p-4">
          <p className="text-[13px] font-semibold">Browser</p>
          <div className="mt-2 grid">
            <Toggle disabled={off} checked={value.require_fullscreen} onChange={(v) => set("require_fullscreen", v)} label="Require fullscreen" description="Leaving fullscreen is a critical violation." />
            <Toggle disabled={off} checked={value.tab_switch_enabled} onChange={(v) => set("tab_switch_enabled", v)} label="Detect tab and app switches" />
            <Toggle disabled={off} checked={value.block_dev_tools} onChange={(v) => set("block_dev_tools", v)} label="Block shortcuts and developer tools" description="New tab, close, reload and F12 are blocked and recorded." />
            <Toggle disabled={off} checked={value.block_right_click} onChange={(v) => set("block_right_click", v)} label="Block right-click" description="Blocked silently, never a strike (trackpads right-click by accident)." />
          </div>
        </div>

        <div className="rounded-ui border border-line bg-bg p-4">
          <p className="text-[13px] font-semibold">Camera and microphone</p>
          <div className="mt-2 grid">
            <Toggle disabled={off} checked={value.face_detection_enabled} onChange={(v) => set("face_detection_enabled", v)} label="Face presence" description="Warns when no face is in frame, or the candidate looks away for long." />
            <Toggle disabled={off} checked={value.multi_person_detection_enabled} onChange={(v) => set("multi_person_detection_enabled", v)} label="Second person in frame" />
            <Toggle disabled={off} checked={value.phone_detection_enabled} onChange={(v) => set("phone_detection_enabled", v)} label="Phone in frame" description="Catches a phone held up to the camera. Downloads a 7 MB model." />
            <Toggle disabled={off} checked={value.audio_detection_enabled} onChange={(v) => set("audio_detection_enabled", v)} label="Sustained talking" description="Off for shared rooms: the whole lab is audible." />
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Violations before auto hand-in">
          {(id) => <Input id={id} type="number" min={1} max={50} disabled={off} value={value.max_violations} onChange={(e) => set("max_violations", Number(e.target.value))} />}
        </Field>
        <Field label="No-face grace (seconds)">
          {(id) => <Input id={id} type="number" min={1} max={60} disabled={off} value={value.face_absence_grace_checks} onChange={(e) => set("face_absence_grace_checks", Number(e.target.value))} />}
        </Field>
        <Field label="Camera sensitivity" hint="Low or Very low for a computer lab.">
          {(id) => (
            <Select id={id} disabled={off} value={value.camera_sensitivity} onChange={(e) => set("camera_sensitivity", e.target.value as SensitivityLevel)}>
              {SENSITIVITY_LEVELS.map((l) => <option key={l} value={l}>{LEVEL_LABELS[l]}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Microphone sensitivity">
          {(id) => (
            <Select id={id} disabled={off || !value.audio_detection_enabled} value={value.mic_sensitivity} onChange={(e) => set("mic_sensitivity", e.target.value as SensitivityLevel)}>
              {SENSITIVITY_LEVELS.map((l) => <option key={l} value={l}>{LEVEL_LABELS[l]}</option>)}
            </Select>
          )}
        </Field>
      </div>
      <p className="text-xs text-muted">Changes reach candidates already in the test within 30 seconds. Violations already recorded stand.</p>
    </div>
  );
}
