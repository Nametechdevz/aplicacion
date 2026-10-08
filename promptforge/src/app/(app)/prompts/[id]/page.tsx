import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Workbench } from '@/components/prompt/workbench';
import { env } from '@/lib/server/env';
import { getPrompt } from '@/lib/server/repos/prompts';
import { getSettings } from '@/lib/server/repos/settings';
import { requireUser } from '@/lib/server/session';

export const metadata: Metadata = { title: 'Editor de prompt' };

export default async function PromptPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const prompt = getPrompt(user.id, id);
  if (!prompt) notFound();
  return (
    <Workbench
      key={prompt.id}
      promptId={prompt.id}
      initial={{
        name: prompt.name,
        description: prompt.description,
        tags: prompt.tags,
        variants: prompt.variants,
        activeVariant: prompt.activeVariant,
        spec: prompt.spec,
        favorite: prompt.favorite,
        updatedAt: prompt.updatedAt,
      }}
      settings={getSettings(user.id)}
      aiAvailable={env.anthropicConfigured}
    />
  );
}
