import { requireAdminPage } from "@/server/auth/admin";
import { aiConfigured } from "@/server/ai/provider";
import { PageHeader, Card } from "@/components/admin/ui";
import { AiAssistant } from "@/components/admin/ai-assistant";

export default async function AiPage() {
  await requireAdminPage("ai.use");
  return (
    <>
      <PageHeader title="AI business assistant" description="Answers are computed from your database via tools — the assistant cannot invent numbers." />
      {!aiConfigured() && <p className="mb-4 rounded-lg bg-warn-soft p-3 text-sm text-warn">AI_API_KEY is not set — common questions still work using built-in rules.</p>}
      <Card><AiAssistant /></Card>
    </>
  );
}
