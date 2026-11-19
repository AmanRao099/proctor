"use client";

import { Input, SectionCard, Segmented, SettingRow, Switch } from "@/components/ui";
import { LEVEL_LABELS, SENSITIVITY_LEVELS, type ProctoringSettings, type SensitivityLevel } from "@/lib/shared/proctoring";

const LEVELS = SENSITIVITY_LEVELS.map((l) => ({ value: l, label: LEVEL_LABELS[l] }));

function NumberInput({ value, onChange, min, max, suffix, disabled, label }: {
  value: number; onChange: (n: number) => void; min: number; max: number; suffix: string; disabled?: boolean; label: string;
}) {
  return (
    <span className="flex items-center gap-2">
      <Input
        type="number"
        aria-label={label}
        min={min}
        max={max}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-9 w-20 text-center tabular"
      />
      <span className="text-[13px] text-muted">{suffix}</span>
    </span>
  );
}

/**
 * Proctoring settings as grouped rows: what is checked on the left, the
 * control on the right. Used by Settings (the defaults) and the test editor.
 */
export function ProctoringForm({
  value, onChange, proctored, setProctored, hideMaster,
}: {
  value: ProctoringSettings;
  onChange: (v: ProctoringSettings) => void;
  proctored: boolean;
  setProctored: (v: boolean) => void;
  hideMaster?: boolean;
}) {
  const set = <K extends keyof ProctoringSettings>(k: K, v: ProctoringSettings[K]) => onChange({ ...value, [k]: v });
  const off = !proctored;
  const sw = (k: keyof ProctoringSettings, label: string) => (
    <Switch label={label} disabled={off} checked={value[k] as boolean} onChange={(v) => set(k, v as never)} />
  );

  return (
    <div className="grid gap-5">
      {hideMaster ? null : (
        <SectionCard title="Proctoring mode" description="Off: no camera or microphone. Fullscreen, tab-switch, paste and shortcut rules still apply, as in MyCodeBud.">
          <SettingRow label="Proctor this test" description="Students pass a camera and microphone check before the paper opens and are watched throughout.">
            <Switch label="Proctor this test" checked={proctored} onChange={setProctored} />
          </SettingRow>
        </SectionCard>
      )}

      <SectionCard title="Violation limit" description="Every signal below records a violation. Reaching the limit hands the test in.">
        <SettingRow label="Violations before automatic hand-in" description="The student sees how many they have left after each one.">
          <NumberInput label="Violation limit" disabled={off} min={1} max={50} value={value.max_violations} onChange={(n) => set("max_violations", n)} suffix="violations" />
        </SettingRow>
      </SectionCard>

      <SectionCard title="Browser" description="What the student can do with the browser while the test is open.">
        <SettingRow label="Require fullscreen" description="Leaving fullscreen is a critical violation, and the paper is covered until they return.">{sw("require_fullscreen", "Require fullscreen")}</SettingRow>
        <SettingRow label="Detect tab and app switches" description="Switching tab, window or app for more than 1.5 seconds.">{sw("tab_switch_enabled", "Detect tab and app switches")}</SettingRow>
        <SettingRow label="Block shortcuts and developer tools" description="New tab, close, reload and developer tools are blocked and recorded.">{sw("block_dev_tools", "Block shortcuts and developer tools")}</SettingRow>
        <SettingRow label="Block right-click" description="Blocked quietly, never a violation, because trackpads right-click by accident.">{sw("block_right_click", "Block right-click")}</SettingRow>
      </SectionCard>

      <SectionCard title="Camera" description="Runs on the student's device. Video never leaves their computer.">
        <SettingRow label="Face presence" description="No face in frame, or looking away for a sustained period.">{sw("face_detection_enabled", "Face presence")}</SettingRow>
        <SettingRow label="Second person in frame">{sw("multi_person_detection_enabled", "Second person in frame")}</SettingRow>
        <SettingRow label="Phone in frame" description="Catches a phone held up to the camera. Downloads a 7 MB model.">{sw("phone_detection_enabled", "Phone in frame")}</SettingRow>
        <SettingRow label="Camera sensitivity" description="Low or Very low suits a computer lab, where other students sit in the background.">
          <Segmented label="Camera sensitivity" disabled={off} value={value.camera_sensitivity} onChange={(v: SensitivityLevel) => set("camera_sensitivity", v)} options={LEVELS} />
        </SettingRow>
        <SettingRow label="No-face grace period" description="How long the face may be out of frame before a warning.">
          <NumberInput label="No-face grace" disabled={off || !value.face_detection_enabled} min={1} max={60} value={value.face_absence_grace_checks} onChange={(n) => set("face_absence_grace_checks", n)} suffix="seconds" />
        </SettingRow>
      </SectionCard>

      <SectionCard title="Microphone" description="Off by default: in a shared room the whole class is audible.">
        <SettingRow label="Sustained talking" description="Speech or noise held for several seconds, not a cough or a dropped pen.">{sw("audio_detection_enabled", "Sustained talking")}</SettingRow>
        <SettingRow label="Microphone sensitivity">
          <Segmented label="Microphone sensitivity" disabled={off || !value.audio_detection_enabled} value={value.mic_sensitivity} onChange={(v: SensitivityLevel) => set("mic_sensitivity", v)} options={LEVELS} />
        </SettingRow>
      </SectionCard>

      <p className="text-xs text-muted">Changes reach students already in a test within 30 seconds. Violations already recorded stand.</p>
    </div>
  );
}
