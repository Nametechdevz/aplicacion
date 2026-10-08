import type { Metadata } from 'next';
import { NewPromptWizard } from '@/components/wizard/new-prompt-wizard';
import { getTemplate, specFromTemplate } from '@/lib/engine/templates';
import { env } from '@/lib/server/env';
import { getSettings, getUserTemplate } from '@/lib/server/repos/settings';
import { requireUser } from '@/lib/server/session';
import { specSchema } from '@/lib/validation';
import type { ProjectSpec } from '@/lib/engine/types';

export const metadata: Metadata = { title: 'Nuevo prompt' };

export default async function NewPromptPage({ searchParams }: { searchParams: Promise<{ template?: string; mine?: string; idea?: string }> }) {
  const user = await requireUser();
  const settings = getSettings(user.id);
  const sp = await searchParams;
  let initialSpec: ProjectSpec | null = null;
  let templateName: string | undefined;
  if (sp.template) {
    initialSpec = specFromTemplate(sp.template);
    templateName = getTemplate(sp.template)?.name;
  } else if (sp.mine) {
    const tpl = getUserTemplate(user.id, sp.mine);
    const parsed = tpl ? specSchema.safeParse(tpl.spec) : null;
    if (tpl && parsed?.success) {
      initialSpec = { ...(parsed.data as ProjectSpec), templateId: `mine:${tpl.id}` };
      templateName = tpl.name;
    }
  }
  const initialIdea = !initialSpec && typeof sp.idea === 'string' ? sp.idea.slice(0, 4000) : undefined;
  return <NewPromptWizard settings={settings} aiAvailable={env.anthropicConfigured} initialSpec={initialSpec} templateName={templateName} initialIdea={initialIdea} />;
}
