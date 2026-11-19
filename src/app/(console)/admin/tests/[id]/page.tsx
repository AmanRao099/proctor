import { TestEditor } from "@/components/admin/TestEditor";

export const metadata = { title: "Edit test" };

export default async function EditTestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TestEditor testId={id} />;
}
