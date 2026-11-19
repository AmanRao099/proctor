import { ProctorProvider } from "@/lib/proctor/ProctorProvider";

/*
 * The provider lives here, above both the system check and the paper, so the
 * camera stream and the passed face check survive the client-side navigation
 * from one to the other. A full reload loses them on purpose: the paper then
 * sends the candidate back through the check.
 */
export default function TestLayout({ children }: { children: React.ReactNode }) {
  return <ProctorProvider>{children}</ProctorProvider>;
}
